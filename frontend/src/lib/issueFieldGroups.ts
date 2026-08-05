import type { IssueField } from '../types/issue';
import type { QueryTab } from '../types/query';

export interface FieldGroupResult {
  id: string;
  label: string;
  visibleToUser: boolean;
  fields: IssueField[];
}

// Id de l'onglet système "Autres" : toujours ajouté implicitement en fin de
// liste, jamais stocké dans la config d'une requête (seule sa visibilité par
// rôle l'est, via `autresVisibleToUser`).
export const AUTRES_TAB_ID = 'autres';

function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Répartit les champs renseignés d'une issue dans les onglets configurés pour
// la requête courante (dans l'ordre des `position`, puis l'ordre déclaré des
// champs de chaque onglet), et regroupe tout champ ne correspondant à aucun
// onglet sous "Autres" — aucun champ renseigné n'est jamais silencieusement
// masqué. Le matching se fait par nom normalisé (casse/ponctuation), même
// logique que le backend, source de données désormais paramétrée au lieu
// d'une constante statique.
export function groupIssueFields(
  fields: IssueField[],
  tabs: QueryTab[],
  autresVisibleToUser = false,
): FieldGroupResult[] {
  const remaining = new Map(fields.map((f) => [f.id, f]));

  const orderedTabs = [...tabs].sort((a, b) => a.position - b.position);
  const groups: FieldGroupResult[] = orderedTabs.map((tab) => {
    const normalizedWanted = tab.fields.map((ref) => normalize(ref.fieldName));
    const matched = normalizedWanted
      .map((wanted) => fields.find((f) => normalize(f.name) === wanted))
      .filter((f): f is IssueField => f !== undefined);
    for (const f of matched) remaining.delete(f.id);
    return { id: tab.id, label: tab.label, visibleToUser: tab.visibleToUser, fields: matched };
  });

  groups.push({
    id: AUTRES_TAB_ID,
    label: 'Autres',
    visibleToUser: autresVisibleToUser,
    fields: [...remaining.values()],
  });

  return groups;
}
