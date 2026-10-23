import type { IssueSummary } from '../types/issue';
import type { FieldRef } from '../types/query';

// Séparateur ";" + BOM UTF-8 : c'est ce qu'Excel en locale française ouvre
// directement, accents compris, sans passer par l'assistant d'import.
const SEPARATOR = ';';
const LINE_BREAK = '\r\n';
const BOM = '﻿';
const FIXED_HEADERS = ['Clé', 'Résumé', 'Statut', 'Type'];

// Une cellule commençant par l'un de ces caractères serait évaluée comme une
// formule par le tableur (injection CSV) : on la préfixe d'une apostrophe.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

function toCell(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const safe = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// Exporte exactement ce que montre le tableau : colonnes fixes puis colonnes
// choisies par l'utilisateur, pour les issues passées (déjà filtrées).
export function buildIssuesCsv(issues: IssueSummary[], columns: FieldRef[]): string {
  const header = [...FIXED_HEADERS, ...columns.map((c) => c.fieldName)].map(toCell).join(SEPARATOR);
  const rows = issues.map((issue) =>
    [
      issue.key,
      issue.summary,
      issue.status,
      issue.issueType,
      ...columns.map((c) => issue.extraFields[c.fieldName]),
    ]
      .map(toCell)
      .join(SEPARATOR),
  );
  return BOM + [header, ...rows].join(LINE_BREAK);
}

function formatLocalDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function csvFileName(queryName: string, date: Date = new Date()): string {
  const slug = queryName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'issues'}-${formatLocalDate(date)}.csv`;
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
