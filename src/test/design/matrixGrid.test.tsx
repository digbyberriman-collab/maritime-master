/**
 * MatrixGrid (BUILD-PLAN A8; gap/10 DS15): sticky header and first column,
 * column groups, wrapped or rotated labels, crosshair, count chips, sort,
 * density, virtualisation above 200 rows, and the staged-edit footer with
 * "Review & save" (§7.12).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MatrixGrid, MatrixToggleCell, type MatrixColumn } from '@/shared/components/data';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!window.PointerEvent) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  }
});

type Person = { id: string; name: string; rank: string; grants: Record<string, boolean> };

const PEOPLE: Person[] = [
  { id: 'p1', name: 'Master', rank: 'Senior officer', grants: { med: true, hr: false, pay: false } },
  { id: 'p2', name: 'Chief Stew', rank: 'Head of department', grants: { med: false, hr: true, pay: false } },
  { id: 'p3', name: 'Bosun', rank: 'Rating', grants: { med: false, hr: false, pay: false } },
];

const COLUMNS: MatrixColumn[] = [
  { id: 'med', label: 'MED', sublabel: 'Medical', title: 'Can view medical', group: 'sensitive' },
  { id: 'hr', label: 'HR', sublabel: 'HR files', title: 'Can view HR files', group: 'sensitive' },
  { id: 'pay', label: 'PAY', title: 'Can run payroll', group: 'finance' },
];

const GROUPS = [
  { id: 'sensitive', label: 'Sensitive records' },
  { id: 'finance', label: 'Finance' },
];

type GridProps = Partial<React.ComponentProps<typeof MatrixGrid<Person, boolean>>>;

function renderGrid(props: GridProps = {}) {
  return render(
    <MatrixGrid<Person, boolean>
      label="Access matrix"
      noun={{ one: 'person', other: 'people' }}
      rows={PEOPLE}
      getRowId={(p) => p.id}
      rowLabel={(p) => p.name}
      rowHeader="Person"
      rowColumns={[{ id: 'rank', header: 'Rank', cell: (p) => p.rank, value: (p) => p.rank }]}
      columns={COLUMNS}
      groups={GROUPS}
      getValue={(p, c) => p.grants[c.id] ?? false}
      renderCell={(context) => <MatrixToggleCell context={context} />}
      formatValue={(v) => (v ? 'Granted' : 'Not granted')}
      {...props}
    />,
  );
}

const rowNames = () =>
  within(screen.getByRole('table', { name: 'Access matrix' }))
    .getAllByRole('rowheader')
    .map((th) => th.textContent);

describe('structure', () => {
  it('keeps the header rows and the first column sticky', () => {
    renderGrid();
    const corner = screen.getByRole('columnheader', { name: /Person/ });
    expect(corner.className).toMatch(/\bsticky\b/);
    expect(corner.className).toContain('left-0');
    expect(corner.className).toContain('top-0');
    const rowHeader = screen.getAllByRole('rowheader')[0];
    expect(rowHeader.className).toMatch(/\bsticky\b/);
    expect(rowHeader.className).toContain('left-0');
  });

  it('groups columns under a spanning header, with the labels row stuck below it', () => {
    renderGrid();
    const sensitive = screen.getByRole('columnheader', { name: 'Sensitive records' });
    expect(sensitive).toHaveAttribute('colspan', '2');
    expect(sensitive).toHaveAttribute('scope', 'colgroup');
    expect(screen.getByRole('columnheader', { name: 'Finance' })).toHaveAttribute('colspan', '1');
    const med = screen.getByRole('columnheader', { name: /MED/ });
    expect(med.className).toContain('top-8');
    expect(med).toHaveAttribute('title', 'Can view medical');
  });

  it('wraps labels by default and rotates them on request', () => {
    const { unmount } = renderGrid();
    expect(screen.getByRole('columnheader', { name: /MED/ }).querySelector('[class*="writing-mode"]')).toBeNull();
    unmount();
    renderGrid({ labelMode: 'rotate', groups: undefined, columns: COLUMNS.map(({ group: _g, ...c }) => c) });
    const med = screen.getByRole('columnheader', { name: /MED/ });
    expect(med.querySelector('[class*="writing-mode:vertical-rl"]')).not.toBeNull();
    expect(med.className).toContain('top-0');
  });

  it('labels each cell control with row and column', () => {
    renderGrid({ editable: true, onSave: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Chief Stew, Can view HR files' })).toHaveAttribute('aria-checked', 'true');
  });
});

describe('crosshair', () => {
  it('highlights the hovered row and column through one scoped style rule', () => {
    const { container } = renderGrid();
    const style = container.querySelector('style[data-crosshair]')!;
    expect(style.textContent).toBe('');
    const cell = screen.getByRole('checkbox', { name: 'Bosun, Can run payroll' }).closest('td')!;
    fireEvent.pointerOver(cell);
    expect(style).toHaveAttribute('data-crosshair', '2:2');
    expect(style.textContent).toContain('tr[data-r="2"] > *');
    expect(style.textContent).toContain('[data-c="2"]');
    expect(style.textContent).toContain('--signal-muted');
    fireEvent.pointerLeave(screen.getByRole('table'));
    expect(style.textContent).toBe('');
  });

  it('follows keyboard focus too, and a header highlights its column only', () => {
    const { container } = renderGrid({ editable: true, onSave: vi.fn() });
    const style = container.querySelector('style[data-crosshair]')!;
    fireEvent.focus(screen.getByRole('checkbox', { name: 'Master, Can view medical' }));
    expect(style).toHaveAttribute('data-crosshair', '0:0');
    fireEvent.pointerOver(screen.getByRole('columnheader', { name: /HR/ }));
    expect(style).toHaveAttribute('data-crosshair', ':1');
  });
});

describe('rows: sort, search, chips, density', () => {
  it('sorts by the row header and by a descriptive column', () => {
    renderGrid();
    expect(rowNames()).toEqual(['Master', 'Chief Stew', 'Bosun']);
    const corner = screen.getByRole('columnheader', { name: /Person/ });
    fireEvent.click(within(corner).getByRole('button'));
    expect(rowNames()).toEqual(['Bosun', 'Chief Stew', 'Master']);
    expect(corner).toHaveAttribute('aria-sort', 'ascending');
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Rank/ })).getByRole('button'));
    expect(rowNames()).toEqual(['Chief Stew', 'Bosun', 'Master']);
  });

  it('searches rows by name and descriptive columns', () => {
    renderGrid();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search people' }), { target: { value: 'rating' } });
    expect(rowNames()).toEqual(['Bosun']);
    expect(screen.getByText('Showing 1 of 3 people')).toBeInTheDocument();
  });

  it('filters rows by count chips with live counts', () => {
    renderGrid({ filters: [{ id: 'none', label: 'No access', predicate: (p) => !Object.values(p.grants).some(Boolean) }] });
    const chip = screen.getByRole('button', { name: /No access/ });
    expect(chip).toHaveTextContent('1');
    fireEvent.click(chip);
    expect(rowNames()).toEqual(['Bosun']);
  });

  it('switches density for this grid', () => {
    const { container } = renderGrid();
    fireEvent.click(screen.getByRole('button', { name: 'Compact rows' }));
    expect(container.querySelector('section')).toHaveAttribute('data-density', 'compact');
  });

  it('virtualises above 200 rows', () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({
      id: `p${i}`,
      name: `Person ${String(i).padStart(3, '0')}`,
      rank: 'Rating',
      grants: {},
    }));
    const { container } = renderGrid({ rows });
    expect(container.querySelector('section')).toHaveAttribute('data-virtualised');
    expect(rowNames().length).toBeLessThan(100);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '602');
    expect(container.querySelector('tr[data-spacer]')).not.toBeNull();
  });
});

describe('states', () => {
  it('shows the first-use empty state', () => {
    renderGrid({ rows: [], empty: { title: 'No crew on this vessel yet' } });
    expect(screen.getByRole('heading', { name: 'No crew on this vessel yet' })).toBeInTheDocument();
  });

  it('shows loading and error bodies from the shared states', () => {
    const { unmount } = renderGrid({ isLoading: true });
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading people');
    unmount();
    renderGrid({ error: { code: '42P01', message: 'relation "public.access" does not exist' } });
    expect(screen.getByText('Not available yet')).toBeInTheDocument();
  });

  it('is read-only without onSave', () => {
    renderGrid({ editable: true });
    const box = screen.getByRole('checkbox', { name: 'Bosun, Can view medical' });
    expect(box).toBeDisabled();
  });
});

describe('staged edits: Review & save', () => {
  it('stages edits, counts the real diff and un-stages a cell set back', () => {
    renderGrid({ editable: true, onSave: vi.fn() });
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    const box = screen.getByRole('checkbox', { name: 'Bosun, Can view medical' });
    fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    expect(box.closest('td')).toHaveAttribute('data-staged');
    const footer = screen.getByRole('region', { name: 'Unsaved changes' });
    expect(footer).toHaveTextContent('1 unsaved change');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Master, Can run payroll' }));
    expect(footer).toHaveTextContent('2 unsaved changes');
    fireEvent.click(box);
    expect(footer).toHaveTextContent('1 unsaved change');
  });

  it('discards every staged edit', () => {
    renderGrid({ editable: true, onSave: vi.fn() });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bosun, Can view medical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Bosun, Can view medical' })).toHaveAttribute('aria-checked', 'false');
  });

  it('respects per-cell editability', () => {
    renderGrid({ editable: (_p, c) => c.id !== 'pay', onSave: vi.fn() });
    expect(screen.getByRole('checkbox', { name: 'Bosun, Can run payroll' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Bosun, Can view medical' })).not.toBeDisabled();
  });

  it('reviews every change before one save call, then clears', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderGrid({ editable: true, onSave });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bosun, Can view medical' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Chief Stew, Can view HR files' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));

    const dialog = await screen.findByRole('dialog', { name: 'Review changes' });
    const list = within(dialog).getByRole('list', { name: 'Changes to save' });
    expect(list).toHaveTextContent('Bosun');
    expect(list).toHaveTextContent('Can view medical');
    expect(list).toHaveTextContent(/from\s*Not granted.*to\s*Granted/);
    expect(list).toHaveTextContent(/Chief Stew.*Can view HR files.*from\s*Granted.*to\s*Not granted/);
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save 2 changes' }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith([
      { rowId: 'p3', columnId: 'med', from: false, to: true },
      { rowId: 'p2', columnId: 'hr', from: true, to: false },
    ]);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('region', { name: 'Unsaved changes' })).toBeNull();
    expect(screen.getByText(/2 changes saved/)).toBeInTheDocument();
  });

  it('keeps the edits staged and shows the real error when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('permission denied for table role_permissions'));
    renderGrid({ editable: true, onSave });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bosun, Can view medical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & save' }));
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save 1 change' }));
    });
    expect(within(dialog).getByText('Not saved')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The modal hides the rest of the page from assistive tech while it is open.
    expect(document.querySelector('[aria-label="Unsaved changes"]')).toHaveTextContent('1 unsaved change');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('region', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change');
  });
});
