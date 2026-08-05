import { Router } from 'express';
import { Readable } from 'node:stream';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { JiraClient } from '../lib/jira';
import { getJiraClientConfig } from '../services/config';
import { getQueryById, listQueriesSummary } from '../services/savedQueries';
import { logAction } from '../services/audit';

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

    const client = new JiraClient(await getJiraClientConfig());
    const extraFieldNames = savedQuery.listColumns.map((c) => c.fieldName);
    const issues = await client.searchIssues(savedQuery.jql, extraFieldNames);

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
      issues,
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
