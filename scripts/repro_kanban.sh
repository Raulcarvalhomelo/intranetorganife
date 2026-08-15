#!/usr/bin/env bash
set -u
cd /home/ubuntu/intranetorganife
tmp=$(mktemp -d)
mkdir -p "$tmp/logs" "$tmp/snapshots"
ORGANIFE_DATABASE_DIR="$tmp" PORT=14567 node server/backend/app.js >"$tmp/out" 2>"$tmp/err" &
pid=$!
sleep 2
curl -sS -i -X POST http://127.0.0.1:14567/api/kanban/card -H 'Content-Type: application/json' --data '{"id":"test-card","title":"Test","status":"todo","updatedAt":1000}'
printf '\n--- STDOUT ---\n'
cat "$tmp/out"
printf '\n--- STDERR ---\n'
cat "$tmp/err"
kill "$pid" 2>/dev/null || true
rm -rf "$tmp"
