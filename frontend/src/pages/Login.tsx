import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useBranding } from '../hooks/useBranding';
import { ApiError } from '../lib/apiClient';
import { Footer } from '../components/Footer';
import './Login.css';

export function Login(): ReactElement {
  const { isAuthenticated, login } = useAuth();
  const { data: branding } = useBranding();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedConfidentiality, setAcceptedConfidentiality] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    const from = (location.state as { from?: Location } | null)?.from;
    return <Navigate to={from?.pathname ?? '/'} replace />;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password, acceptedConfidentiality);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
        {branding?.logoDataUrl && <img src={branding.logoDataUrl} alt="" className="login-card__logo" />}
        <h1>{branding?.appName ?? 'jira-issue-viewer'}</h1>
        <p className="login-card__subtitle">Connectez-vous pour consulter les issues Jira.</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password">Mot de passe</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <div className="login-card__consent">
          <p className="login-card__consent-text">{branding?.confidentialityNotice}</p>
          <label className="login-card__consent-checkbox">
            <input
              type="checkbox"
              checked={acceptedConfidentiality}
              onChange={(e) => setAcceptedConfidentiality(e.target.checked)}
              required
            />
            J&rsquo;ai lu et j&rsquo;accepte la mention de confidentialité ci-dessus.
          </label>
        </div>

        {error && (
          <p className="login-card__error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting || !acceptedConfidentiality}>
          {isSubmitting ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
      <Footer />
    </div>
  );
}
