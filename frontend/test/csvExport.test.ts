import { describe, it, expect } from 'vitest';
import { buildIssuesCsv, csvFileName } from '../src/lib/csvExport';
import type { IssueSummary } from '../src/types/issue';

const ISSUES: IssueSummary[] = [
  {
    key: 'PROJ-1',
    summary: 'Ticket "un"; urgent',
    status: 'Open',
    issueType: 'Task',
    extraFields: { 'Raison Sociale': 'Acme', Profil: 'Débutant' },
  },
  {
    key: 'PROJ-2',
    summary: 'Ligne\nmultiple',
    status: null,
    issueType: 'Bug',
    extraFields: { 'Raison Sociale': null },
  },
];

describe('buildIssuesCsv', () => {
  it('starts with a UTF-8 BOM and uses ";" as separator (Excel FR)', () => {
    const csv = buildIssuesCsv([], []);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1)).toBe('Clé;Résumé;Statut;Type');
  });

  it('exports the fixed columns then the given extra columns, in order', () => {
    const csv = buildIssuesCsv(ISSUES, [{ fieldName: 'Raison Sociale' }, { fieldName: 'Profil' }]);
    const lines = csv.slice(1).split('\r\n');

    expect(lines[0]).toBe('Clé;Résumé;Statut;Type;Raison Sociale;Profil');
    expect(lines[1]).toBe('PROJ-1;"Ticket ""un""; urgent";Open;Task;Acme;Débutant');
    expect(lines[2]).toBe('PROJ-2;"Ligne\nmultiple";;Bug;;');
  });

  it('neutralises cells that a spreadsheet would interpret as a formula', () => {
    const csv = buildIssuesCsv(
      [{ key: 'PROJ-3', summary: '=HYPERLINK("http://x")', status: '+1', issueType: '-2', extraFields: { A: '@cmd' } }],
      [{ fieldName: 'A' }],
    );
    const row = csv.slice(1).split('\r\n')[1];
    expect(row).toBe(`PROJ-3;"'=HYPERLINK(""http://x"")";'+1;'-2;'@cmd`);
  });
});

describe('csvFileName', () => {
  it('slugifies the query name and appends the date', () => {
    expect(csvFileName('Export / Prospects 2026', new Date('2026-10-23T10:00:00Z'))).toBe(
      'export-prospects-2026-2026-10-23.csv',
    );
  });

  it('falls back to a generic name when the query name has no usable character', () => {
    expect(csvFileName('///', new Date('2026-10-23T10:00:00Z'))).toBe('issues-2026-10-23.csv');
  });
});
