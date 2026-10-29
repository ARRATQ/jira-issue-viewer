import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryIssues } from '../hooks/useQueries';
import { useAuth } from '../hooks/useAuth';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import { ApiError } from '../lib/apiClient';
import { buildIssuesCsv, csvFileName, downloadCsv } from '../lib/csvExport';
import { paginate } from '../lib/pagination';
import { formatDisplayDate, isDateColumn, isoDatePart } from '../lib/dateValues';
import { matchesText, nextSort, sortIssues, TEXT_SEARCH_THRESHOLD } from '../lib/issueTable';
import type { SortState } from '../lib/issueTable';
import { StatusPill } from '../components/StatusPill';
import { IssueDetailDrawer } from '../components/IssueDetailDrawer';
import { ColumnPicker } from '../components/ColumnPicker';
import { PAGE_SIZE_OPTIONS, Pagination } from '../components/Pagination';
import type { IssueSummary } from '../types/issue';
import type { FieldRef } from '../types/query';
import './IssueList.css';

// Valeurs distinctes d'une colonne dynamique (indexée par nom de champ dans
// `extraFields`), pour peupler le sélecteur de filtre correspondant.
function distinctColumnValues(issues: IssueSummary[], fieldName: string): string[] {
  const values = new Set<string>();
  for (const issue of issues) {
    const value = issue.extraFields[fieldName];
    if (typeof value === 'string' && value) values.add(value);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

function formatCell(value: string | null | undefined, isDate: boolean): string {
  if (!value) return '—';
  return isDate ? formatDisplayDate(value) : value;
}

function distinctStatuses(issues: IssueSummary[]): string[] {
  const values = new Set<string>();
  for (const issue of issues) {
    if (issue.status) values.add(issue.status);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
}

const NO_COLUMNS: FieldRef[] = [];

// Période d'un filtre de date, bornes "AAAA-MM-JJ" incluses ('' = ouverte).
interface DateRange {
  from: string;
  to: string;
}

const OPEN_RANGE: DateRange = { from: '', to: '' };

function isInRange(value: string | null | undefined, range: DateRange): boolean {
  if (!range.from && !range.to) return true;
  const date = isoDatePart(value);
  if (!date) return false;
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

export function IssueList(): ReactElement {
  const { queryId = '' } = useParams();
  const { data, isLoading, isError, error } = useQueryIssues(queryId);
  const { user } = useAuth();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  // Filtres des colonnes dynamiques, indexés par nom de champ.
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [dateFilters, setDateFilters] = useState<Record<string, DateRange>>({});
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);

  const issues = data?.issues ?? [];
  const listColumns = data?.listColumns ?? NO_COLUMNS;
  const availableColumns = data?.availableColumns ?? listColumns;
  const { visibleColumns, isCustomized, toggleColumn, resetColumns } = useColumnPreferences(
    user?.id ?? 'anonymous',
    queryId,
    listColumns,
    availableColumns,
  );

  const statusOptions = useMemo(() => distinctStatuses(issues), [issues]);
  // Colonnes de dates : affichées sans l'heure et filtrées par période (du/au)
  // plutôt que par une liste de valeurs, quasi uniques d'une issue à l'autre.
  const dateColumns = useMemo(
    () => new Set(visibleColumns.filter((col) => isDateColumn(issues, col.fieldName)).map((col) => col.fieldName)),
    [issues, visibleColumns],
  );
  const columnOptions = useMemo(
    () =>
      visibleColumns.map((col) => {
        const isDate = dateColumns.has(col.fieldName);
        const options = isDate ? [] : distinctColumnValues(issues, col.fieldName);
        return { fieldName: col.fieldName, isDate, isText: options.length > TEXT_SEARCH_THRESHOLD, options };
      }),
    [issues, visibleColumns, dateColumns],
  );
  const textColumns = useMemo(
    () => new Set(columnOptions.filter((col) => col.isText).map((col) => col.fieldName)),
    [columnOptions],
  );

  // Seuls les filtres des colonnes affichées s'appliquent : masquer une
  // colonne retire aussi son filtre, sinon il agirait sans être visible.
  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (statusFilter && issue.status !== statusFilter) return false;
        for (const col of visibleColumns) {
          const fieldValue = issue.extraFields[col.fieldName];
          if (dateColumns.has(col.fieldName)) {
            if (!isInRange(fieldValue, dateFilters[col.fieldName] ?? OPEN_RANGE)) return false;
            continue;
          }
          const value = columnFilters[col.fieldName];
          if (!value) continue;
          if (textColumns.has(col.fieldName) ? !matchesText(fieldValue, value) : fieldValue !== value) return false;
        }
        return true;
      }),
    [issues, statusFilter, columnFilters, dateFilters, visibleColumns, dateColumns, textColumns],
  );
  const sortedIssues = useMemo(() => sortIssues(filteredIssues, sort, dateColumns), [filteredIssues, sort, dateColumns]);

  const hasActiveFilters =
    Boolean(statusFilter) ||
    visibleColumns.some((col) => {
      const range = dateFilters[col.fieldName];
      return Boolean(columnFilters[col.fieldName] || range?.from || range?.to);
    });

  // Pagination purement côté client : le backend renvoie déjà toutes les
  // issues de la requête. L'export CSV, lui, porte sur toutes les issues
  // filtrées, pas seulement sur la page affichée.
  const currentPage = paginate(sortedIssues, page, pageSize);

  // Tout changement de filtre ramène en page 1 : la page courante n'a plus de
  // sens une fois la liste recomposée.
  function changeStatusFilter(value: string): void {
    setStatusFilter(value);
    setPage(1);
  }

  function changeColumnFilter(fieldName: string, value: string): void {
    setColumnFilters((prev) => ({ ...prev, [fieldName]: value }));
    setPage(1);
  }

  function changeDateFilter(fieldName: string, bound: keyof DateRange, value: string): void {
    setDateFilters((prev) => ({ ...prev, [fieldName]: { ...(prev[fieldName] ?? OPEN_RANGE), [bound]: value } }));
    setPage(1);
  }

  function resetFilters(): void {
    setStatusFilter('');
    setColumnFilters({});
    setDateFilters({});
    setPage(1);
  }

  function toggleSort(column: string): void {
    setSort((prev) => nextSort(prev, column));
    setPage(1);
  }

  // En-tête cliquable : le bouton porte l'action, le <th> l'état (aria-sort)
  // pour les lecteurs d'écran ; la flèche n'est qu'un repère visuel.
  function renderSortableHeader(column: string, label: string): ReactElement {
    const direction = sort?.column === column ? sort.direction : null;
    return (
      <th key={column} aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button type="button" className="issue-list__sort" onClick={() => toggleSort(column)}>
          {label}
          <span aria-hidden="true" className="issue-list__sort-icon" data-direction={direction ?? 'none'}>
            {direction === 'desc' ? '▼' : '▲'}
          </span>
        </button>
      </th>
    );
  }

  function changePageSize(size: number): void {
    setPageSize(size);
    setPage(1);
  }

  function exportCsv(): void {
    if (!data) return;
    downloadCsv(csvFileName(data.queryName), buildIssuesCsv(sortedIssues, visibleColumns, dateColumns));
  }

  function closeDrawer(): void {
    setSelectedKey(null);
    setIsDrawerExpanded(false);
  }

  if (isLoading) return <p>Chargement des issues…</p>;

  if (isError) {
    return (
      <p role="alert" className="issue-list__error">
        {error instanceof ApiError ? error.message : 'Erreur de chargement des issues'}
      </p>
    );
  }

  if (!data || data.issues.length === 0) {
    return <p>Aucune issue ne correspond à la requête JQL configurée.</p>;
  }

  return (
    <div className="issue-list">
      <p className="issue-list__jql">
        <code>{data.jql}</code>
      </p>

      {data.truncated && (
        <p role="status" className="issue-list__truncated">
          Affichage des {data.issues.length} premières issues sur {data.total} : filtres, pagination et export ne
          portent que sur celles-ci. Pour tout voir, affinez le JQL de la requête.
        </p>
      )}

      <div className="issue-list__toolbar">
        <ColumnPicker
          availableColumns={availableColumns}
          visibleColumns={visibleColumns}
          isCustomized={isCustomized}
          onToggle={toggleColumn}
          onReset={resetColumns}
        />
        <span className="issue-list__count">
          {filteredIssues.length} / {issues.length} issue
          {issues.length > 1 ? 's' : ''}
        </span>
        <button type="button" className="issue-list__export" onClick={exportCsv} disabled={filteredIssues.length === 0}>
          Exporter CSV
        </button>
      </div>

      <div className="issue-list__filters">
        <label>
          Statut
          <select value={statusFilter} onChange={(e) => changeStatusFilter(e.target.value)}>
            <option value="">Tous</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {columnOptions.map((col) =>
          col.isDate ? (
            <fieldset key={col.fieldName} className="issue-list__date-range">
              <legend>{col.fieldName}</legend>
              <label>
                du
                <input
                  type="date"
                  aria-label={`${col.fieldName} du`}
                  value={dateFilters[col.fieldName]?.from ?? ''}
                  max={dateFilters[col.fieldName]?.to || undefined}
                  onChange={(e) => changeDateFilter(col.fieldName, 'from', e.target.value)}
                />
              </label>
              <label>
                au
                <input
                  type="date"
                  aria-label={`${col.fieldName} au`}
                  value={dateFilters[col.fieldName]?.to ?? ''}
                  min={dateFilters[col.fieldName]?.from || undefined}
                  onChange={(e) => changeDateFilter(col.fieldName, 'to', e.target.value)}
                />
              </label>
            </fieldset>
          ) : col.isText ? (
            <label key={col.fieldName}>
              {col.fieldName}
              <input
                type="search"
                placeholder="Contient…"
                value={columnFilters[col.fieldName] ?? ''}
                onChange={(e) => changeColumnFilter(col.fieldName, e.target.value)}
              />
            </label>
          ) : (
            <label key={col.fieldName}>
              {col.fieldName}
              <select
                value={columnFilters[col.fieldName] ?? ''}
                onChange={(e) => changeColumnFilter(col.fieldName, e.target.value)}
              >
                <option value="">Tous</option>
                {col.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          ),
        )}
        <button type="button" className="issue-list__reset" onClick={resetFilters} disabled={!hasActiveFilters}>
          Réinitialiser les filtres
        </button>
      </div>

      {filteredIssues.length === 0 ? (
        <p>Aucune issue ne correspond à ces filtres.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="issue-list__table">
              <thead>
                <tr>
                  {renderSortableHeader('key', 'Clé')}
                  {renderSortableHeader('summary', 'Résumé')}
                  {renderSortableHeader('status', 'Statut')}
                  {renderSortableHeader('issueType', 'Type')}
                  {visibleColumns.map((col) => renderSortableHeader(col.fieldName, col.fieldName))}
                </tr>
              </thead>
              <tbody>
                {currentPage.pageItems.map((issue) => (
                  <tr key={issue.key} onClick={() => setSelectedKey(issue.key)} className="issue-list__row">
                    <td>
                      <button type="button" className="issue-list__key-button">
                        {issue.key}
                      </button>
                    </td>
                    <td>{issue.summary}</td>
                    <td>{issue.status ? <StatusPill label={issue.status} category={issue.statusCategory} /> : '—'}</td>
                    <td>{issue.issueType ?? '—'}</td>
                    {visibleColumns.map((col) => (
                      <td key={col.fieldName}>
                        {formatCell(issue.extraFields[col.fieldName], dateColumns.has(col.fieldName))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={currentPage.page}
            pageCount={currentPage.pageCount}
            pageSize={pageSize}
            rangeStart={currentPage.rangeStart}
            rangeEnd={currentPage.rangeEnd}
            total={filteredIssues.length}
            onPageChange={setPage}
            onPageSizeChange={changePageSize}
          />
        </>
      )}

      <IssueDetailDrawer
        queryId={queryId}
        tabs={data.tabs}
        autresVisibleToUser={data.autresVisibleToUser}
        issueKey={selectedKey}
        isExpanded={isDrawerExpanded}
        onClose={closeDrawer}
        onToggleExpand={() => setIsDrawerExpanded((v) => !v)}
      />
    </div>
  );
}
