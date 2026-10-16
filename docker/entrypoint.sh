#!/bin/sh
# En container, två processer: nginx (publik, :80) och Fastify-API:t
# (loopback, :3000). Dör någon av dem avslutas containern så att compose
# restart-policyn startar om hela paketet i stället för att lämna en halv app
# som svarar 502.
set -eu

stop_both() {
    kill "${api_pid:-}" "${nginx_pid:-}" 2>/dev/null || true
}
trap stop_both TERM INT

node /app/src/server.js &
api_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

while kill -0 "$api_pid" 2>/dev/null && kill -0 "$nginx_pid" 2>/dev/null; do
    sleep 5
done

stop_both
wait 2>/dev/null || true
exit 1
