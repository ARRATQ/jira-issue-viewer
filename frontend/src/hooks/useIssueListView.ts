import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseView, serializeView } from '../lib/issueListView';
import type { IssueListView } from '../lib/issueListView';

export interface IssueListViewState {
  view: IssueListView;
  updateView: (patch: Partial<IssueListView>) => void;
}

// Vue du tableau synchronisée avec l'URL. L'affichage lit un état local, mis
// à jour immédiatement : React Router applique ses navigations en transition
// (basse priorité), et un champ contrôlé directement par l'URL perdrait des
// caractères pendant une frappe rapide. L'URL suit cet état ; une URL changée
// de l'extérieur (lien, retour arrière, autre requête) est adoptée, sauf si
// c'est l'écho d'une de nos propres écritures.
export function useIssueListView(pageSizes: readonly number[]): IssueListViewState {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlKey = searchParams.toString();
  const [state, setState] = useState(() => ({ view: parseView(searchParams, pageSizes), urlKey }));
  // Écritures pas encore revenues par le routeur, dans l'ordre d'envoi.
  const pendingWritesRef = useRef<string[]>([]);

  // Le routeur peut sauter des étapes intermédiaires : dès qu'une écriture
  // revient, toutes celles envoyées avant elle sont considérées comme reçues.
  const pending = pendingWritesRef.current;
  const echoIndex = pending.lastIndexOf(urlKey);
  if (echoIndex !== -1) pendingWritesRef.current = pending.slice(echoIndex + 1);

  if (urlKey !== state.urlKey) {
    setState({ view: echoIndex === -1 ? parseView(searchParams, pageSizes) : state.view, urlKey });
    if (echoIndex === -1) pendingWritesRef.current = [];
  }

  // Tout changement ramène en page 1, sauf si `patch` fixe la page : la page
  // courante n'a plus de sens une fois la liste recomposée. L'URL est
  // remplacée, pas empilée, pour ne pas remplir l'historique à chaque frappe.
  function updateView(patch: Partial<IssueListView>): void {
    const view = { ...state.view, page: 1, ...patch };
    const key = serializeView(view, pageSizes[0]!).toString();
    setState((prev) => ({ view, urlKey: prev.urlKey }));
    if (key === urlKey && pendingWritesRef.current.length === 0) return;
    pendingWritesRef.current = [...pendingWritesRef.current, key];
    setSearchParams(key, { replace: true });
  }

  return { view: state.view, updateView };
}
