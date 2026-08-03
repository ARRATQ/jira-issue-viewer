import type { ReactElement } from 'react';
import './Footer.css';

export function Footer(): ReactElement {
  return (
    <footer className="app-footer">
      <p>Plateforme développée par Maroc PME — {new Date().getFullYear()}</p>
    </footer>
  );
}
