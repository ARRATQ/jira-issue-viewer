import { Router } from 'express';
import { Readable } from 'node:stream';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { JiraClient } from '../lib/jira';
import { getJiraClientConfig, getJql } from '../services/config';
import { logAction } from '../services/audit';

export const issuesRouter = Router();

issuesRouter.use(authMiddleware);

issuesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const jql = await getJql();
    if (!jql) {
      res.status(400).json({ error: "Aucune requête JQL n'est configurée" });
      return;
    }

    const client = new JiraClient(await getJiraClientConfig());
    const issues = await client.searchIssues(jql);

    await logAction({ userId: req.user!.sub, action: 'VIEW_LIST', entityType: 'jql', details: { jql }, req });

    res.json({ jql, issues });
  }),
);

issuesRouter.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const client = new JiraClient(await getJiraClientConfig());
    const fieldsMeta = await client.getFieldsMeta();
    const issue = await client.getIssue(req.params.key!, fieldsMeta);

    await logAction({
      userId: req.user!.sub,
      action: 'VIEW_ISSUE',
      entityType: 'issue',
      entityKey: issue.key,
      req,
    });

    res.json(issue);
  }),
);

issuesRouter.get(
  '/:key/attachments/:id',
  asyncHandler(async (req, res) => {
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
      details: { issueKey: req.params.key, filename: attachment.filename },
      req,
    });

    res.setHeader('Content-Type', stream.contentType ?? attachment.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.filename)}"`);
    if (stream.contentLength) res.setHeader('Content-Length', String(stream.contentLength));

    Readable.fromWeb(stream.body as never).pipe(res);
  }),
);
