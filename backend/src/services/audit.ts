import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'VIEW_LIST'
  | 'VIEW_ISSUE'
  | 'DOWNLOAD_ATTACHMENT'
  | 'UPDATE_CONFIG'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DEACTIVATE_USER'
  | 'RESET_PASSWORD'
  | 'CHANGE_PASSWORD'
  | 'SAVE_QUERY'
  | 'DELETE_QUERY';

export interface LogActionParams {
  userId: string;
  action: AuditAction;
  entityType?: string;
  entityKey?: string;
  details?: Prisma.InputJsonValue;
  req?: Request;
}

function clientIp(req?: Request): string | undefined {
  if (!req) return undefined;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]?.trim();
  }
  return req.socket.remoteAddress ?? undefined;
}

export async function logAction(params: LogActionParams): Promise<void> {
  const { userId, action, entityType, entityKey, details, req } = params;
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityKey,
      details,
      ipAddress: clientIp(req),
    },
  });
}
