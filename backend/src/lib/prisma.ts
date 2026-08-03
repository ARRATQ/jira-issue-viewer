import { PrismaClient } from '@prisma/client';

// Instance unique partagée par toute l'app (évite d'épuiser le pool de
// connexions Postgres en créant un client par requête).
export const prisma = new PrismaClient();
