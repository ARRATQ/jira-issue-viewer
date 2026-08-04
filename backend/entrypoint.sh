#!/bin/sh
set -e

# Construit DATABASE_URL à partir des variables simples (DB_HOST/DB_PORT/
# DB_USER/DB_PASSWORD/DB_NAME) plutôt que de la recevoir déjà assemblée —
# voir docker-compose.yml pour le pourquoi (interpolation composée non
# fiable sur certaines plateformes de déploiement).
# Toujours reconstruite quand DB_HOST est fourni (pas seulement si
# DATABASE_URL est vide) : l'image contient une valeur factice de
# DATABASE_URL posée au build pour `prisma generate`, qui sinon persisterait
# telle quelle dans le conteneur en cours d'exécution.
if [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
fi

echo "Running Prisma migrations..."
npx prisma migrate deploy --schema ./src/prisma/schema.prisma

echo "Seeding initial admin account (skipped if it already exists)..."
node dist/prisma/seed.js

echo "Starting jira-issue-viewer backend..."
exec node dist/server.js
