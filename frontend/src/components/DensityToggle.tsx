import type { ReactElement } from 'react';
import type { Density } from '../hooks/useDensity';
import './DensityToggle.css';

const OPTIONS: Array<{ value: Density; label: string }> = [
  { value: 'comfortable', label: 'Confortable' },
  { value: 'compact', label: 'Compacte' },
];

interface DensityToggleProps {
  density: Density;
  onChange: (density: Density) => void;
}

export function DensityToggle({ density, onChange }: DensityToggleProps): ReactElement {
  return (
    <div className="density-toggle" role="group" aria-label="Densité">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="density-toggle__option"
          aria-pressed={density === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
