import { useCallback, useState } from 'react';

const STORAGE_PREFIX = 'jira-issue-viewer.density';

export type Density = 'comfortable' | 'compact';

// Préférence d'affichage propre à l'utilisateur, commune à toutes les
// requêtes ; stockage navigateur, avec repli silencieux s'il est indisponible.
function readStored(key: string): Density {
  try {
    return localStorage.getItem(key) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return 'comfortable';
  }
}

export interface DensityPreference {
  density: Density;
  setDensity: (density: Density) => void;
}

export function useDensity(userId: string): DensityPreference {
  const key = `${STORAGE_PREFIX}.${userId}`;
  const [state, setState] = useState(() => ({ key, density: readStored(key) }));

  const density = state.key === key ? state.density : readStored(key);
  if (state.key !== key) setState({ key, density });

  const setDensity = useCallback(
    (next: Density) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // Préférence non persistée : le choix reste actif pour la session en cours.
      }
      setState({ key, density: next });
    },
    [key],
  );

  return { density, setDensity };
}
