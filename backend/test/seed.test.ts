import { describe, expect, it, beforeEach } from 'vitest';
import { createFakePrisma } from './helpers/fakePrisma';
import { seedAdmin } from '../src/prisma/seed';

const fakePrisma = createFakePrisma();

beforeEach(() => {
  fakePrisma.reset();
  process.env.ADMIN_EMAIL = 'admin@example.com';
  process.env.ADMIN_NAME = 'Administrateur';
});

describe('seedAdmin', () => {
  it('creates the admin account when a strong ADMIN_PASSWORD is provided', async () => {
    process.env.ADMIN_PASSWORD = 'Str0ng!Pass';
    await seedAdmin(fakePrisma);
    const created = [...fakePrisma.__state.users.values()].find((u) => u.email === 'admin@example.com');
    expect(created).toMatchObject({ role: 'ADMIN', active: true });
  });

  it('throws when ADMIN_PASSWORD does not meet the strength policy and no admin exists yet', async () => {
    process.env.ADMIN_PASSWORD = 'weak';
    await expect(seedAdmin(fakePrisma)).rejects.toThrow(/mot de passe/i);
  });

  it('does not re-validate or crash when the admin account already exists, even with a weak env password', async () => {
    // Régression : la validation doit s'exécuter APRÈS le contrôle "déjà
    // existant", sinon un ADMIN_PASSWORD non conforme laissé dans l'env
    // ferait planter le conteneur à chaque redémarrage, même quand le
    // compte a déjà été créé lors d'un déploiement précédent.
    await fakePrisma.user.create({
      data: { email: 'admin@example.com', name: 'Administrateur', passwordHash: 'irrelevant', role: 'ADMIN' },
    });

    process.env.ADMIN_PASSWORD = 'weak';
    await expect(seedAdmin(fakePrisma)).resolves.toBeUndefined();
  });
});
