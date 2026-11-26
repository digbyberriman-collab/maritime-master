/**
 * MatrixGrid adoption (BUILD-PLAN A8): Training › Matrix keeps its content
 * (crew × mandatory courses, status per cell with expiry month, compliance
 * summary, legend, CSV export) on the shared grid, which adds the sticky
 * crew column and header, category groups, crosshair and count chips.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

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

vi.mock('@/modules/training/hooks/useTraining', () => ({
  useTraining: () => ({ trainingRecords: RECORDS, courses: COURSES, isLoading: false }),
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({ useCrew: () => ({ crew: CREW }) }));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVessels: () => ({ vessels: [] }) }));

import TrainingMatrixTab from '@/modules/training/components/TrainingMatrixTab';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const matrix = () => screen.getByRole('table', { name: 'Training matrix' });

describe('Training matrix on MatrixGrid', () => {
  it('shows crew × mandatory courses with a sticky crew column, grouped by category', () => {
    render(<TrainingMatrixTab />);
    const table = matrix();
    const rowHeaders = within(table).getAllByRole('rowheader');
    expect(rowHeaders.map((th) => th.textContent)).toEqual(['Chief Engineer', 'Deck Hand']);
    expect(rowHeaders[0].className).toContain('sticky');
    expect(within(table).getByRole('columnheader', { name: 'Stcw' })).toHaveAttribute('colspan', '2');
    expect(within(table).getByRole('columnheader', { name: 'Technical' })).toHaveAttribute('colspan', '1');
    // Optional courses stay out; STCW courses sit together.
    expect(within(table).queryByRole('columnheader', { name: /OPT/ })).toBeNull();
    const codes = within(table)
      .getAllByRole('columnheader')
      .filter((th) => th.hasAttribute('data-c'))
      .map((th) => th.querySelector('span')?.textContent);
    expect(codes).toEqual(['BST', 'PSSR', 'ENG']);
  });

  it('reads each cell without colour: status text, icon and expiry month', () => {
    render(<TrainingMatrixTab />);
    const chief = within(matrix()).getByRole('rowheader', { name: 'Chief Engineer' }).closest('tr')!;
    const cells = within(chief).getAllByRole('cell').slice(1);
    expect(cells[0]).toHaveTextContent('Valid');
    expect(cells[0]).toHaveTextContent('Mar 27');
    expect(cells[2]).toHaveTextContent('Expiring soon');
    expect(cells[0].querySelector('[title]')).toHaveAttribute('title', 'Chief Engineer, BST · Basic Safety Training: Valid');
    const deck = within(matrix()).getByRole('rowheader', { name: 'Deck Hand' }).closest('tr')!;
    expect(within(deck).getAllByRole('cell')[0]).toHaveTextContent('Crew');
    expect(within(deck).getAllByRole('cell')[1]).toHaveTextContent('Expired');
    expect(within(deck).getAllByRole('cell')[2]).toHaveTextContent('Missing or not required');
  });

  it('keeps the compliance summary', () => {
    render(<TrainingMatrixTab />);
    // 2 crew × 3 mandatory courses = 6 cells: 2 valid, 1 expiring, 1 expired, 2 missing.
    expect(screen.getByText('33%')).toBeInTheDocument();
    const valid = screen.getByText('Valid', { selector: 'p' }).previousElementSibling!;
    expect(valid).toHaveTextContent('2');
    expect(valid).toHaveClass('text-success');
  });

  it('filters crew with gaps through count chips', () => {
    render(<TrainingMatrixTab />);
    const chips = screen.getByRole('group', { name: 'Filter crew members' });
    const gaps = within(chips).getByRole('button', { name: /Missing or expired/ });
    expect(gaps).toHaveTextContent('1');
    fireEvent.click(gaps);
    expect(within(matrix()).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Deck Hand']);
    fireEvent.click(within(chips).getByRole('button', { name: /Expiring soon/ }));
    expect(within(matrix()).getAllByRole('rowheader').map((th) => th.textContent)).toEqual(['Chief Engineer']);
  });

  it('keeps the legend and the CSV export', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:x');
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<TrainingMatrixTab />);
    expect(screen.getByText('Expiring Soon (<90 days)')).toBeInTheDocument();
    expect(screen.getByText('Missing/Not Required')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });
});
