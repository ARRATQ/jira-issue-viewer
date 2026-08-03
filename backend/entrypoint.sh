#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

echo "Seeding initial admin account (skipped if it already exists)..."
node dist/prisma/seed.js

echo "Starting jira-issue-viewer backend..."
exec node dist/server.js
