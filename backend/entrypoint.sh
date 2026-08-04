#!/bin/sh
set -e

# Construit DATABASE_URL soi-même à partir de DB_USER/DB_PASSWORD/DB_NAME
# plutôt que de la recevoir déjà assemblée depuis docker-compose.yml : sur
# Coolify, ni une variable composée (plusieurs ${...} dans une valeur) ni
# même une valeur statique simple (DB_HOST=db) posée dans `environment:` ne
# se sont transmises fidèlement au conteneur. DB_HOST/DB_PORT sont donc
# codés en dur ici, avec DB_USER/DB_PASSWORD/DB_NAME comme seules variables
# externes nécessaires (celles-là passent bien, ce sont de simples valeurs
# scalaires sans interpolation).
DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Diagnostic (aucun secret affiché) : confirme ce qui est réellement reçu.
if [ -n "$DB_PASSWORD" ]; then DB_PASSWORD_STATUS="set (${#DB_PASSWORD} chars)"; else DB_PASSWORD_STATUS="EMPTY"; fi
echo "DB config -> user='${DB_USER:-<empty>}' name='${DB_NAME:-<empty>}' host='${DB_HOST}' port='${DB_PORT}' password=${DB_PASSWORD_STATUS}"

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

echo "Seeding initial admin account (skipped if it already exists)..."
node dist/prisma/seed.js

echo "Starting jira-issue-viewer backend..."
exec node dist/server.js
