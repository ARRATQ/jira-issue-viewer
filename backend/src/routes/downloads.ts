import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { prisma } from '../lib/prisma';
import { findJobByDownloadToken } from '../services/exportJobs';

// Téléchargements natifs du navigateur (lien <a href>) : pas d'en-tête
// Authorization possible. L'accès repose sur le jeton aléatoire (256 bits)
// de l'export, connu seulement des admins via GET /api/admin/attachments-exports,
// et valable tant que le fichier existe (24 h). Il n'est pas à usage unique :
// le navigateur doit pouvoir reprendre un téléchargement interrompu.
export const downloadsRouter = Router();

downloadsRouter.get(
  '/attachments-export/:token',
  asyncHandler(async (req, res) => {
    const job = findJobByDownloadToken(req.params.token!);
    if (!job?.filePath) {
      res.status(404).json({ error: 'Export introuvable ou expiré : relancez-le depuis Admin › Requêtes.' });
      return;
    }
    // L'admin qui a lancé l'export doit toujours être un admin actif.
    const user = await prisma.user.findUnique({ where: { id: job.userId }, select: { role: true, active: true } });
    if (!user || !user.active || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }

    if (!req.headers.range) {
      // eslint-disable-next-line no-console
      console.info(`[attachments-export] job=${job.id} téléchargement (${job.zipBytes} octets)`);
    }
    // res.download gère Content-Length, Accept-Ranges et les requêtes Range
    // (reprise d'un téléchargement coupé par un proxy ou le réseau).
    res.download(job.filePath, job.fileName, { headers: { 'Content-Type': 'application/zip' } }, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Fichier d’export introuvable' });
    });
  }),
);
