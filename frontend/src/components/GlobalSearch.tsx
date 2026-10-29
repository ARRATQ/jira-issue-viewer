import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import './GlobalSearch.css';

interface GlobalSearchProps {
  value: string;
  onChange: (value: string) => void;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// Point d'entrée principal du tableau : grand champ en tête de page, que la
// touche « / » atteint depuis n'importe où hors d'un champ de saisie.
export function GlobalSearch({ value, onChange }: GlobalSearchProps): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isEditable(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div className="global-search">
      <svg className="global-search__icon" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
        <circle cx="8.5" cy="8.5" r="5.75" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <path d="M13 13l4.5 4.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        className="global-search__input"
        placeholder="Rechercher une clé, un résumé, une valeur…"
        aria-label="Rechercher dans le tableau"
        aria-keyshortcuts="/"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {!value && (
        <kbd className="global-search__hint" aria-hidden="true">
          /
        </kbd>
      )}
    </div>
  );
}
