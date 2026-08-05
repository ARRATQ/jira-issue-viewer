import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './AdminLayout.css';

export function AdminLayout(): ReactElement {
  return (
    <div className="admin-layout">
      <nav className="admin-layout__nav" aria-label="Navigation administration">
        <NavLink to="config" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Configuration
        </NavLink>
        <NavLink to="queries" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Requêtes
        </NavLink>
        <NavLink to="branding" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Personnalisation
        </NavLink>
        <NavLink to="users" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Comptes
        </NavLink>
        <NavLink to="audit-logs" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          Journal d&rsquo;audit
        </NavLink>
      </nav>
      <div className="admin-layout__content">
        <Outlet />
      </div>
    </div>
  );
}
