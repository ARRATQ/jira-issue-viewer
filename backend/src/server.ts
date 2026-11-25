import 'dotenv/config';
import { createApp } from './app';
import { resetExportDir, startExportSweeper } from './services/exportJobs';

const port = Number(process.env.PORT ?? 3001);
const app = createApp();

// Exports de pièces jointes : les tâches vivent en mémoire, leurs fichiers
// orphelins d'un précédent démarrage sont supprimés ; nettoyage horaire des
// exports de plus de 24 h.
resetExportDir().catch((err: unknown) => console.error('[attachments-export] initialisation :', err));
startExportSweeper();

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`jira-issue-viewer backend listening on port ${port}`);
});
