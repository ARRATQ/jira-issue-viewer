import type { ReactElement } from 'react';
import { FieldPicker } from './FieldPicker';
import type { FieldRef, QueryTab } from '../types/query';
import './TabEditor.css';

interface TabEditorProps {
  tab: QueryTab;
  index: number;
  total: number;
  onChange: (tab: QueryTab) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

// Éditeur d'un onglet du drawer de détail : libellé, champs (sélecteur),
// visibilité pour le rôle USER, réordonnancement et suppression. L'onglet
// système "Autres" n'est pas édité ici (voir AdminQueryEditor).
export function TabEditor({ tab, index, total, onChange, onMove, onRemove }: TabEditorProps): ReactElement {
  function setFields(fields: FieldRef[]): void {
    onChange({ ...tab, fields });
  }

  return (
    <fieldset className="tab-editor">
      <div className="tab-editor__head">
        <label className="tab-editor__name">
          <span>Libellé de l&rsquo;onglet</span>
          <input value={tab.label} onChange={(e) => onChange({ ...tab, label: e.target.value })} required />
        </label>
        <div className="tab-editor__controls">
          <button type="button" aria-label="Monter l&rsquo;onglet" disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </button>
          <button
            type="button"
            aria-label="Descendre l&rsquo;onglet"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button type="button" className="tab-editor__delete" onClick={onRemove}>
            Supprimer
          </button>
        </div>
      </div>

      <FieldPicker label="Champs affichés dans cet onglet" value={tab.fields} onChange={setFields} />

      <label className="tab-editor__toggle">
        <input
          type="checkbox"
          checked={tab.visibleToUser}
          onChange={(e) => onChange({ ...tab, visibleToUser: e.target.checked })}
        />
        Visible pour le rôle USER
      </label>
    </fieldset>
  );
}
