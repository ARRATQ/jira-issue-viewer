import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearExportTickets, consumeExportTicket, createExportTicket } from '../src/services/exportTickets';

const PAYLOAD = { userId: 'admin-1', queryId: 'q1', queryName: 'Export', jql: 'project = P', entries: [] };

afterEach(() => {
  vi.useRealTimers();
  clearExportTickets();
});

describe('export tickets', () => {
  it('returns an unguessable token that can be consumed exactly once', () => {
    const token = createExportTicket(PAYLOAD);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(consumeExportTicket(token)).toEqual(PAYLOAD);
    expect(consumeExportTicket(token)).toBeNull();
  });

  it('rejects unknown tokens', () => {
    expect(consumeExportTicket('nope')).toBeNull();
  });

  it('expires tokens after two minutes', () => {
    vi.useFakeTimers();
    const token = createExportTicket(PAYLOAD);
    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(consumeExportTicket(token)).toBeNull();
  });
});
