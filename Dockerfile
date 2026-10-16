# Fiskeapp som EN image: nginx servar den byggda PWA:n på :80 och proxar /api/
# vidare till Fastify-API:t på 127.0.0.1:3000 inuti samma container.
#
# VARFÖR en image och inte två: på tillyse körs det här som en enda
# compose-tjänst bakom SWAG (127.0.0.1:8891 -> 80). web/Dockerfile och
# api/Dockerfile finns kvar för `docker compose up` vid lokal utveckling.
#
# Byggs av .github/workflows/docker-image.yml och pushas till
# ghcr.io/htilly/fiskeapp:main - bygg inte den här på servern.

# --- 1. bygg frontend (tsc --noEmit + vite build) ----------------------------
FROM node:24-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# --- 2. produktionsberoenden för API:t ---------------------------------------
FROM node:24-alpine AS api-deps
WORKDIR /api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev

# --- 3. runtime: nginx + node i samma container ------------------------------
FROM node:24-alpine
RUN apk add --no-cache nginx && mkdir -p /run/nginx

WORKDIR /app
COPY --from=api-deps /api/node_modules ./node_modules
COPY api/package.json ./package.json
COPY api/src ./src
COPY --from=web-build /web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/http.d/default.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# DATA_DIR rymmer både SQLite-filen och uppladdade foton.
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000
VOLUME /data
EXPOSE 80

ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

CMD ["/usr/local/bin/entrypoint.sh"]
