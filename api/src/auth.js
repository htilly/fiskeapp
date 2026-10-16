import { randomUUID, randomBytes } from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

export function authRoutes(app, { db, rpID, rpName, origin, secureCookies }) {
  const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies };

  const newChallenge = (reply, data) => {
    const id = randomUUID();
    db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO challenges (id, challenge, name, user_id, expires_at) VALUES (?,?,?,?,?)')
      .run(id, data.challenge, data.name ?? null, data.user_id ?? null, Date.now() + CHALLENGE_TTL);
    reply.setCookie('fa_chal', id, { ...cookieOpts, maxAge: CHALLENGE_TTL / 1000 });
  };
  const takeChallenge = (req, reply) => {
    const id = req.cookies.fa_chal;
    reply.clearCookie('fa_chal', { path: '/' });
    if (!id) return null;
    const row = db.prepare('SELECT * FROM challenges WHERE id = ? AND expires_at > ?').get(id, Date.now());
    db.prepare('DELETE FROM challenges WHERE id = ?').run(id);
    return row ?? null;
  };
  const startSession = (reply, userId) => {
    const sid = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').run(sid, userId, Date.now() + SESSION_TTL);
    reply.setCookie('fa_sid', sid, { ...cookieOpts, maxAge: SESSION_TTL / 1000 });
  };

  app.post('/api/auth/register/options', async (req, reply) => {
    const name = String(req.body?.name ?? '').trim().slice(0, 40);
    if (!name) return reply.code(400).send({ error: 'välj ett smeknamn' });
    const userId = randomUUID();
    const options = await generateRegistrationOptions({
      rpName, rpID, userName: name, userID: new TextEncoder().encode(userId),
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    newChallenge(reply, { challenge: options.challenge, name, user_id: userId });
    return options;
  });

  app.post('/api/auth/register/verify', async (req, reply) => {
    const ch = takeChallenge(req, reply);
    if (!ch) return reply.code(400).send({ error: 'utmaningen har gått ut' });
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: req.body, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
      });
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    if (!v.verified) return reply.code(400).send({ error: 'kunde inte verifiera' });
    const c = v.registrationInfo.credential;
    db.prepare('INSERT INTO users (id, name) VALUES (?,?)').run(ch.user_id, ch.name);
    db.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports) VALUES (?,?,?,?,?)')
      .run(c.id, ch.user_id, c.publicKey, c.counter, JSON.stringify(c.transports ?? []));
    startSession(reply, ch.user_id);
    return { id: ch.user_id, name: ch.name };
  });

  app.post('/api/auth/login/options', async (req, reply) => {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' });
    newChallenge(reply, { challenge: options.challenge });
    return options;
  });

  app.post('/api/auth/login/verify', async (req, reply) => {
    const ch = takeChallenge(req, reply);
    if (!ch) return reply.code(400).send({ error: 'utmaningen har gått ut' });
    const cred = db.prepare('SELECT * FROM credentials WHERE id = ?').get(req.body?.id);
    if (!cred) return reply.code(400).send({ error: 'okänd nyckel' });
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: req.body, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
        credential: {
          id: cred.id, publicKey: new Uint8Array(cred.public_key), counter: cred.counter,
          transports: JSON.parse(cred.transports ?? '[]'),
        },
      });
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    if (!v.verified) return reply.code(400).send({ error: 'kunde inte verifiera' });
    db.prepare('UPDATE credentials SET counter = ? WHERE id = ?').run(v.authenticationInfo.newCounter, cred.id);
    startSession(reply, cred.user_id);
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(cred.user_id);
    return user;
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const sid = req.cookies.fa_sid;
    if (sid) db.prepare('DELETE FROM sessions WHERE id = ?').run(sid);
    reply.clearCookie('fa_sid', { path: '/' });
    return reply.code(204).send();
  });

  app.get('/api/me', async (req, reply) => {
    const user = lookupUser(req);
    if (!user) return reply.code(401).send({ error: 'inte inloggad' });
    return user;
  });

  function lookupUser(req) {
    const sid = req.cookies.fa_sid;
    if (!sid) return null;
    return db.prepare(
      `SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    ).get(sid, Date.now()) ?? null;
  }

  return async function requireUser(req, reply) {
    const user = lookupUser(req);
    if (!user) return reply.code(401).send({ error: 'inte inloggad' });
    req.user = user;
  };
}
