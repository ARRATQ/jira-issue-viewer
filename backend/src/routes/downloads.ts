import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { JiraClient } from '../lib/jira';
import { prisma } from '../lib/prisma';
import { getJiraClientConfig } from '../services/config';
import { logAction } from '../services/audit';
import { ExportAbortedError, exportZipFileName, writeExportZip } from '../services/attachmentExport';
import { consumeExportTicket } from '../services/exportTickets';

// Téléchargements natifs du navigateur (lien <a href>) : pas d'en-tête
// Authorization possible, l'accès repose sur un jeton à usage unique émis
// à un admin authentifié (POST /api/admin/queries/:id/attachments-export).
export const downloadsRouter = Router();

downloadsRouter.get(
  '/attachments-export/:token',
  asyncHandler(async (req, res) => {
    const ticket = consumeExportTicket(req.params.token!);
    if (!ticket) {
      res.status(404).json({ error: 'Lien de téléchargement invalide ou expiré : relancez l’export.' });
      return;
    }
    // Le jeton est court, mais on revérifie que son émetteur est toujours un
    // admin actif au moment où le téléchargement commence.
    const user = await prisma.user.findUnique({ where: { id: ticket.userId }, select: { role: true, active: true } });
    if (!user || !user.active || user.role !== 'ADMIN') {
      res.status(403).json({ error: 'Accès interdit' });
      return;
    }

    const { entries } = ticket;
    const issueCount = new Set(entries.map((e) => e.issueKey)).size;
    const totalBytes = entries.reduce((sum, e) => sum + e.attachment.size, 0);

    await logAction({
      userId: ticket.userId,
      action: 'EXPORT_ATTACHMENTS',
      entityType: 'saved_query',
      entityKey: ticket.queryId,
      details: { jql: ticket.jql, issueCount, fileCount: entries.length },
      req,
    });

    const client = new JiraClient(await getJiraClientConfig());
    const tag = `[attachments-export] query=${ticket.queryId}`;
    const startedAt = Date.now();
    const elapsed = (): string => `${Math.round((Date.now() - startedAt) / 1000)}s`;
    // eslint-disable-next-line no-console
    console.info(`${tag} début : ${issueCount} tickets, ${entries.length} fichiers, ${totalBytes} octets`);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${exportZipFileName(ticket.queryName)}"`);
    // Demande aux proxys (nginx…) de relayer le flux sans le mettre en
    // tampon sur disque : l'archive peut dépasser plusieurs Go.
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const result = await writeExportZip(entries, (a) => client.getAttachmentStream(a.contentUrl), res);
      // eslint-disable-next-line no-console
      console.info(`${tag} terminé en ${elapsed()} : ${result.written} fichiers, ${result.failed.length} en échec`);
      for (const f of result.failed) {
        // eslint-disable-next-line no-console
        console.warn(`${tag} fichier ignoré ${f.issueKey}/${f.filename} : ${f.reason}`);
      }
    } catch (err) {
      if (err instanceof ExportAbortedError) {
        // eslint-disable-next-line no-console
        console.warn(`${tag} interrompu après ${elapsed()} : connexion fermée par le client ou un proxy`);
        return;
      }
      // En-têtes déjà envoyés : on coupe la connexion pour que le client voie
      // un échec plutôt qu'une archive tronquée mais "valide".
      console.error(`${tag} échec après ${elapsed()} :`, err);
      res.destroy(err instanceof Error ? err : undefined);
    }
  }),
);
