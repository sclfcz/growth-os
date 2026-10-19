#!/bin/sh
set -eu
if [ ! -f .next/standalone/server.js ]; then
  echo 'Run pnpm build before pnpm test:e2e.' >&2
  exit 1
fi
mkdir -p .next/standalone/.next
rm -rf .next/standalone/.next/static .next/standalone/public
cp -R .next/static .next/standalone/.next/static
cp -R public .next/standalone/public
DATABASE_PATH="$(pwd)/data/growth.db" HOSTNAME=localhost PORT=3000 exec node --env-file=.env .next/standalone/server.js
