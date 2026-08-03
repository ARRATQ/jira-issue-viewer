import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './Layout.css';

export function Layout(): ReactElement {
  const { user, logout } = useAuth();

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-header__brand">jira-issue-viewer</span>
        <nav className="app-header__nav" aria-label="Navigation principale">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'is-active' : '')}>
            Issues
          </NavLink>
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              Administration
            </NavLink>
          )}
        </nav>
        <div className="app-header__user">
          <span>{user?.name}</span>
          <button type="button" onClick={logout}>
            Se déconnecter
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
