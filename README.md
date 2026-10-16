# 🐟 Fiskeapp

Mobil-först fiskeapp (PWA) där du pinnar fångster på en karta, ser sjö och väder via GPS, och bara du ser din logg. Inloggning med passkeys (Face ID / fingeravtryck / Windows Hello) – inga lösenord.

- `web/` – React + Vite PWA, Leaflet-karta, Open-Meteo (väder), OpenStreetMap (sjönamn)
- `api/` – Fastify + SQLite (`node:sqlite`) + WebAuthn

## Kör med Docker
```sh
docker compose up --build
```
Öppna http://localhost:8080. Data (databas + foton) ligger i volymen `fiskedata`.

## Utveckla lokalt
```sh
cd api && npm i && ORIGIN=http://localhost:5173 npm run dev   # port 3000
cd web && npm i && npm run dev                                # port 5173, proxar /api
```

## Testa på telefon
GPS och passkeys kräver **HTTPS** (utom på localhost). Lägg appen bakom en HTTPS-proxy/tunnel och sätt `ORIGIN=https://din-adress` – passkeys är knutna till domänen.

## Tester
`cd api && npm test`

## Framåt
Fångster har `visibility` (idag alltid `private`) och drag sparas per fångst, så delning med andra (flöde, publika pins) går att lägga till utan att ändra datamodellen.
