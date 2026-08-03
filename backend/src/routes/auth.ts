import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/tokens';
import { logAction } from '../services/audit';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { validatePasswordStrength } from '../lib/passwordPolicy';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password, acceptedConfidentiality } = req.body as {
    email?: string;
    password?: string;
    acceptedConfidentiality?: boolean;
  };
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }
  if (acceptedConfidentiality !== true) {
    res.status(400).json({ error: 'Vous devez accepter la mention de confidentialité pour vous connecter' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !user.active || !passwordMatches) {
    if (user) {
      await logAction({ userId: user.id, action: 'LOGIN_FAILED', req, details: { email } });
    }
    res.status(401).json({ error: 'Identifiants invalides' });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id });

  await logAction({ userId: user.id, action: 'LOGIN', req });

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

authRouter.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token requis' });
    return;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) {
      res.status(401).json({ error: 'Utilisateur introuvable ou désactivé' });
      return;
    }
    const accessToken = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Refresh token invalide ou expiré' });
  }
});

authRouter.patch(
  '/password',
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Mot de passe actuel et nouveau mot de passe requis' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    if (!user) {
      res.status(401).json({ error: 'Utilisateur introuvable' });
      return;
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      res.status(400).json({ error: 'Mot de passe actuel incorrect' });
      return;
    }

    try {
      validatePasswordStrength(newPassword);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Mot de passe invalide' });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    await logAction({ userId: user.id, action: 'CHANGE_PASSWORD', req });

    res.json({ success: true });
  }),
);
