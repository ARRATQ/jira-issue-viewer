import { useEffect, useId, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { FieldRef } from '../types/query';
import './ColumnPicker.css';

interface ColumnPickerProps {
  availableColumns: FieldRef[];
  visibleColumns: FieldRef[];
  isCustomized: boolean;
  onToggle: (fieldName: string) => void;
  onReset: () => void;
}

// Menu déroulant de cases à cocher : l'utilisateur choisit, parmi les champs
// qu'il a le droit de voir, ceux affichés en colonne (et donc exportés).
export function ColumnPicker({
  availableColumns,
  visibleColumns,
  isCustomized,
  onToggle,
  onReset,
}: ColumnPickerProps): ReactElement {
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const visibleNames = new Set(visibleColumns.map((c) => c.fieldName));

  useEffect(() => {
    if (!isOpen) return undefined;
    function onPointerDown(event: MouseEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="column-picker" ref={rootRef}>
      <button
        type="button"
        className="column-picker__trigger"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((v) => !v)}
      >
        Colonnes
        <span className="column-picker__count">
          {visibleColumns.length}/{availableColumns.length}
        </span>
      </button>

      {isOpen && (
        <div id={panelId} className="column-picker__panel" role="group" aria-label="Colonnes affichées">
          {availableColumns.length === 0 ? (
            <p className="column-picker__empty">Aucun champ supplémentaire disponible.</p>
          ) : (
            <ul className="column-picker__list">
              {availableColumns.map((col) => (
                <li key={col.fieldName}>
                  <label className="column-picker__option">
                    <input
                      type="checkbox"
                      checked={visibleNames.has(col.fieldName)}
                      onChange={() => onToggle(col.fieldName)}
                    />
                    {col.fieldName}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {isCustomized && (
            <button type="button" className="column-picker__reset" onClick={onReset}>
              Rétablir les colonnes par défaut
            </button>
          )}
        </div>
      )}
    </div>
  );
}
