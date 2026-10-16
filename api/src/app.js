import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { openDb } from './db.js';
import { authRoutes } from './auth.js';
import { catchRoutes } from './catches.js';

export function buildApp(config) {
  mkdirSync(dirname(config.dbFile), { recursive: true });
  const db = openDb(config.dbFile);
  const app = Fastify({ logger: config.logger ?? false, trustProxy: true });
  app.register(cookie);
  app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  app.register(async (scope) => {
    const requireUser = authRoutes(scope, { ...config, db });
    catchRoutes(scope, { db, requireUser, photoDir: config.photoDir });
  });
  app.decorate('db', db);
  app.get('/api/health', async () => ({ ok: true }));
  app.addHook('onClose', async () => db.close());
  return app;
}
