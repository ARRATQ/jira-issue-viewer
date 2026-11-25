import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { JiraClient } from '../lib/jira';
import { getJiraClientConfig } from '../services/config';
import { getQueryById } from '../services/savedQueries';
import { logAction } from '../services/audit';
import { fetchIssueAttachments, planExport } from '../services/attachmentExport';
import {
  ExportBusyError,
  cancelExportJob,
  listExportJobs,
  startExportJob,
  toJobView,
} from '../services/exportJobs';

// Monté sous adminRouter (authMiddleware + requireAdmin déjà appliqués).
// L'archive est construite en tâche de fond sur le disque du serveur (voir
// services/exportJobs.ts), puis téléchargée via routes/downloads.ts.
export const attachmentExportsRouter = Router();

// Lance l'export de toutes les pièces jointes des tickets d'une requête
// (ADMIN : pas de filtre par rapporteur). Les vérifications rapides sont
// faites ici pour renvoyer des erreurs JSON ; la collecte des métadonnées
// Jira et la construction du zip ont lieu dans la tâche.
attachmentExportsRouter.post(
  '/queries/:queryId/attachments-export',
  asyncHandler(async (req, res) => {
    const savedQuery = await getQueryById(req.params.queryId!);
    if (!savedQuery) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }
    if (!savedQuery.jql) {
      res.status(400).json({ error: "Aucune requête JQL n'est configurée pour cette vue" });
      return;
    }

    // Recherche non mise en cache : l'export doit refléter l'état actuel.
    const client = new JiraClient(await getJiraClientConfig());
    const { issues, total } = await client.searchIssues(savedQuery.jql);
    // Un export partiel serait trompeur pour la plateforme cible : on refuse
    // plutôt que d'omettre silencieusement des tickets.
    if (issues.length < total) {
      res.status(422).json({
        error: `La requête renvoie ${total} tickets, au-delà de la limite de ${issues.length} : affinez le JQL pour exporter en plusieurs fois.`,
      });
      return;
    }
    const keysWithAttachments = issues.filter((i) => i.attachmentCounts.all > 0).map((i) => i.key);
    if (keysWithAttachments.length === 0) {
      res.status(404).json({ error: 'Aucune pièce jointe à exporter pour cette requête' });
      return;
    }

    let job;
    try {
      job = startExportJob({
        userId: req.user!.sub,
        queryId: savedQuery.id,
        queryName: savedQuery.name,
        jql: savedQuery.jql,
        loadEntries: async () => planExport(await fetchIssueAttachments(client, keysWithAttachments)),
        openStream: (a) => client.getAttachmentStream(a.contentUrl),
      });
    } catch (err) {
      if (err instanceof ExportBusyError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }

    await logAction({
      userId: req.user!.sub,
      action: 'EXPORT_ATTACHMENTS',
      entityType: 'saved_query',
      entityKey: savedQuery.id,
      details: { jql: savedQuery.jql, issueCount: keysWithAttachments.length, jobId: job.id },
      req,
    });

    res.status(202).json(toJobView(job));
  }),
);

// État de tous les exports (en cours et terminés), interrogé périodiquement
// par l'écran Admin › Requêtes pour afficher la progression.
attachmentExportsRouter.get('/attachments-exports', (_req, res) => {
  res.json({ exports: listExportJobs().map(toJobView) });
});

// Annule un export en cours, ou supprime un export terminé et son fichier.
attachmentExportsRouter.delete(
  '/attachments-exports/:id',
  asyncHandler(async (req, res) => {
    const removed = await cancelExportJob(req.params.id!);
    if (!removed) {
      res.status(404).json({ error: 'Export introuvable' });
      return;
    }
    res.status(204).end();
  }),
);
