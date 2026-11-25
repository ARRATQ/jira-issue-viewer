// Miroir de ExportJobView (backend/src/services/exportJobs.ts).
export type AttachmentExportStatus = 'preparing' | 'running' | 'done' | 'failed';

export interface AttachmentExport {
  id: string;
  queryId: string;
  queryName: string;
  status: AttachmentExportStatus;
  totalFiles: number;
  totalBytes: number;
  doneFiles: number;
  failedFiles: number;
  processedBytes: number;
  zipBytes: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
  downloadUrl: string | null;
}
