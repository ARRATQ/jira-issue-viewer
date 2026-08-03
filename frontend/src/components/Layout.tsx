import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBranding } from '../hooks/useBranding';
import { Footer } from './Footer';
import './Layout.css';

export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { data: branding } = useBranding();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          {branding?.logoDataUrl && <img src={branding.logoDataUrl} alt="" className="app-header__logo" />}
          <span>{branding?.appName ?? 'jira-issue-viewer'}</span>
        </div>
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
      <Footer />
    </div>
  );
}
