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
const port = Number(process.env.PORT ?? 3000);
await app.listen({ host: '0.0.0.0', port });

// Startmarkor for CI. Deployjobbet pa tillyse letar efter exakt den har raden i
// `docker logs` och faller om den inte dyker upp - se .github/workflows/deploy.yml.
// Andra inte strangen utan att andra READY_MARKER dar.
//
// Raden far bara innehalla ofarlig, fast information: Actions-loggen for det har
// repot ar publik. Ingen anvandardata, inga sokvagar, inga IP-adresser.
console.log(`FISKEAPP_READY sha=${process.env.GIT_SHA ?? 'unknown'} port=${port}`);
