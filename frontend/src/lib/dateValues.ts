import type { IssueSummary } from '../types/issue';

// Jira renvoie ses dates en ISO : "2026-10-28" (champ date) ou
// "2026-10-28T23:00:37.887+0100" (champ datetime, ex. Created). On garde la
// partie date telle quelle plutôt que de passer par `Date`, qui la décalerait
// selon le fuseau du navigateur.
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// Partie "AAAA-MM-JJ" d'une valeur ISO, ou null si ce n'est pas une date.
// Ce format se compare directement en chaîne, ce qu'exploite le filtre du/au.
export function isoDatePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = ISO_DATE.exec(value);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export function formatDisplayDate(value: string): string {
  const iso = isoDatePart(value);
  if (!iso) return value;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

// Une colonne est traitée comme une date si toutes ses valeurs renseignées le
// sont : l'API ne transmet pas le type des champs, seulement leurs valeurs.
export function isDateColumn(issues: IssueSummary[], fieldName: string): boolean {
  let hasValue = false;
  for (const issue of issues) {
    const value = issue.extraFields[fieldName];
    if (!value) continue;
    if (!isoDatePart(value)) return false;
    hasValue = true;
  }
  return hasValue;
}
