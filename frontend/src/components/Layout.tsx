import type { ReactElement } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBranding } from '../hooks/useBranding';
import { useQueriesNav } from '../hooks/useQueries';
import { Footer } from './Footer';
import './Layout.css';

export function Layout(): ReactElement {
  const { user, logout } = useAuth();
  const { data: branding } = useBranding();
  const { data: queriesData } = useQueriesNav();
  const queries = queriesData?.queries ?? [];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          {branding?.logoDataUrl && <img src={branding.logoDataUrl} alt="" className="app-header__logo" />}
          <span>{branding?.appName ?? 'jira-issue-viewer'}</span>
        </div>
        <nav className="app-header__nav" aria-label="Navigation principale">
          {queries.map((query) => (
            <NavLink
              key={query.id}
              to={`/queries/${query.id}`}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {query.name}
            </NavLink>
          ))}
          {user?.role === 'ADMIN' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'is-active' : '')}>
              Administration
            </NavLink>
          )}
        </nav>
        <div className="app-header__user">
          <NavLink to="/account" className={({ isActive }) => (isActive ? 'is-active' : '')}>
            {user?.name}
          </NavLink>
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
