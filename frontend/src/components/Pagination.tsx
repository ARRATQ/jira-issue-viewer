import { useId } from 'react';
import type { ReactElement } from 'react';
import './Pagination.css';

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  rangeStart,
  rangeEnd,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps): ReactElement {
  const pageSizeId = useId();

  return (
    <nav className="pagination" aria-label="Pagination du tableau">
      <div className="pagination__size">
        <label htmlFor={pageSizeId}>Par page</label>
        <select id={pageSizeId} value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <p className="pagination__range" aria-live="polite">
        {rangeStart}–{rangeEnd} sur {total}
      </p>

      <div className="pagination__controls">
        <button
          type="button"
          aria-label="Page précédente"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </button>
        <span className="pagination__page">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          aria-label="Page suivante"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </button>
      </div>
    </nav>
  );
}
