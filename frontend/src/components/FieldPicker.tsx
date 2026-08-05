import { useId, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useJiraFields } from '../hooks/useAdminQueries';
import type { FieldRef } from '../types/query';
import './FieldPicker.css';

interface FieldPickerProps {
  label: string;
  value: FieldRef[];
  onChange: (fields: FieldRef[]) => void;
}

const MAX_SUGGESTIONS = 8;

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

// Sélecteur multi-champs alimenté par le catalogue Jira live
// (/api/admin/jira-fields). Les champs choisis s'affichent en puces
// supprimables ; le matching effectif se fait ensuite par nom, donc un champ
// ajouté reste exploitable même si son id Jira change.
export function FieldPicker({ label, value, onChange }: FieldPickerProps): ReactElement {
  const inputId = useId();
  const listId = useId();
  const { data, isLoading, isError } = useJiraFields();
  const [search, setSearch] = useState('');

  const selectedNames = useMemo(() => new Set(value.map((f) => normalize(f.fieldName))), [value]);

  const suggestions = useMemo(() => {
    const term = normalize(search);
    if (!term) return [];
    return (data?.fields ?? [])
      .filter((f) => !selectedNames.has(normalize(f.name)) && normalize(f.name).includes(term))
      .slice(0, MAX_SUGGESTIONS);
  }, [data?.fields, search, selectedNames]);

  function addField(fieldName: string, fieldId?: string): void {
    if (selectedNames.has(normalize(fieldName))) return;
    onChange([...value, fieldId ? { fieldName, fieldId } : { fieldName }]);
    setSearch('');
  }

  function removeField(fieldName: string): void {
    onChange(value.filter((f) => normalize(f.fieldName) !== normalize(fieldName)));
  }

  return (
    <div className="field-picker">
      <label className="field-picker__label" htmlFor={inputId}>
        {label}
      </label>

      {value.length > 0 && (
        <ul className="field-picker__chips">
          {value.map((field) => (
            <li key={field.fieldName} className="field-picker__chip">
              <span>{field.fieldName}</span>
              <button
                type="button"
                aria-label={`Retirer ${field.fieldName}`}
                onClick={() => removeField(field.fieldName)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="field-picker__combo">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={listId}
          autoComplete="off"
          placeholder={isLoading ? 'Chargement des champs…' : 'Rechercher un champ Jira…'}
          value={search}
          disabled={isLoading || isError}
          onChange={(e) => setSearch(e.target.value)}
        />

        {suggestions.length > 0 && (
          <ul className="field-picker__suggestions" id={listId} role="listbox">
            {suggestions.map((field) => (
              <li key={field.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => addField(field.name, field.id)}>
                  {field.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isError && <p className="field-picker__error">Impossible de charger le catalogue de champs Jira.</p>}
    </div>
  );
}
