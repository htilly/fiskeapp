import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp } from '../src/app.js';

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'fa-'));
  const app = buildApp({
    origin: 'http://localhost:8080', rpID: 'localhost', rpName: 'T', secureCookies: false,
    dbFile: join(dir, 't.db'), photoDir: join(dir, 'photos'),
  });
  const login = (id, name) => {
    app.db.prepare('INSERT INTO users (id, name) VALUES (?,?)').run(id, name);
    app.db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)').run(`s-${id}`, id, Date.now() + 1e6);
    return { cookie: `fa_sid=s-${id}` };
  };
  return { app, login };
}

test('kräver inloggning', async () => {
  const { app } = setup();
  assert.equal((await app.inject('/api/catches')).statusCode, 401);
  assert.equal((await app.inject('/api/me')).statusCode, 401);
});

test('skapa, lista och radera egen fångst', async () => {
  const { app, login } = setup();
  const h = login('u1', 'Kalle');
  const res = await app.inject({
    method: 'POST', url: '/api/catches', headers: h,
    payload: { lat: 59.3, lng: 18.0, species: 'Gädda', length_cm: 72, weather: { temp: 14 }, lake_name: 'Mälaren' },
  });
  assert.equal(res.statusCode, 201);
  const c = res.json();
  assert.equal(c.visibility, 'private');
  assert.deepEqual(c.weather, { temp: 14 });
  const list = (await app.inject({ url: '/api/catches', headers: h })).json();
  assert.equal(list.length, 1);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/catches/${c.id}`, headers: h })).statusCode, 204);
});

test('andra användare ser och ändrar aldrig mina fångster', async () => {
  const { app, login } = setup();
  const a = login('a', 'A'), b = login('b', 'B');
  const c = (await app.inject({
    method: 'POST', url: '/api/catches', headers: a, payload: { lat: 1, lng: 1, species: 'Abborre' },
  })).json();
  assert.deepEqual((await app.inject({ url: '/api/catches', headers: b })).json(), []);
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/catches/${c.id}`, headers: b, payload: { species: 'x' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/catches/${c.id}`, headers: b })).statusCode, 404);
  assert.equal((await app.inject({ url: `/api/catches/${c.id}/photo`, headers: b })).statusCode, 404);
});

test('validerar indata', async () => {
  const { app, login } = setup();
  const h = login('u', 'U');
  const r = await app.inject({ method: 'POST', url: '/api/catches', headers: h, payload: { lat: 200, lng: 0, species: '' } });
  assert.equal(r.statusCode, 400);
});

test('enhetslista, sista nyckeln skyddas och byte av namn', async () => {
  const { app, login } = setup();
  const h = login('u', 'U');
  const addCred = (id) => app.db.prepare('INSERT INTO credentials (id, user_id, public_key, counter, label, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, 'u', new Uint8Array([1]), 0, 'iPhone', new Date().toISOString());
  addCred('c1');
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/auth/devices/c1', headers: h })).statusCode, 400);
  addCred('c2');
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/auth/devices/c2', headers: h, payload: { label: 'Padda' } })).statusCode, 204);
  const list = (await app.inject({ url: '/api/auth/devices', headers: h })).json();
  assert.deepEqual(list.map((d) => d.label), ['iPhone', 'Padda']);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/auth/devices/c1', headers: h })).statusCode, 204);
});

test('andra kan inte röra mina enheter', async () => {
  const { app, login } = setup();
  const a = login('a', 'A'), b = login('b', 'B');
  for (const id of ['x1', 'x2']) {
    app.db.prepare('INSERT INTO credentials (id, user_id, public_key, counter) VALUES (?,?,?,?)').run(id, 'a', new Uint8Array([1]), 0);
  }
  assert.deepEqual((await app.inject({ url: '/api/auth/devices', headers: b })).json(), []);
  app.db.prepare('INSERT INTO credentials (id, user_id, public_key, counter) VALUES (?,?,?,?)').run('y1', 'b', new Uint8Array([1]), 0);
  app.db.prepare('INSERT INTO credentials (id, user_id, public_key, counter) VALUES (?,?,?,?)').run('y2', 'b', new Uint8Array([1]), 0);
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/auth/devices/x1', headers: b })).statusCode, 404);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/devices/invite' })).statusCode, 401);
  assert.ok(a);
});

test('inbjudan: giltig kod ger registreringsval, fel eller utgången kod nekas', async () => {
  const { app, login } = setup();
  const h = login('u', 'U');
  const { token } = (await app.inject({ method: 'POST', url: '/api/auth/devices/invite', headers: h, payload: {} })).json();
  assert.match(token, /^[A-Z2-9]{20}$/);
  const bad = await app.inject({ method: 'POST', url: '/api/auth/enroll/options', payload: { token: 'NOPE' } });
  assert.equal(bad.statusCode, 400);
  const ok = await app.inject({ method: 'POST', url: '/api/auth/enroll/options', payload: { token } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().user.name, 'U');
  app.db.prepare('UPDATE enroll_tokens SET expires_at = ?').run(Date.now() - 1);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/enroll/options', payload: { token } })).statusCode, 400);
});

test('återställningskod ersätts vid ny och fungerar som enroll-token', async () => {
  const { app, login } = setup();
  const h = login('u', 'U');
  const first = (await app.inject({ method: 'POST', url: '/api/auth/recovery', headers: h, payload: {} })).json().recoveryCode;
  const second = (await app.inject({ method: 'POST', url: '/api/auth/recovery', headers: h, payload: {} })).json().recoveryCode;
  assert.match(second, /^([A-Z2-9]{4}-){3}[A-Z2-9]{4}$/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/enroll/options', payload: { token: first } })).statusCode, 400);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/enroll/options', payload: { token: second.toLowerCase() } })).statusCode, 200);
});
