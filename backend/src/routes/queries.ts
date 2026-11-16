import { Router } from 'express';
import { Readable } from 'node:stream';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { JiraClient } from '../lib/jira';
import { getJiraClientConfig } from '../services/config';
import { availableColumnsFor, getQueryById, listQueriesSummary } from '../services/savedQueries';
import { searchIssuesCached } from '../services/issueSearch';
import { logAction } from '../services/audit';
import {
  ATTACHMENT_COUNT_COLUMN,
  visibleAttachmentsFor,
  writeAttachmentsZip,
  zipFileName,
} from '../services/attachmentArchive';

export const queriesRouter = Router();

queriesRouter.use(authMiddleware);

// Liste des requêtes sauvegardées, pour construire la navigation — tous
// rôles authentifiés (pas juste ADMIN, contrairement à leur gestion).
queriesRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ queries: await listQueriesSummary() });
  }),
);

queriesRouter.get(
  '/:queryId/issues',
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

    const role = req.user!.role;
    const fieldColumns = availableColumnsFor(savedQuery, role);
    const extraFieldNames = fieldColumns.map((c) => c.fieldName);
    const { issues: rawIssues, total } = await searchIssuesCached(
      await getJiraClientConfig(),
      savedQuery.jql,
      extraFieldNames,
    );
    // Colonne calculée "Nombre de pièces jointes", ajoutable au tableau comme
    // n'importe quel champ (tri, filtre, export) : sa valeur rejoint
    // extraFields et respecte la même règle de visibilité que le drawer.
    const availableColumns = [...fieldColumns, { fieldName: ATTACHMENT_COUNT_COLUMN }];
    const issues = rawIssues.map(({ attachmentCounts, ...issue }) => ({
      ...issue,
      extraFields: {
        ...issue.extraFields,
        [ATTACHMENT_COUNT_COLUMN]: String(role === 'ADMIN' ? attachmentCounts.all : attachmentCounts.fromReporter),
      },
    }));

    await logAction({
      userId: req.user!.sub,
      action: 'VIEW_LIST',
      entityType: 'saved_query',
      entityKey: savedQuery.id,
      details: { jql: savedQuery.jql },
      req,
    });

    res.json({
      queryId: savedQuery.id,
      queryName: savedQuery.name,
      jql: savedQuery.jql,
      listColumns: savedQuery.listColumns,
      // Colonnes que l'utilisateur peut ajouter/retirer du tableau ; leurs
      // valeurs sont déjà présentes dans `issues[].extraFields`.
      availableColumns,
      // Onglets + visibilité "Autres" livrés avec la liste pour que le drawer
      // de détail soit pilotable par les données sans requête supplémentaire
      // (le résumé GET /api/queries ne porte que id/nom/position).
      tabs: savedQuery.tabs,
      autresVisibleToUser: savedQuery.autresVisibleToUser,
      issues,
      // total > issues.length quand Jira renvoie plus d'issues que le plafond
      // (voir SEARCH_MAX_ISSUES) : le frontend le signale à l'utilisateur.
      total,
      truncated: issues.length < total,
    });
  }),
);

queriesRouter.get(
  '/:queryId/issues/:key',
  asyncHandler(async (req, res) => {
    const savedQuery = await getQueryById(req.params.queryId!);
    if (!savedQuery) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }

    const client = new JiraClient(await getJiraClientConfig());
    const fieldsMeta = await client.getFieldsMeta();
    const issue = await client.getIssue(req.params.key!, fieldsMeta);

    await logAction({
      userId: req.user!.sub,
      action: 'VIEW_ISSUE',
      entityType: 'issue',
      entityKey: issue.key,
      details: { queryId: savedQuery.id },
      req,
    });

    res.json(issue);
  }),
);

// Toutes les pièces jointes visibles d'un ticket, en une archive zip
// streamée. La visibilité par rôle est appliquée ici (pas seulement dans le
// drawer) pour que l'archive ne contienne jamais plus que ce qu'affiche l'UI.
queriesRouter.get(
  '/:queryId/issues/:key/attachments.zip',
  asyncHandler(async (req, res) => {
    const savedQuery = await getQueryById(req.params.queryId!);
    if (!savedQuery) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }

    const issueKey = req.params.key!;
    const client = new JiraClient(await getJiraClientConfig());
    const { attachments, reporterId } = await client.getAttachmentsWithReporter(issueKey);
    const visible = visibleAttachmentsFor(req.user!.role, attachments, reporterId);
    if (visible.length === 0) {
      res.status(404).json({ error: 'Aucune pièce jointe à télécharger' });
      return;
    }

    await logAction({
      userId: req.user!.sub,
      action: 'DOWNLOAD_ATTACHMENTS_ZIP',
      entityType: 'issue',
      entityKey: issueKey,
      details: {
        queryId: savedQuery.id,
        count: visible.length,
        filenames: visible.map((a) => a.filename),
      },
      req,
    });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName(issueKey)}"`);

    try {
      await writeAttachmentsZip(visible, (a) => client.getAttachmentStream(a.contentUrl), res);
    } catch (err) {
      // Les en-têtes (200) sont déjà partis : impossible de renvoyer une
      // erreur JSON. On coupe la connexion pour que le client voie un
      // téléchargement en échec plutôt qu'un zip tronqué mais "valide".
      console.error(`[attachments.zip] ${issueKey}:`, err);
      res.destroy(err instanceof Error ? err : undefined);
    }
  }),
);

queriesRouter.get(
  '/:queryId/issues/:key/attachments/:id',
  asyncHandler(async (req, res) => {
    const savedQuery = await getQueryById(req.params.queryId!);
    if (!savedQuery) {
      res.status(404).json({ error: 'Requête introuvable' });
      return;
    }

    const client = new JiraClient(await getJiraClientConfig());
    const attachments = await client.getAttachments(req.params.key!);
    const attachment = attachments.find((a) => a.id === req.params.id);
    if (!attachment) {
      res.status(404).json({ error: 'Pièce jointe introuvable' });
      return;
    }

    const stream = await client.getAttachmentStream(attachment.contentUrl);

    await logAction({
      userId: req.user!.sub,
      action: 'DOWNLOAD_ATTACHMENT',
      entityType: 'attachment',
      entityKey: attachment.id,
      details: { queryId: savedQuery.id, issueKey: req.params.key, filename: attachment.filename },
      req,
    });

    res.setHeader('Content-Type', stream.contentType ?? attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    if (stream.contentLength) res.setHeader('Content-Length', String(stream.contentLength));

    Readable.fromWeb(stream.body as never).pipe(res);
  }),
);
