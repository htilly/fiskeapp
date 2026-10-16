import { randomUUID, randomBytes, createHash } from 'node:crypto';
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse,
} from '@simplewebauthn/server';

const CHALLENGE_TTL = 5 * 60 * 1000;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL = 10 * 60 * 1000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = (len) => Array.from(randomBytes(len), (b) => ALPHABET[b & 31]).join('');
const normalizeToken = (t) => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashToken = (t) => createHash('sha256').update(normalizeToken(t)).digest('hex');
const groupCode = (c) => c.match(/.{1,4}/g).join('-');

function deviceLabel(ua = '') {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Okänd enhet';
}

export function authRoutes(app, { db, rpID, rpName, origin, secureCookies }) {
  const cookieOpts = { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies };

  const newChallenge = (reply, data) => {
    const id = randomUUID();
    db.prepare('DELETE FROM challenges WHERE expires_at < ?').run(Date.now());
    db.prepare('INSERT INTO challenges (id, challenge, name, user_id, ref, expires_at) VALUES (?,?,?,?,?,?)')
      .run(id, data.challenge, data.name ?? null, data.user_id ?? null, data.ref ?? null, Date.now() + CHALLENGE_TTL);
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

  const insertCredential = (req, userId, c) =>
    db.prepare('INSERT INTO credentials (id, user_id, public_key, counter, transports, label, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(c.id, userId, c.publicKey, c.counter, JSON.stringify(c.transports ?? []),
        deviceLabel(req.headers['user-agent']), new Date().toISOString());

  // Replaces any previous recovery code; the plain code is only ever returned here.
  const issueRecovery = (userId) => {
    const code = randomCode(16);
    db.prepare("DELETE FROM enroll_tokens WHERE user_id = ? AND kind = 'recovery'").run(userId);
    db.prepare("INSERT INTO enroll_tokens (hash, user_id, kind, expires_at) VALUES (?,?,'recovery',NULL)")
      .run(hashToken(code), userId);
    return groupCode(code);
  };

  const findToken = (token) => {
    const row = db.prepare('SELECT * FROM enroll_tokens WHERE hash = ?').get(hashToken(token));
    if (!row) return null;
    if (row.expires_at && row.expires_at < Date.now()) {
      db.prepare('DELETE FROM enroll_tokens WHERE hash = ?').run(row.hash);
      return null;
    }
    return row;
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
    insertCredential(req, ch.user_id, c);
    const recoveryCode = issueRecovery(ch.user_id);
    startSession(reply, ch.user_id);
    return { id: ch.user_id, name: ch.name, recoveryCode };
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
    db.prepare('UPDATE credentials SET counter = ?, last_used_at = ? WHERE id = ?')
      .run(v.authenticationInfo.newCounter, new Date().toISOString(), cred.id);
    startSession(reply, cred.user_id);
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(cred.user_id);
    return user;
  });

  // Add a passkey to an existing account, using either a device invite link
  // (made while logged in) or the recovery code.
  app.post('/api/auth/enroll/options', async (req, reply) => {
    const row = findToken(req.body?.token);
    if (!row) return reply.code(400).send({ error: 'koden är ogiltig eller har gått ut' });
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(row.user_id);
    const existing = db.prepare('SELECT id, transports FROM credentials WHERE user_id = ?').all(user.id);
    const options = await generateRegistrationOptions({
      rpName, rpID, userName: user.name, userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((c) => ({ id: c.id, transports: JSON.parse(c.transports ?? '[]') })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    newChallenge(reply, { challenge: options.challenge, user_id: user.id, ref: row.hash });
    return options;
  });

  app.post('/api/auth/enroll/verify', async (req, reply) => {
    const ch = takeChallenge(req, reply);
    if (!ch?.ref) return reply.code(400).send({ error: 'utmaningen har gått ut' });
    const row = db.prepare('SELECT * FROM enroll_tokens WHERE hash = ?').get(ch.ref);
    if (!row || row.user_id !== ch.user_id || (row.expires_at && row.expires_at < Date.now())) {
      return reply.code(400).send({ error: 'koden är ogiltig eller har gått ut' });
    }
    let v;
    try {
      v = await verifyRegistrationResponse({
        response: req.body, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID,
      });
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    if (!v.verified) return reply.code(400).send({ error: 'kunde inte verifiera' });
    insertCredential(req, ch.user_id, v.registrationInfo.credential);
    db.prepare('DELETE FROM enroll_tokens WHERE hash = ?').run(row.hash);
    // A used recovery code is gone; hand out a fresh one so the account is never left without.
    const recoveryCode = row.kind === 'recovery' ? issueRecovery(ch.user_id) : undefined;
    startSession(reply, ch.user_id);
    const user = db.prepare('SELECT id, name FROM users WHERE id = ?').get(ch.user_id);
    return { ...user, recoveryCode };
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

  async function requireUser(req, reply) {
    const user = lookupUser(req);
    if (!user) return reply.code(401).send({ error: 'inte inloggad' });
    req.user = user;
  }

  app.post('/api/auth/devices/invite', { preHandler: requireUser }, async (req) => {
    const token = randomCode(20);
    const expiresAt = Date.now() + INVITE_TTL;
    db.prepare("DELETE FROM enroll_tokens WHERE kind = 'invite' AND (user_id = ? OR expires_at < ?)").run(req.user.id, Date.now());
    db.prepare("INSERT INTO enroll_tokens (hash, user_id, kind, expires_at) VALUES (?,?,'invite',?)")
      .run(hashToken(token), req.user.id, expiresAt);
    return { token, expiresAt };
  });

  app.get('/api/auth/devices', { preHandler: requireUser }, async (req) =>
    db.prepare('SELECT id, label, created_at, last_used_at FROM credentials WHERE user_id = ? ORDER BY created_at').all(req.user.id));

  app.patch('/api/auth/devices/:id', { preHandler: requireUser }, async (req, reply) => {
    const label = String(req.body?.label ?? '').trim().slice(0, 40);
    if (!label) return reply.code(400).send({ error: 'ange ett namn' });
    const r = db.prepare('UPDATE credentials SET label = ? WHERE id = ? AND user_id = ?').run(label, req.params.id, req.user.id);
    return r.changes ? reply.code(204).send() : reply.code(404).send({ error: 'hittades inte' });
  });

  app.delete('/api/auth/devices/:id', { preHandler: requireUser }, async (req, reply) => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?').get(req.user.id);
    if (n <= 1) return reply.code(400).send({ error: 'du kan inte ta bort din sista nyckel' });
    const r = db.prepare('DELETE FROM credentials WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    return r.changes ? reply.code(204).send() : reply.code(404).send({ error: 'hittades inte' });
  });

  app.post('/api/auth/recovery', { preHandler: requireUser }, async (req) => ({ recoveryCode: issueRecovery(req.user.id) }));

  return requireUser;
}
