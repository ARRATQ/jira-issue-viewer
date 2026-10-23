export interface PageSlice<T> {
  pageItems: T[];
  // Page effectivement affichée (1-based), ramenée dans [1, pageCount].
  page: number;
  pageCount: number;
  // Rang 1-based des premier/dernier éléments de la page (0 si liste vide).
  rangeStart: number;
  rangeEnd: number;
}

// La page demandée est bornée plutôt que rejetée : après un filtrage qui
// réduit la liste, on reste sur la dernière page valide au lieu d'un tableau vide.
export function paginate<T>(items: T[], requestedPage: number, pageSize: number): PageSlice<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const startIndex = (page - 1) * pageSize;
  const pageItems = items.slice(startIndex, startIndex + pageSize);
  return {
    pageItems,
    page,
    pageCount,
    rangeStart: pageItems.length > 0 ? startIndex + 1 : 0,
    rangeEnd: startIndex + pageItems.length,
  };
}
