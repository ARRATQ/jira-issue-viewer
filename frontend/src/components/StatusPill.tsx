import type { ReactElement } from 'react';
import type { StatusCategory } from '../types/issue';
import './StatusPill.css';

interface StatusPillProps {
  label: string;
  category: StatusCategory | null;
}

// La couleur suit la catégorie Jira (À faire / En cours / Terminé), pas le
// nom du statut : elle reste juste quand un workflow ajoute ou renomme des statuts.
export function StatusPill({ label, category }: StatusPillProps): ReactElement {
  return <span className={`status-pill status-pill--${category ?? 'unknown'}`}>{label}</span>;
}
