import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FIELDS = ['species', 'length_cm', 'weight_g', 'lure', 'note', 'lake_name'];

function toDto(row) {
  const { weather_json, photo_path, user_id, ...rest } = row;
  return {
    ...rest,
    weather: weather_json ? JSON.parse(weather_json) : null,
    has_photo: Boolean(photo_path),
  };
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function validate(body, { partial }) {
  const errors = [];
  const out = {};
  if (!partial || 'lat' in body) {
    const lat = Number(body.lat), lng = Number(body.lng);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) errors.push('lat/lng ogiltig');
    out.lat = lat;
    out.lng = lng;
  }
  if (!partial || 'species' in body) {
    const s = String(body.species ?? '').trim();
    if (!s || s.length > 60) errors.push('art saknas');
    out.species = s;
  }
  for (const f of ['length_cm', 'weight_g']) {
    if (f in body) {
      const n = num(body[f]);
      if (Number.isNaN(n)) errors.push(`${f} ogiltig`);
      out[f] = n;
    }
  }
  for (const f of ['lure', 'note', 'lake_name']) {
    if (f in body) out[f] = body[f] == null ? null : String(body[f]).slice(0, 500);
  }
  if ('caught_at' in body) {
    const d = new Date(body.caught_at);
    if (Number.isNaN(d.getTime())) errors.push('caught_at ogiltig');
    out.caught_at = d.toISOString();
  }
  if ('weather' in body) out.weather_json = body.weather ? JSON.stringify(body.weather) : null;
  return { errors, out };
}

export function catchRoutes(app, { db, requireUser, photoDir }) {
  mkdirSync(photoDir, { recursive: true });
  const own = (id, userId) =>
    db.prepare('SELECT * FROM catches WHERE id = ? AND user_id = ?').get(id, userId);

  app.get('/api/catches', { preHandler: requireUser }, async (req) => {
    const rows = db
      .prepare('SELECT * FROM catches WHERE user_id = ? ORDER BY caught_at DESC')
      .all(req.user.id);
    return rows.map(toDto);
  });

  app.post('/api/catches', { preHandler: requireUser }, async (req, reply) => {
    const { errors, out } = validate(req.body ?? {}, { partial: false });
    if (errors.length) return reply.code(400).send({ error: errors.join(', ') });
    const row = {
      id: randomUUID(),
      user_id: req.user.id,
      caught_at: new Date().toISOString(),
      length_cm: null, weight_g: null, lure: null, note: null, lake_name: null, weather_json: null,
      ...out,
    };
    db.prepare(
      `INSERT INTO catches (id, user_id, lat, lng, caught_at, species, length_cm, weight_g, lure, note, lake_name, weather_json)
       VALUES (:id, :user_id, :lat, :lng, :caught_at, :species, :length_cm, :weight_g, :lure, :note, :lake_name, :weather_json)`,
    ).run(row);
    return reply.code(201).send(toDto(own(row.id, req.user.id)));
  });

  app.patch('/api/catches/:id', { preHandler: requireUser }, async (req, reply) => {
    if (!own(req.params.id, req.user.id)) return reply.code(404).send({ error: 'hittas inte' });
    const { errors, out } = validate(req.body ?? {}, { partial: true });
    if (errors.length) return reply.code(400).send({ error: errors.join(', ') });
    const keys = Object.keys(out);
    if (keys.length) {
      db.prepare(`UPDATE catches SET ${keys.map((k) => `${k} = :${k}`).join(', ')} WHERE id = :id AND user_id = :user_id`)
        .run({ ...out, id: req.params.id, user_id: req.user.id });
    }
    return toDto(own(req.params.id, req.user.id));
  });

  app.delete('/api/catches/:id', { preHandler: requireUser }, async (req, reply) => {
    const row = own(req.params.id, req.user.id);
    if (!row) return reply.code(404).send({ error: 'hittas inte' });
    db.prepare('DELETE FROM catches WHERE id = ?').run(row.id);
    if (row.photo_path) rmSync(join(photoDir, row.photo_path), { force: true });
    return reply.code(204).send();
  });

  app.post('/api/catches/:id/photo', { preHandler: requireUser }, async (req, reply) => {
    const row = own(req.params.id, req.user.id);
    if (!row) return reply.code(404).send({ error: 'hittas inte' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'fil saknas' });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return reply.code(415).send({ error: 'bara jpeg/png/webp' });
    }
    const buf = await file.toBuffer();
    const name = `${row.id}.${file.mimetype.split('/')[1]}`;
    writeFileSync(join(photoDir, name), buf);
    db.prepare('UPDATE catches SET photo_path = ? WHERE id = ?').run(name, row.id);
    return toDto(own(row.id, req.user.id));
  });

  app.get('/api/catches/:id/photo', { preHandler: requireUser }, async (req, reply) => {
    const row = own(req.params.id, req.user.id);
    if (!row?.photo_path || !existsSync(join(photoDir, row.photo_path))) {
      return reply.code(404).send({ error: 'ingen bild' });
    }
    const ext = row.photo_path.split('.').pop();
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.type(`image/${ext}`).send(readFileSync(join(photoDir, row.photo_path)));
  });
}
