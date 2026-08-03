import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { getBranding } from '../services/config';

// Route publique (pas d'authMiddleware) : le nom de l'app et le logo
// doivent s'afficher dès la page de login, avant toute authentification.
// Contenu non sensible, à la différence du reste de /api/admin/config.
export const brandingRouter = Router();

brandingRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await getBranding());
  }),
);
