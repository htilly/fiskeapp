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
