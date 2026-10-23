import { useCallback, useMemo, useState } from 'react';
import type { FieldRef } from '../types/query';

const STORAGE_PREFIX = 'jira-issue-viewer.columns';

// Le choix de colonnes est une préférence d'affichage propre à un utilisateur
// et à une requête : stocké dans le navigateur, jamais côté serveur. Toute
// lecture/écriture peut échouer (navigation privée, stockage bloqué) : on
// retombe alors sur les colonnes par défaut de l'admin.
function readStored(key: string): string[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string') ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(key: string, names: string[] | null): void {
  try {
    if (names === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(names));
  } catch {
    // Préférence non persistée : le choix reste actif pour la session en cours.
  }
}

export interface ColumnPreferences {
  visibleColumns: FieldRef[];
  isCustomized: boolean;
  toggleColumn: (fieldName: string) => void;
  resetColumns: () => void;
}

export function useColumnPreferences(
  userId: string,
  queryId: string,
  defaultColumns: FieldRef[],
  availableColumns: FieldRef[],
): ColumnPreferences {
  const key = `${STORAGE_PREFIX}.${userId}.${queryId}`;
  const [state, setState] = useState(() => ({ key, names: readStored(key) }));

  // Changement de requête (ou d'utilisateur) : on recharge la préférence
  // correspondante pendant le rendu plutôt que dans un effet, pour ne jamais
  // afficher un rendu intermédiaire avec les colonnes de la requête précédente.
  const names = state.key === key ? state.names : readStored(key);
  if (state.key !== key) setState({ key, names });

  const visibleColumns = useMemo(() => {
    if (names === null) return defaultColumns;
    const selected = new Set(names);
    // Ordre = ordre des colonnes disponibles ; les champs devenus
    // indisponibles (onglet masqué, champ retiré par l'admin) sont ignorés.
    return availableColumns.filter((c) => selected.has(c.fieldName));
  }, [names, defaultColumns, availableColumns]);

  const toggleColumn = useCallback(
    (fieldName: string) => {
      const current = names ?? defaultColumns.map((c) => c.fieldName);
      const next = current.includes(fieldName) ? current.filter((n) => n !== fieldName) : [...current, fieldName];
      writeStored(key, next);
      setState({ key, names: next });
    },
    [key, names, defaultColumns],
  );

  const resetColumns = useCallback(() => {
    writeStored(key, null);
    setState({ key, names: null });
  }, [key]);

  return { visibleColumns, isCustomized: names !== null, toggleColumn, resetColumns };
}
