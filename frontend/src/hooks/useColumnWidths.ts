import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'jira-issue-viewer.widths';
export const MIN_COLUMN_WIDTH = 60;
export const MAX_COLUMN_WIDTH = 800;

// Largeurs en pixels indexées par colonne (identifiant fixe ou nom de champ) ;
// une colonne absente garde sa largeur automatique.
export type ColumnWidths = Record<string, number>;

function clampWidth(width: number): number {
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
}

// Même contrat que les préférences de colonnes : préférence locale au
// navigateur, et un stockage illisible ou bloqué ramène aux largeurs auto.
function readStored(key: string): ColumnWidths {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
        .map(([column, width]) => [column, clampWidth(width)]),
    );
  } catch {
    return {};
  }
}

function writeStored(key: string, widths: ColumnWidths): void {
  try {
    if (Object.keys(widths).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(widths));
  } catch {
    // Préférence non persistée : les largeurs restent actives pour la session en cours.
  }
}

export interface ColumnWidthsState {
  widths: ColumnWidths;
  setWidth: (column: string, width: number) => void;
  resetWidth: (column: string) => void;
}

export function useColumnWidths(userId: string, queryId: string): ColumnWidthsState {
  const key = `${STORAGE_PREFIX}.${userId}.${queryId}`;
  const [state, setState] = useState(() => ({ key, widths: readStored(key) }));

  // Changement de requête ou d'utilisateur : rechargement pendant le rendu,
  // comme pour useColumnPreferences.
  const widths = state.key === key ? state.widths : readStored(key);
  if (state.key !== key) setState({ key, widths });

  const setWidth = useCallback(
    (column: string, width: number) => {
      setState((prev) => {
        const next = { ...(prev.key === key ? prev.widths : readStored(key)), [column]: clampWidth(width) };
        writeStored(key, next);
        return { key, widths: next };
      });
    },
    [key],
  );

  const resetWidth = useCallback(
    (column: string) => {
      setState((prev) => {
        const { [column]: _removed, ...next } = prev.key === key ? prev.widths : readStored(key);
        writeStored(key, next);
        return { key, widths: next };
      });
    },
    [key],
  );

  return { widths, setWidth, resetWidth };
}
