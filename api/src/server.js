import { buildApp } from './app.js';

const origin = process.env.ORIGIN ?? 'http://localhost:8080';
const dataDir = process.env.DATA_DIR ?? './data';
const app = buildApp({
  logger: true,
  origin,
  rpID: process.env.RP_ID ?? new URL(origin).hostname,
  rpName: 'Fiskeapp',
  secureCookies: origin.startsWith('https://'),
  dbFile: `${dataDir}/fiskeapp.db`,
  photoDir: `${dataDir}/photos`,
});
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) });
