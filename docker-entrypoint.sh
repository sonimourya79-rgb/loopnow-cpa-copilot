#!/bin/sh
# Applies any pending migrations against the live database before the server
# starts — `migrate deploy` is the production-safe command (applies existing
# migration files, never generates new ones or prompts), unlike `migrate dev`
# which is a local-development-only command.
set -e

echo "Applying database migrations..."
node node_modules/prisma/build/index.js migrate deploy

echo "Seeding GIFI catalogue (idempotent — safe on every restart)..."
node node_modules/tsx/dist/cli.mjs prisma/seed.ts

echo "Starting server..."
exec "$@"
