import { randomBytes } from 'node:crypto';
import type { ExportEntry } from './attachmentExport';

// Jetons de téléchargement à usage unique pour l'export des pièces jointes.
//
// L'export peut peser plusieurs Go : il doit être téléchargé nativement par
// le navigateur (écrit sur disque au fil de l'eau), pas via XHR en mémoire.
// Un téléchargement natif ne peut pas porter l'en-tête Authorization : l'admin
// authentifié obtient donc un jeton opaque, court (2 min) et consommé au
// premier usage, qui transporte aussi le plan d'export déjà calculé.
//
// Stockage en mémoire : suffisant pour un backend unique ; un redémarrage
// invalide simplement les jetons en cours (l'admin relance l'export).

const TICKET_TTL_MS = 2 * 60_000;
const MAX_TICKETS = 20;

export interface ExportTicketPayload {
  userId: string;
  queryId: string;
  queryName: string;
  jql: string;
  entries: readonly ExportEntry[];
}

interface StoredTicket {
  payload: ExportTicketPayload;
  expiresAt: number;
}

const tickets = new Map<string, StoredTicket>();

function purgeExpired(now: number): void {
  for (const [token, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(token);
  }
}

export function createExportTicket(payload: ExportTicketPayload): string {
  const now = Date.now();
  purgeExpired(now);
  // Borne la mémoire (chaque plan peut lister des milliers de fichiers) :
  // on évince le plus ancien jeton encore valide.
  if (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value!);
  const token = randomBytes(32).toString('base64url');
  tickets.set(token, { payload, expiresAt: now + TICKET_TTL_MS });
  return token;
}

export function consumeExportTicket(token: string): ExportTicketPayload | null {
  const ticket = tickets.get(token);
  if (!ticket) return null;
  tickets.delete(token);
  return ticket.expiresAt > Date.now() ? ticket.payload : null;
}

export function clearExportTickets(): void {
  tickets.clear();
}
