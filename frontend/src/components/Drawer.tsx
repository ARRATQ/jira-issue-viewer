import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import './Drawer.css';

interface DrawerProps {
  isOpen: boolean;
  isExpanded: boolean;
  onClose: () => void;
  onToggleExpand: () => void;
  title: ReactNode;
  children: ReactNode;
}

export function Drawer({ isOpen, isExpanded, onClose, onToggleExpand, title, children }: DrawerProps): ReactElement {
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className={`drawer-overlay ${isOpen ? 'is-open' : ''}`} onClick={onClose} aria-hidden={!isOpen}>
      <div
        className={`drawer-panel ${isExpanded ? 'drawer-panel--expanded' : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isOpen}
      >
        <div className="drawer-panel__toolbar">
          <span className="drawer-panel__title">{title}</span>
          <div className="drawer-panel__toolbar-actions">
            <button
              type="button"
              onClick={onToggleExpand}
              aria-label={isExpanded ? 'Réduire le panneau' : 'Agrandir le panneau'}
              title={isExpanded ? 'Réduire' : 'Agrandir'}
            >
              {isExpanded ? '⤡' : '⤢'}
            </button>
            <button type="button" onClick={onClose} aria-label="Fermer le panneau" title="Fermer">
              ✕
            </button>
          </div>
        </div>
        <div className="drawer-panel__content">{children}</div>
      </div>
    </div>
  );
}
