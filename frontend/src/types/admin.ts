export interface PublicConfig {
  jiraUrl: string | null;
  jql: string;
  tlsRejectUnauthorized: boolean;
  patConfigured: boolean;
}

export interface Branding {
  appName: string;
  logoDataUrl: string | null;
  confidentialityNotice: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityKey: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
  user: { email: string; name: string } | null;
}

export interface AuditLogsResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}
