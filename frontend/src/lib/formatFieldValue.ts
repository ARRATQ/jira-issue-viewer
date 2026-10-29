import { formatDisplayDate, isoDatePart } from './dateValues';

export function formatFieldValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  // Dates Jira (champ date ou datetime) : affichées sans l'heure, comme dans la liste.
  if (typeof value === 'string' && isoDatePart(value)) return formatDisplayDate(value);
  return String(value);
}
