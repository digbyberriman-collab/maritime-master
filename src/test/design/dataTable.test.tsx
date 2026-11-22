/**
 * DataTable (BUILD-PLAN A8; gap/10 DS14, §A.10): sticky header, sort, search,
 * count-chip filters, density, selection, row activation, explained empty
 * cells, tabular numbers, A7 page states, pagination and virtualisation
 * above 200 rows.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DataTable, type DataTableColumn } from '@/shared/components/data';
import { loadTokens } from './cssTokens';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  document.documentElement.removeAttribute('data-density');
});

type Vessel = { id: string; name: string; code: string; findings: number | null; due: string | null; status: 'open' | 'closed' };

const VESSELS: Vessel[] = [
  { id: 'v1', name: 'Draak', code: 'DRA', findings: 5, due: '2026-03-01', status: 'open' },
  { id: 'v2', name: 'Hydra', code: 'HYD', findings: 0, due: null, status: 'closed' },
  { id: 'v3', name: 'Albatross', code: 'ALB', findings: 12, due: '2025-11-30', status: 'open' },
];

const COLUMNS: DataTableColumn<Vessel>[] = [
  { id: 'name', header: 'Vessel', value: (v) => v.name, sticky: true },
  { id: 'code', header: 'Code', value: (v) => v.code, kind: 'reference', sortable: false },
  { id: 'findings', header: 'Findings', value: (v) => v.findings, kind: 'number', sortDescFirst: true },
  { id: 'due', header: 'Due', value: (v) => v.due, kind: 'date', emptyReason: 'Not covered' },
];

const noun = { one: 'vessel', other: 'vessels' };

const renderTable = (props: Partial<React.ComponentProps<typeof DataTable<Vessel>>> = {}) =>
  render(<DataTable<Vessel> label="Vessels" noun={noun} data={VESSELS} columns={COLUMNS} getRowId={(v) => v.id} {...props} />);

const bodyRows = () => {
  const table = screen.getByRole('table', { name: 'Vessels' });
  return within(table)
    .getAllByRole('row')
    .filter((row) => row.hasAttribute('data-row-id'));
};
const firstCells = () => bodyRows().map((row) => row.querySelectorAll('td')[0]?.textContent);

describe('layout', () => {
  it('renders a sticky, sentence-case header on the muted surface', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /Vessel/ });
    expect(header.className).toMatch(/\bsticky\b/);
    expect(header.className).toMatch(/\btop-0\b/);
    expect(header.className).toContain('bg-muted');
    expect(header.className).not.toContain('uppercase');
  });

  it('keeps a sticky first column', () => {
    renderTable();
    const cell = bodyRows()[0].querySelectorAll('td')[0];
    expect(cell.className).toMatch(/\bsticky\b/);
    expect(cell.className).toContain('left-0');
  });

  it('right-aligns numbers with tabular figures, sets references in mono and keeps dates on one line', () => {
    renderTable();
    const [name, code, findings, due] = Array.from(bodyRows()[0].querySelectorAll('td'));
    expect(name).toHaveTextContent('Draak');
    expect(code.className).toContain('type-mono');
    expect(findings.className).toContain('text-right');
    expect(findings.className).toContain('tabular-nums');
    expect(due.className).toContain('whitespace-nowrap');
    expect(screen.getByRole('table')).toHaveClass('tabular-nums');
  });

  it('explains an empty cell instead of a bare dash', () => {
    renderTable();
    const due = bodyRows()[1].querySelectorAll('td')[3];
    expect(due).toHaveTextContent('Not covered');
    expect(due.querySelector('[title="Not covered"]')).not.toBeNull();
  });

  it('summarises the rows in the footer', () => {
    renderTable();
    expect(screen.getByText('Showing 3 of 3 vessels')).toBeInTheDocument();
  });
});

describe('sorting', () => {
  it('sorts by a header, flips on the second click and reports aria-sort', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: /Vessel/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(firstCells()).toEqual(['Albatross', 'Draak', 'Hydra']);
    fireEvent.click(within(header).getByRole('button'));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(firstCells()).toEqual(['Hydra', 'Draak', 'Albatross']);
    expect(screen.getByText(/sorted by Vessel descending/)).toBeInTheDocument();
  });

  it('starts descending where the column asks for it (most findings first)', () => {
    renderTable();
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Findings/ })).getByRole('button'));
    expect(firstCells()).toEqual(['Albatross', 'Draak', 'Hydra']);
  });

  it('keeps empty values last and honours a default sort', () => {
    renderTable({ defaultSort: { columnId: 'due', direction: 'asc' } });
    expect(firstCells()).toEqual(['Albatross', 'Draak', 'Hydra']);
  });

  it('does not offer sorting on columns that opt out', () => {
    renderTable();
    const code = screen.getByRole('columnheader', { name: 'Code' });
    expect(within(code).queryByRole('button')).toBeNull();
    expect(code).not.toHaveAttribute('aria-sort');
  });
});

describe('search and count chips', () => {
  const filters = [
    { id: 'open', label: 'Open', predicate: (v: Vessel) => v.status === 'open' },
    { id: 'clear', label: 'No findings', predicate: (v: Vessel) => v.findings === 0 },
  ];

  it('searches the column values', () => {
    renderTable();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search vessels' }), { target: { value: 'hyd' } });
    expect(firstCells()).toEqual(['Hydra']);
    expect(screen.getByText('Showing 1 of 3 vessels')).toBeInTheDocument();
  });

  it('shows live counts and filters by the pressed chip', () => {
    renderTable({ filters });
    const group = screen.getByRole('group', { name: 'Filter vessels' });
    const all = within(group).getByRole('button', { name: /All/ });
    const open = within(group).getByRole('button', { name: /Open/ });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(all).toHaveTextContent('3');
    expect(open).toHaveTextContent('2');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-pressed', 'true');
    expect(firstCells()).toEqual(['Draak', 'Albatross']);
  });

  it('chip counts follow the search', () => {
    renderTable({ filters });
    const group = screen.getByRole('group', { name: 'Filter vessels' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'dra' } });
    // "dra" matches Draak and Hydra.
    expect(within(group).getByRole('button', { name: /All/ })).toHaveTextContent('2');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'draa' } });
    expect(within(group).getByRole('button', { name: /All/ })).toHaveTextContent('1');
    expect(within(group).getByRole('button', { name: /No findings/ })).toHaveTextContent('0');
  });

  it('shows the filtered empty state and clears every filter from it', () => {
    const onClearFilters = vi.fn();
    renderTable({ filters, onClearFilters });
    fireEvent.click(screen.getByRole('button', { name: /No findings/ }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'draak' } });
    expect(screen.getByText('Nothing matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('supports a controlled search', () => {
    const onSearchChange = vi.fn();
    renderTable({ search: 'alb', onSearchChange });
    expect(firstCells()).toEqual(['Albatross']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'x' } });
    expect(onSearchChange).toHaveBeenCalledWith('x');
  });
});

describe('page states (A7)', () => {
  it('loading: skeleton rows inside the table, announced, no footer', () => {
    renderTable({ isLoading: true });
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading vessels');
    expect(bodyRows()).toHaveLength(0);
    expect(screen.queryByText(/Showing/)).toBeNull();
  });

  it('first use: an empty state with the action the page allows', () => {
    renderTable({ data: [], empty: { title: 'No vessels yet', action: <button type="button">Add vessel</button> } });
    expect(screen.getByRole('heading', { name: 'No vessels yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add vessel' })).toBeInTheDocument();
  });

  it('error: a real error with retry, never mock rows', () => {
    const onRetry = vi.fn();
    renderTable({ error: new Error('Network down'), onRetry });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Network down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('a missing table reads as not available yet (D-01)', () => {
    renderTable({ error: { code: '42P01', message: 'relation "public.x" does not exist' } });
    expect(screen.getByText('Not available yet')).toBeInTheDocument();
  });
});

describe('selection and rows', () => {
  it('selects all shown rows from the header, then clears them', () => {
    const onSelectionChange = vi.fn();
    renderTable({ selectable: true, rowLabel: (v) => v.name, onSelectionChange });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown vessels' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['v1', 'v2', 'v3']);
    expect(bodyRows().every((row) => row.getAttribute('data-state') === 'selected')).toBe(true);
    expect(screen.getByText(/3 selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all shown vessels' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('marks a partly selected page as indeterminate', () => {
    renderTable({ selectable: true, rowLabel: (v) => v.name });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Hydra' }));
    expect(screen.getByRole('checkbox', { name: 'Select all shown vessels' })).toHaveAttribute('data-state', 'indeterminate');
    const selectedRow = bodyRows().find((row) => row.getAttribute('data-row-id') === 'v2')!;
    expect(selectedRow.className).toContain('bg-signal-muted');
  });

  it('activates a row by click or Enter, but not through its own controls', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    renderTable({
      onRowClick,
      rowActions: (v) => (
        <button type="button" onClick={() => onAction(v.id)}>
          Open {v.name}
        </button>
      ),
    });
    const row = bodyRows()[0];
    fireEvent.click(row.querySelectorAll('td')[0]);
    expect(onRowClick).toHaveBeenCalledWith(VESSELS[0]);
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: 'Open Draak' }));
    expect(onAction).toHaveBeenCalledWith('v1');
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  it('hooks every row for the cell-drawn focus ring and selected bar (sticky cells cannot cover them)', () => {
    renderTable({ selectable: true, rowLabel: (v) => v.name, onRowClick: () => undefined });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Hydra' }));
    for (const row of bodyRows()) {
      expect(row).toHaveClass('dt-row');
      expect(row).toHaveAttribute('tabindex', '0');
      // The row outline paints under positioned cells, so it is not the ring.
      expect(row.className).not.toContain('focus-ring-inset');
      // `.dt-row > td` is what index.css targets: every cell is a direct td.
      expect(Array.from(row.children).every((cell) => cell.tagName === 'TD')).toBe(true);
    }
    const selected = bodyRows().find((row) => row.getAttribute('data-row-id') === 'v2')!;
    expect(selected).toHaveAttribute('data-state', 'selected');
    const [selectionCell, stickyCell] = Array.from(selected.children) as HTMLElement[];
    for (const cell of [selectionCell, stickyCell]) {
      expect(cell.className).toMatch(/\bsticky\b/);
      expect(cell.matches('.dt-row > td')).toBe(true);
      // No shadow utility of its own that would replace the composed cues.
      expect(cell.className).not.toMatch(/(?:^|\s)shadow-/);
    }
    expect(selectionCell.matches('.dt-row > td:first-child')).toBe(true);
    expect(selectionCell.matches('.dt-row[data-state="selected"] > td:first-child')).toBe(true);
    const lastCell = selected.lastElementChild as HTMLElement;
    expect(lastCell.matches('.dt-row > td:last-child')).toBe(true);
  });

  it('keeps the selected bar on rows that are not clickable', () => {
    renderTable({ selectable: true, rowLabel: (v) => v.name });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Draak' }));
    const row = bodyRows().find((r) => r.getAttribute('data-row-id') === 'v1')!;
    expect(row).toHaveClass('dt-row');
    expect(row).not.toHaveAttribute('tabindex');
    expect((row.firstElementChild as HTMLElement).matches('.dt-row[data-state="selected"] > td:first-child')).toBe(true);
  });

  it('index.css draws the ring and the bar on the cells as stacked inset shadows', () => {
    const { rules } = loadTokens();
    const decls = (selector: string) => {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule, selector).toBeDefined();
      return rule!.decls;
    };
    expect(decls('.dt-row > td')['box-shadow']).toBe('var(--dt-ring-y), var(--dt-ring-start), var(--dt-ring-end), var(--dt-selected)');
    const ringY = decls('.dt-row:focus-visible > td')['--dt-ring-y'];
    expect(ringY).toContain('inset 0 var(--focus-ring-width) 0 0 hsl(var(--focus))');
    expect(ringY).toContain('inset 0 calc(var(--focus-ring-width) * -1) 0 0 hsl(var(--focus))');
    expect(decls('.dt-row:focus-visible > td:first-child')['--dt-ring-start']).toBe('inset var(--focus-ring-width) 0 0 0 hsl(var(--focus))');
    expect(decls('.dt-row:focus-visible > td:last-child')['--dt-ring-end']).toBe('inset calc(var(--focus-ring-width) * -1) 0 0 0 hsl(var(--focus))');
    expect(decls('.dt-row[data-state="selected"] > td:first-child')['--dt-selected']).toBe('inset 2px 0 0 0 hsl(var(--primary))');
    // Forced-colours fallback: a transparent outline the system paints when shadows are dropped.
    expect(decls('.dt-row:focus-visible').outline).toBe('var(--focus-ring-width) solid transparent');
  });

  it('reveals row actions on hover and focus, and always on touch', () => {
    renderTable({ rowActions: () => <button type="button">Act</button> });
    const holder = screen.getAllByRole('button', { name: 'Act' })[0].parentElement!;
    expect(holder.className).toContain('opacity-0');
    expect(holder.className).toContain('group-hover/row:opacity-100');
    expect(holder.className).toContain('group-focus-within/row:opacity-100');
    expect(holder.className).toContain('[@media(pointer:coarse)]:opacity-100');
  });
});

describe('density', () => {
  it('a density prop pins the table', () => {
    const { container } = renderTable({ density: 'compact' });
    expect(container.querySelector('section')).toHaveAttribute('data-density', 'compact');
  });

  it('the toggle changes this table only', () => {
    const { container } = renderTable();
    const group = screen.getByRole('group', { name: 'Row density' });
    fireEvent.click(within(group).getByRole('button', { name: 'Comfortable rows' }));
    expect(container.querySelector('section')).toHaveAttribute('data-density', 'comfortable');
    expect(within(group).getByRole('button', { name: 'Comfortable rows' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement).not.toHaveAttribute('data-density', 'comfortable');
  });

  it('rows take their height from the density token', () => {
    renderTable();
    expect(bodyRows()[0].className).toContain('h-[var(--row-h)]');
  });
});

describe('volume', () => {
  const many = (n: number): Vessel[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      name: `Vessel ${String(i).padStart(4, '0')}`,
      code: `V${i}`,
      findings: i,
      due: null,
      status: 'open',
    }));

  it('renders every row up to the threshold', () => {
    const { container } = renderTable({ data: many(200) });
    expect(bodyRows()).toHaveLength(200);
    expect(container.querySelector('[data-virtualised]')).toBeNull();
  });

  it('virtualises above 200 rows: a window of rows plus spacers', () => {
    const { container } = renderTable({ data: many(1000) });
    expect(container.querySelector('section')).toHaveAttribute('data-virtualised');
    const rendered = bodyRows();
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered.length).toBeLessThan(100);
    expect(screen.getByRole('table')).toHaveAttribute('aria-rowcount', '1001');
    expect(rendered[0]).toHaveAttribute('aria-rowindex', '2');
    const spacer = container.querySelector('tr[data-spacer]') as HTMLElement;
    expect(spacer).not.toBeNull();
    expect(parseInt(spacer.style.height, 10)).toBeGreaterThan(1000);
    expect(screen.getByText('Showing 1,000 of 1,000 vessels')).toBeInTheDocument();
  });

  it('sorting and search still cover every row when virtualised', () => {
    renderTable({ data: many(1000) });
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Findings/ })).getByRole('button'));
    expect(firstCells()[0]).toBe('Vessel 0999');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Vessel 0500' } });
    expect(firstCells()).toEqual(['Vessel 0500']);
  });

  it('paginates below the threshold when asked', () => {
    renderTable({ data: many(5), pageSize: 2 });
    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(firstCells()).toEqual(['Vessel 0002', 'Vessel 0003']);
    expect(screen.getByRole('button', { name: 'Next page' })).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });
});

describe('toolbar', () => {
  it('hands the rows as shown to toolbarEnd (for export)', () => {
    const seen = vi.fn();
    renderTable({
      toolbarEnd: ({ rows }) => {
        seen(rows.map((r) => r.id));
        return <button type="button">Export</button>;
      },
      defaultSort: { columnId: 'findings', direction: 'desc' },
    });
    expect(screen.getByRole('button', { name: 'Export' })).toBeInTheDocument();
    expect(seen).toHaveBeenLastCalledWith(['v3', 'v1', 'v2']);
  });
});
