import type { ReactElement } from 'react';
import { highlightRanges } from '../lib/highlight';

interface HighlightProps {
  text: string;
  query: string;
}

// Texte de cellule avec les occurrences de la recherche globale marquées.
export function Highlight({ text, query }: HighlightProps): ReactElement {
  const ranges = highlightRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;
  const parts: Array<string | ReactElement> = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(
      <mark key={start} className="search-hit">
        {text.slice(start, end)}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
