import type { SortState } from './issueTable';

// Période d'un filtre de date, bornes "AAAA-MM-JJ" incluses ('' = ouverte).
export interface DateRange {
  from: string;
  to: string;
}

export const OPEN_RANGE: DateRange = { from: '', to: '' };

// Vue du tableau partageable par lien : tout ce qui change les lignes
// affichées (filtres, recherche, tri, page). Les préférences d'affichage
// propres à l'utilisateur (colonnes, largeurs, densité) restent hors URL.
export interface IssueListView {
  search: string;
  status: string;
  // Filtres des colonnes dynamiques, indexés par nom de champ.
  columnFilters: Record<string, string>;
  dateFilters: Record<string, DateRange>;
  sort: SortState | null;
  page: number;
  pageSize: number;
}

export const DEFAULT_VIEW: Omit<IssueListView, 'pageSize'> = {
  search: '',
  status: '',
  columnFilters: {},
  dateFilters: {},
  sort: null,
  page: 1,
};

// Paramètres d'URL, en français comme le reste de l'interface : un lien
// partagé reste lisible (?statut=Done&f.Profil=Avancé&du.Created=…).
const PARAM = {
  search: 'q',
  status: 'statut',
  sort: 'tri',
  direction: 'ordre',
  page: 'page',
  pageSize: 'parPage',
} as const;
const COLUMN_PREFIX = 'f.';
const FROM_PREFIX = 'du.';
const TO_PREFIX = 'au.';
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function positiveInt(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= 1 ? value : null;
}

// Une URL est une entrée utilisateur : toute valeur invalide est ignorée
// (retour à la valeur par défaut) plutôt que de casser l'affichage.
export function parseView(params: URLSearchParams, pageSizes: readonly number[]): IssueListView {
  const columnFilters: Record<string, string> = {};
  const dateFilters: Record<string, DateRange> = {};
  for (const [name, value] of params) {
    if (name.startsWith(COLUMN_PREFIX) && value) {
      columnFilters[name.slice(COLUMN_PREFIX.length)] = value;
      continue;
    }
    const bound = name.startsWith(FROM_PREFIX) ? 'from' : name.startsWith(TO_PREFIX) ? 'to' : null;
    if (!bound || !ISO_DAY.test(value)) continue;
    const field = name.slice(bound === 'from' ? FROM_PREFIX.length : TO_PREFIX.length);
    dateFilters[field] = { ...(dateFilters[field] ?? OPEN_RANGE), [bound]: value };
  }

  const sortColumn = params.get(PARAM.sort);
  const requestedSize = positiveInt(params.get(PARAM.pageSize));
  return {
    search: params.get(PARAM.search) ?? '',
    status: params.get(PARAM.status) ?? '',
    columnFilters,
    dateFilters,
    sort: sortColumn
      ? { column: sortColumn, direction: params.get(PARAM.direction) === 'desc' ? 'desc' : 'asc' }
      : null,
    page: positiveInt(params.get(PARAM.page)) ?? 1,
    pageSize: requestedSize !== null && pageSizes.includes(requestedSize) ? requestedSize : pageSizes[0]!,
  };
}

// N'écrit que ce qui s'écarte de la vue par défaut, pour garder des liens courts.
export function serializeView(view: IssueListView, defaultPageSize: number): URLSearchParams {
  const params = new URLSearchParams();
  if (view.search.trim()) params.set(PARAM.search, view.search);
  if (view.status) params.set(PARAM.status, view.status);
  for (const [field, value] of Object.entries(view.columnFilters)) {
    if (value) params.set(`${COLUMN_PREFIX}${field}`, value);
  }
  for (const [field, range] of Object.entries(view.dateFilters)) {
    if (range.from) params.set(`${FROM_PREFIX}${field}`, range.from);
    if (range.to) params.set(`${TO_PREFIX}${field}`, range.to);
  }
  if (view.sort) {
    params.set(PARAM.sort, view.sort.column);
    params.set(PARAM.direction, view.sort.direction);
  }
  if (view.page > 1) params.set(PARAM.page, String(view.page));
  if (view.pageSize !== defaultPageSize) params.set(PARAM.pageSize, String(view.pageSize));
  return params;
}
