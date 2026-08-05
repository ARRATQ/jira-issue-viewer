import { getConfigValue } from './config';
import { countQueries, createQuery, type FieldRef, type QueryTab } from './savedQueries';

// Reprend exactement les 5 onglets métier figés de la v1
// (frontend/src/lib/issueFieldGroups.ts) et les 2 colonnes de liste
// figées (backend/src/lib/jira.ts:LIST_EXTRA_FIELDS), pour préserver le
// comportement actuel sans action admin au moment du passage aux requêtes
// multiples.
const LEGACY_TABS: Array<{ id: string; label: string; visibleToUser: boolean; fieldNames: string[] }> = [
  {
    id: 'infos',
    label: 'Infos',
    visibleToUser: true,
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
    visibleToUser: true,
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
    visibleToUser: true,
    fieldNames: ['Activité détaillée', 'Produits', 'Marchés'],
  },
  {
    id: 'besoin',
    label: 'Besoin',
    visibleToUser: true,
    fieldNames: ["Disposez vous d'un plan d'action à l'export?", 'Profil Export', 'Offre Export', 'EXPO Programme'],
  },
  {
    id: 'realisation',
    label: 'Réalisation et prévision',
    visibleToUser: false,
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

const LEGACY_LIST_COLUMN_NAMES = ['Profil Export', 'Offre Export'];

function toFieldRef(fieldName: string): FieldRef {
  return { fieldName };
}

function buildLegacyTabs(): QueryTab[] {
  return LEGACY_TABS.map((tab, index) => ({
    id: tab.id,
    label: tab.label,
    position: index,
    visibleToUser: tab.visibleToUser,
    fields: tab.fieldNames.map(toFieldRef),
  }));
}

// Idempotent : ne fait rien si au moins une SavedQuery existe déjà (déploiements
// suivants). Ne dépend jamais d'un accès Jira (les champs sont référencés par
// nom, résolus plus tard au moment de l'affichage) — ne doit jamais faire
// échouer le démarrage du conteneur, y compris si aucun JQL n'était configuré.
export async function migrateLegacyQueryIfNeeded(): Promise<void> {
  const existingCount = await countQueries();
  if (existingCount > 0) {
    console.log('Des requêtes existent déjà, migration legacy ignorée.');
    return;
  }

  const jql = (await getConfigValue('jql')) ?? process.env.JIRA_JQL ?? '';

  await createQuery({
    name: 'Requête 1',
    jql,
    position: 0,
    listColumns: LEGACY_LIST_COLUMN_NAMES.map(toFieldRef),
    tabs: buildLegacyTabs(),
    autresVisibleToUser: false,
  });

  console.log('Migration legacy : JQL et onglets existants repris dans "Requête 1".');
}
