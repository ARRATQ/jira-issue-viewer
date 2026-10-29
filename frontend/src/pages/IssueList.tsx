import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryIssues } from '../hooks/useQueries';
import { useAuth } from '../hooks/useAuth';
import { useColumnPreferences } from '../hooks/useColumnPreferences';
import { useColumnWidths } from '../hooks/useColumnWidths';
import { useDensity } from '../hooks/useDensity';
import { useIssueListView } from '../hooks/useIssueListView';
import { ApiError } from '../lib/apiClient';
import { buildIssuesCsv, csvFileName, downloadCsv } from '../lib/csvExport';
import { paginate } from '../lib/pagination';
import { formatDisplayDate, isDateColumn, isoDatePart } from '../lib/dateValues';
import { matchesColumnFilter, matchesIssueSearch, nextSort, sortIssues, TEXT_SEARCH_THRESHOLD } from '../lib/issueTable';
import { OPEN_RANGE } from '../lib/issueListView';
import type { DateRange } from '../lib/issueListView';
import { describeActiveFilters } from '../lib/activeFilters';
import type { ActiveFilter } from '../lib/activeFilters';
import { StatusPill } from '../components/StatusPill';
import { IssueDetailDrawer } from '../components/IssueDetailDrawer';
import { ColumnPicker } from '../components/ColumnPicker';
import { GlobalSearch } from '../components/GlobalSearch';
import { IssueFilters } from '../components/IssueFilters';
import { ActiveFilterChips } from '../components/ActiveFilterChips';
import { StatusSummary } from '../components/StatusSummary';
import { DensityToggle } from '../components/DensityToggle';
import { Highlight } from '../components/Highlight';
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

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

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
  // Filtres, recherche, tri et page vivent dans l'URL : un lien partagé ou
  // une page rafraîchie retrouve exactement la même vue.
  const { view, updateView } = useIssueListView(PAGE_SIZE_OPTIONS);
  const { search: globalSearch, status: statusFilter, columnFilters, dateFilters, sort, page, pageSize } = view;

  const issues = data?.issues ?? [];
  const listColumns = data?.listColumns ?? NO_COLUMNS;
  const availableColumns = data?.availableColumns ?? listColumns;
  const { visibleColumns, isCustomized, toggleColumn, moveColumn, resetColumns } = useColumnPreferences(
    user?.id ?? 'anonymous',
    queryId,
    listColumns,
    availableColumns,
  );
  const { widths, setWidth, resetWidth } = useColumnWidths(user?.id ?? 'anonymous', queryId);
  const { density, setDensity } = useDensity(user?.id ?? 'anonymous');
  // Glisser-déposer des en-têtes : colonne saisie (ref, pas d'effet sur le
  // rendu) et colonne survolée (état, pour le repère visuel de dépôt).
  const draggedColumnRef = useRef<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  // Déplacement au clavier : le bouton d'en-tête garde le focus une fois la
  // colonne réordonnée, même si le navigateur l'a perdu en déplaçant le nœud.
  const headerButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocusRef = useRef<string | null>(null);
  const stopResizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const column = pendingFocusRef.current;
    if (!column) return;
    pendingFocusRef.current = null;
    headerButtonsRef.current.get(column)?.focus();
  }, [visibleColumns]);

  // Un redimensionnement en cours ne doit pas survivre au démontage.
  useEffect(() => () => stopResizeRef.current?.(), []);

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
  const visibleNames = useMemo(() => visibleColumns.map((col) => col.fieldName), [visibleColumns]);
  // Le statut est appliqué à part : le récapitulatif par statut compte les
  // issues retenues par tous les autres filtres.
  const issuesBeforeStatus = useMemo(
    () =>
      issues.filter((issue) => {
        if (!matchesIssueSearch(issue, globalSearch, visibleNames, dateColumns)) return false;
        for (const col of visibleColumns) {
          const fieldValue = issue.extraFields[col.fieldName];
          if (dateColumns.has(col.fieldName)) {
            if (!isInRange(fieldValue, dateFilters[col.fieldName] ?? OPEN_RANGE)) return false;
            continue;
          }
          const value = columnFilters[col.fieldName] ?? '';
          if (!matchesColumnFilter(fieldValue, value, textColumns.has(col.fieldName))) return false;
        }
        return true;
      }),
    [issues, globalSearch, columnFilters, dateFilters, visibleColumns, visibleNames, dateColumns, textColumns],
  );
  const filteredIssues = useMemo(
    () => (statusFilter ? issuesBeforeStatus.filter((issue) => issue.status === statusFilter) : issuesBeforeStatus),
    [issuesBeforeStatus, statusFilter],
  );
  const sortedIssues = useMemo(() => sortIssues(filteredIssues, sort, dateColumns), [filteredIssues, sort, dateColumns]);

  const activeFilters = useMemo(
    () => describeActiveFilters(view, visibleNames, textColumns, dateColumns),
    [view, visibleNames, textColumns, dateColumns],
  );

  // Pagination purement côté client : le backend renvoie déjà toutes les
  // issues de la requête. L'export CSV, lui, porte sur toutes les issues
  // filtrées, pas seulement sur la page affichée.
  const currentPage = paginate(sortedIssues, page, pageSize);

  function changeStatusFilter(value: string): void {
    updateView({ status: value });
  }

  function changeGlobalSearch(value: string): void {
    updateView({ search: value });
  }

  function changeColumnFilter(fieldName: string, value: string): void {
    updateView({ columnFilters: { ...columnFilters, [fieldName]: value } });
  }

  function changeDateFilter(fieldName: string, bound: keyof DateRange, value: string): void {
    updateView({ dateFilters: { ...dateFilters, [fieldName]: { ...(dateFilters[fieldName] ?? OPEN_RANGE), [bound]: value } } });
  }

  function resetFilters(): void {
    updateView({ search: '', status: '', columnFilters: {}, dateFilters: {} });
  }

  function removeFilter(filter: ActiveFilter): void {
    if (filter.kind === 'search') updateView({ search: '' });
    else if (filter.kind === 'status') updateView({ status: '' });
    else if (filter.kind === 'column') updateView({ columnFilters: withoutKey(columnFilters, filter.field ?? '') });
    else updateView({ dateFilters: withoutKey(dateFilters, filter.field ?? '') });
  }

  function toggleSort(column: string): void {
    updateView({ sort: nextSort(sort, column) });
  }

  function setPage(value: number): void {
    updateView({ page: value });
  }

  // Alt+←/→ sur le bouton d'en-tête : alternative clavier au glisser-déposer.
  // Les colonnes fixes n'étant pas dans `visibleColumns`, une colonne
  // dynamique ne peut pas passer devant elles.
  function moveColumnByKey(event: KeyboardEvent<HTMLButtonElement>, column: string): void {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    // Alt+← est aussi le raccourci « Page précédente » du navigateur.
    event.preventDefault();
    const index = visibleColumns.findIndex((col) => col.fieldName === column);
    const neighbor = visibleColumns[index + (event.key === 'ArrowLeft' ? -1 : 1)];
    if (index === -1 || !neighbor) return;
    pendingFocusRef.current = column;
    moveColumn(column, neighbor.fieldName);
  }

  function startDrag(event: DragEvent<HTMLTableCellElement>, column: string): void {
    draggedColumnRef.current = column;
    event.dataTransfer.effectAllowed = 'move';
    // Firefox n'entame le glisser que si des données sont attachées.
    event.dataTransfer.setData('text/plain', column);
  }

  function dragOverColumn(event: DragEvent<HTMLTableCellElement>, column: string): void {
    if (!draggedColumnRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTarget(column);
  }

  function dropOnColumn(event: DragEvent<HTMLTableCellElement>, column: string): void {
    event.preventDefault();
    const dragged = draggedColumnRef.current;
    endDrag();
    if (dragged) moveColumn(dragged, column);
  }

  function endDrag(): void {
    draggedColumnRef.current = null;
    setDropTarget(null);
  }

  // Poignée de redimensionnement : la largeur suit la souris depuis la
  // largeur rendue au moment de la saisie ; le hook la borne à 60–800 px.
  function startResize(event: ReactMouseEvent<HTMLSpanElement>, column: string): void {
    if (event.button !== 0) return;
    // Empêche à la fois la sélection de texte et le glisser de l'en-tête.
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.closest('th');
    if (!th) return;
    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;

    function onMouseMove(moveEvent: MouseEvent): void {
      setWidth(column, startWidth + moveEvent.clientX - startX);
    }
    function stop(): void {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', stop);
      document.body.classList.remove('is-resizing-column');
      stopResizeRef.current = null;
    }

    stopResizeRef.current?.();
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stop);
    document.body.classList.add('is-resizing-column');
    stopResizeRef.current = stop;
  }

  // En-tête cliquable : le bouton porte l'action, le <th> l'état (aria-sort)
  // pour les lecteurs d'écran ; la flèche n'est qu'un repère visuel. Seules
  // les colonnes dynamiques (`isMovable`) se déplacent ; toutes se
  // redimensionnent (double-clic sur la poignée : retour à la largeur auto).
  function renderSortableHeader(column: string, label: string, isMovable = false): ReactElement {
    const direction = sort?.column === column ? sort.direction : null;
    const width = widths[column];
    return (
      <th
        key={column}
        aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : undefined}
        style={width ? { width, minWidth: width } : undefined}
        draggable={isMovable || undefined}
        data-drop-target={dropTarget === column || undefined}
        onDragStart={isMovable ? (e) => startDrag(e, column) : undefined}
        onDragOver={isMovable ? (e) => dragOverColumn(e, column) : undefined}
        onDragLeave={isMovable ? () => setDropTarget((prev) => (prev === column ? null : prev)) : undefined}
        onDrop={isMovable ? (e) => dropOnColumn(e, column) : undefined}
        onDragEnd={isMovable ? endDrag : undefined}
      >
        <button
          type="button"
          className="issue-list__sort"
          onClick={() => toggleSort(column)}
          onKeyDown={isMovable ? (e) => moveColumnByKey(e, column) : undefined}
          aria-keyshortcuts={isMovable ? 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
          title={isMovable ? 'Glisser ou Alt+←/→ pour déplacer la colonne' : undefined}
          ref={(node) => {
            if (node) headerButtonsRef.current.set(column, node);
            else headerButtonsRef.current.delete(column);
          }}
        >
          {label}
          <span aria-hidden="true" className="issue-list__sort-icon" data-direction={direction ?? 'none'}>
            {direction === 'desc' ? '▼' : '▲'}
          </span>
        </button>
        <span
          aria-hidden="true"
          className="issue-list__resize"
          onMouseDown={(e) => startResize(e, column)}
          onDoubleClick={() => resetWidth(column)}
        />
      </th>
    );
  }

  function changePageSize(size: number): void {
    updateView({ pageSize: size });
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
        <GlobalSearch value={globalSearch} onChange={changeGlobalSearch} />
        <span className="issue-list__count">
          {filteredIssues.length} / {issues.length} issue
          {issues.length > 1 ? 's' : ''}
        </span>
        <button type="button" className="issue-list__export" onClick={exportCsv} disabled={filteredIssues.length === 0}>
          Exporter CSV
        </button>
      </div>

      <IssueFilters
        statusOptions={statusOptions}
        status={statusFilter}
        columns={columnOptions}
        columnFilters={columnFilters}
        dateFilters={dateFilters}
        canReset={activeFilters.length > 0}
        onStatusChange={changeStatusFilter}
        onColumnFilterChange={changeColumnFilter}
        onDateFilterChange={changeDateFilter}
        onReset={resetFilters}
      />

      <ActiveFilterChips filters={activeFilters} onRemove={removeFilter} />

      {/* Barre collée au tableau : ce qui agit sur son affichage (statuts,
          densité, colonnes) se trouve juste au-dessus des colonnes concernées. */}
      <div className="issue-list__table-bar">
        <StatusSummary issues={issuesBeforeStatus} activeStatus={statusFilter} onSelect={changeStatusFilter} />
        <div className="issue-list__table-tools">
          <DensityToggle density={density} onChange={setDensity} />
          <ColumnPicker
            availableColumns={availableColumns}
            visibleColumns={visibleColumns}
            isCustomized={isCustomized}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
        </div>
      </div>

      {filteredIssues.length === 0 ? (
        <p>Aucune issue ne correspond à ces filtres.</p>
      ) : (
        <>
          <div className="table-scroll">
            <table className="issue-list__table" data-density={density}>
              <thead>
                <tr>
                  {renderSortableHeader('key', 'Clé')}
                  {renderSortableHeader('summary', 'Résumé')}
                  {renderSortableHeader('status', 'Statut')}
                  {renderSortableHeader('issueType', 'Type')}
                  {visibleColumns.map((col) => renderSortableHeader(col.fieldName, col.fieldName, true))}
                </tr>
              </thead>
              <tbody>
                {currentPage.pageItems.map((issue) => (
                  <tr key={issue.key} onClick={() => setSelectedKey(issue.key)} className="issue-list__row">
                    <td>
                      <button type="button" className="issue-list__key-button">
                        <Highlight text={issue.key} query={globalSearch} />
                      </button>
                    </td>
                    <td>
                      <Highlight text={issue.summary} query={globalSearch} />
                    </td>
                    <td>{issue.status ? <StatusPill label={issue.status} category={issue.statusCategory} /> : '—'}</td>
                    <td>{issue.issueType ? <Highlight text={issue.issueType} query={globalSearch} /> : '—'}</td>
                    {visibleColumns.map((col) => (
                      <td key={col.fieldName}>
                        <Highlight
                          text={formatCell(issue.extraFields[col.fieldName], dateColumns.has(col.fieldName))}
                          query={globalSearch}
                        />
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
