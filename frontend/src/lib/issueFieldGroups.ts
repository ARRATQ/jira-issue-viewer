import type { IssueField } from '../types/issue';

export interface FieldGroupDefinition {
  id: string;
  label: string;
  fieldNames: string[];
}

export interface FieldGroupResult {
  id: string;
  label: string;
  fields: IssueField[];
}

// Onglets métier fixes de la fiche ticket. Les noms listés doivent
// correspondre (à la casse/ponctuation près, cf. normalize()) aux noms de
// champs Jira résolus côté backend via /rest/api/2/field.
export const ISSUE_FIELD_GROUPS: FieldGroupDefinition[] = [
  {
    id: 'infos',
    label: 'Infos',
    fieldNames: [
      'Raison Sociale',
      'Votre entreprise opère dans',
      'Statut Juridique',
      'ICE',
      'N° RC',
      'Siège social',
      'Adresse',
      'Actionnariat 100% privée',
    ],
  },
  {
    id: 'contact',
    label: 'Contact',
    fieldNames: [
      'Genre',
      'Nom du représentant légal',
      'Prénom du représentant légal',
      'Poste du représentant légal',
      'GSM',
      'e-Mail',
    ],
  },
  {
    id: 'activites',
    label: 'Activités',
    fieldNames: ['Activité détaillée', 'Produits', 'Marchés'],
  },
  {
    id: 'besoin',
    label: 'Besoin',
    fieldNames: ["Disposez vous d'un plan d'action à l'export?", 'Profil Export', 'Offre Export', 'EXPO Programme'],
  },
  {
    id: 'realisation',
    label: 'Réalisation et prévision',
    fieldNames: [
      'Produits ciblés pour Export',
      'Pays cibles',
      'Année de référence N',
      '[C] CADH Année N-1',
      '[C] CADH Année N-2',
      "Chiffre d'affaires à l'export N-1",
      "Chiffre d'affaires à l'export N-2",
      "Chiffre d'affaires Export N+1",
      "Chiffre d'affaires Export N+2",
    ],
  },
];

function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s*:\s*$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Répartit les champs renseignés d'une issue dans les onglets métier définis
// ci-dessus (dans l'ordre déclaré par onglet), et regroupe tout champ qui ne
// correspond à aucun d'eux sous un onglet "Autres" — aucun champ renseigné
// n'est jamais silencieusement masqué.
export function groupIssueFields(fields: IssueField[]): FieldGroupResult[] {
  const remaining = new Map(fields.map((f) => [f.id, f]));

  const groups = ISSUE_FIELD_GROUPS.map((group) => {
    const normalizedWanted = group.fieldNames.map(normalize);
    const matched = normalizedWanted
      .map((wanted) => fields.find((f) => normalize(f.name) === wanted))
      .filter((f): f is IssueField => f !== undefined);
    for (const f of matched) remaining.delete(f.id);
    return { id: group.id, label: group.label, fields: matched };
  });

  groups.push({ id: 'autres', label: 'Autres', fields: [...remaining.values()] });

  return groups;
}
