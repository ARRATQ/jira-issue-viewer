import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, type Prisma } from '@prisma/client';
import { validatePasswordStrength } from '../lib/passwordPolicy';
import { migrateLegacyQueryIfNeeded } from '../services/legacyQueryMigration';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export interface SeedablePrisma {
  user: {
    findUnique: (args: { where: { email: string } }) => Promise<{ id: string } | null>;
    create: (args: { data: Prisma.UserCreateInput }) => Promise<unknown>;
  };
}

export async function seedAdmin(prisma: SeedablePrisma): Promise<void> {
  const email = required('ADMIN_EMAIL');
  const password = required('ADMIN_PASSWORD');
  const name = process.env.ADMIN_NAME ?? 'Administrateur';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin account already exists for ${email}, skipping seed.`);
    return;
  }

  // Uniquement validé à la création : une fois le compte créé, un
  // ADMIN_PASSWORD non conforme laissé dans l'environnement ne doit plus
  // jamais faire planter le démarrage du conteneur.
  validatePasswordStrength(password);

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    // Compte admin initial (installation neuve) : le mot de passe vient de
    // l'environnement, il doit être remplacé à la première connexion.
    data: { email, passwordHash, name, role: 'ADMIN', active: true, mustChangePassword: true },
  });
  console.log(`Seeded initial admin account: ${email}`);
}

/* eslint-disable @typescript-eslint/no-require-imports */
if (require.main === module) {
  const prisma = new PrismaClient();
  seedAdmin(prisma)
    .then(() => migrateLegacyQueryIfNeeded())
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
