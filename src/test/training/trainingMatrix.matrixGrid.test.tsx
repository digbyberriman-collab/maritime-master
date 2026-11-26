/**
 * Training › Course records on MatrixGrid (BUILD-PLAN A8; X1-06B).
 *
 * The MatrixGrid invariant stays: crew × the catalogue's core courses, a
 * sticky crew column, course categories as column groups, each cell an
 * icon, the status word and the expiry month (never colour alone), count
 * chips, the legend and the CSV.
 *
 * X1-06B: the tab is no longer a compliance source. A course without a
 * record reads "No record", never "Missing"; there is no "overall
 * compliance" score; the tab points to Crew Compliance, where what each
 * position must hold is set; the CSV goes through the export engine (logged
 * first, personal data, the legacy-unlogged entry while the log is missing).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ runExport: vi.fn() }));

const COURSES = [
  { id: 'c-bst', course_code: 'BST', course_name: 'Basic Safety Training', course_category: 'stcw', is_mandatory: true },
  { id: 'c-eng', course_code: 'ENG', course_name: 'Engine Room Resource', course_category: 'technical', is_mandatory: true },
  { id: 'c-pss', course_code: 'PSSR', course_name: 'Personal Safety', course_category: 'stcw', is_mandatory: true },
  { id: 'c-opt', course_code: 'OPT', course_name: 'Optional', course_category: 'other', is_mandatory: false },
];

const CREW = [
  { id: 'p1', user_id: 'u1', first_name: 'Chief', last_name: 'Engineer', rank: 'Chief Engineer' },
  { id: 'p2', user_id: 'u2', first_name: 'Deck', last_name: 'Hand', rank: null },
];

const RECORDS = [
  { user_id: 'u1', status: 'Valid', expiry_date: '2027-03-15', course: { id: 'c-bst' } },
  { user_id: 'u1', status: 'Expiring_Soon', expiry_date: '2026-12-01', course: { id: 'c-eng' } },
  { user_id: 'u1', status: 'Valid', expiry_date: null, course: { id: 'c-pss' } },
  { user_id: 'u2', status: 'Expired', expiry_date: '2025-01-10', course: { id: 'c-bst' } },
];

// The export engine imports the client; nothing here reaches it (runExport is mocked).
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/training/hooks/useTraining', () => ({
  useTraining: () => ({ trainingRecords: RECORDS, courses: COURSES, isLoading: false }),
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({ useCrew: () => ({ crew: CREW }) }));
vi.mock('@/app/router/scopes', () => ({ useScopedPath: () => (rel = '') => `/v/dra/${rel}` }));
vi.mock('@/lib/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/export')>();
  return { ...actual, runExport: (...args: unknown[]) => h.runExport(...args), notifyExportResult: vi.fn() };
});

import TrainingMatrixTab, { NO_RECORD } from '@/modules/training/components/TrainingMatrixTab';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  h.runExport.mockReset();
  h.runExport.mockResolvedValue({ status: 'ok', value: { fileName: 'FLEET_CourseRecords_2026-11-26.csv', rowCount: 2, logged: false, jobId: null } });
});

const renderTab = () =>
  render(
    <MemoryRouter>
      <TrainingMatrixTab />
    </MemoryRouter>,
  );

const matrix = () => screen.getByRole('table', { name: 'Course records' });

describe('Course records on MatrixGrid', () => {
  it('shows crew × core courses with a sticky crew column, grouped by category', () => {
    renderTab();
    const table = matrix();
    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.map((th) => th.textContent)).toEqual(['Chief Engineer', 'Deck Hand']);
    expect(rowHeaders[0].className).toContain('sticky');
    expect(within(table).getByRole('columnheader', { name: 'Stcw' })).toHaveAttribute('colspan', '2');
    expect(within(table).getByRole('columnheader', { name: 'Technical' })).toHaveAttribute('colspan', '1');
    // Courses outside the catalogue's core set stay out; STCW courses sit together.
    expect(within(table).queryByRole('columnheader', { name: /OPT/ })).toBeNull();
    const codes = within(table)
      .getAllByRole('columnheader')
      .filter((th) => th.hasAttribute('data-c'))
      .map((th) => th.querySelector('span')?.textContent);
    expect(codes).toEqual(['BST', 'PSSR', 'ENG']);
  });

  it('reads each cell without colour: status text, icon and expiry month; no record is "No record", never "Missing"', () => {
    renderTab();
    const chief = within(matrix()).getByRole('rowheader', { name: 'Chief Engineer' }).closest('tr')!;
    const cells = within(chief).getAllByRole('cell').slice(1);
    expect(cells[0]).toHaveTextContent('Valid');
    expect(cells[0]).toHaveTextContent('Mar 27');
    expect(cells[2]).toHaveTextContent('Expiring soon');
    expect(cells[0].querySelector('[title]')).toHaveAttribute('title', 'Chief Engineer, BST · Basic Safety Training: Valid');
    const deck = within(matrix()).getByRole('rowheader', { name: 'Deck Hand' }).closest('tr')!;
    expect(within(deck).getAllByRole('cell')[0]).toHaveTextContent('Crew');
    expect(within(deck).getAllByRole('cell')[1]).toHaveTextContent('Expired');
    expect(within(deck).getAllByRole('cell')[2]).toHaveTextContent(NO_RECORD);
    expect(within(matrix()).queryByText(/missing/i)).toBeNull();
  });

  it('counts the records, with no compliance score (what is required is Crew Compliance\'s)', () => {
    renderTab();
    // 2 crew × 3 core courses = 6 cells: 2 valid, 1 expiring, 1 expired, 2 without a record.
    expect(screen.queryByText('33%')).toBeNull();
    expect(screen.queryByText(/overall compliance/i)).toBeNull();
    const valid = screen.getByText('Valid', { selector: 'p' }).previousElementSibling!;
    expect(valid).toHaveTextContent('2');
    expect(valid).toHaveClass('text-success');
    expect(screen.getByText(NO_RECORD, { selector: 'p' }).previousElementSibling).toHaveTextContent('2');
    const link = screen.getByRole('link', { name: 'Crew Compliance' });
    expect(link).toHaveAttribute('href', '/v/dra/crew/compliance/status?view=stcw');
  });

  it('filters crew through count chips', () => {
    renderTab();
    const chips = screen.getByRole('group', { name: 'Filter crew members' });
    const expired = within(chips).getByRole('button', { name: /^Expired/ });
    expect(expired).toHaveTextContent('1');
    fireEvent.click(expired);
    expect(within(matrix()).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Deck Hand']);
    fireEvent.click(within(chips).getByRole('button', { name: /Expiring soon/ }));
    expect(within(matrix()).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Chief Engineer']);
  });

  it('keeps the legend and exports the CSV through the export engine (personal data, logged first)', async () => {
    renderTab();
    expect(screen.getByText('Expiring soon (within 90 days)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(h.runExport).toHaveBeenCalledTimes(1));
    const options = h.runExport.mock.calls[0][0] as {
      format: string;
      sourceKey: string;
      personalData: boolean;
      legacyUnlogged: boolean;
      columns: Array<{ header: string; value: (row: (typeof CREW)[number] & { trainingRecords: Record<string, unknown> }) => unknown }>;
      rows: Array<(typeof CREW)[number] & { trainingRecords: Record<string, unknown> }>;
    };
    expect(options).toMatchObject({ format: 'csv', sourceKey: 'training.training_matrix', personalData: true, legacyUnlogged: true });
    expect(options.columns.map((c) => c.header)).toEqual(['Name', 'Rank', 'BST', 'PSSR', 'ENG']);
    const deck = options.rows.find((r) => r.id === 'p2')!;
    expect(options.columns[3].value(deck)).toBe(NO_RECORD);
    expect(options.columns[2].value(deck)).toBe('Expired (Jan 25)');
  });

  it('has no vessel filter that filters nothing', () => {
    renderTab();
    expect(screen.queryByText('All Vessels')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
