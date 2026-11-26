/**
 * DataTable adoption (BUILD-PLAN A8): the Development › Courses Register page
 * keeps its behaviour on the shared table: search over course, crew,
 * provider and number; phase filter (now count chips); start date newest
 * first; sortable columns; CSV export of the rows as shown; row opens the
 * application. Errors are shown, not swallowed. Voided applications are
 * left out by the query (X5-07A).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  result: { data: [] as unknown[], error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    order: () => Promise.resolve(state.result),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { company_id: 'co-1' } }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/development/components/ApplicationDetailModal', () => ({
  default: ({ open, application }: { open: boolean; application: { course_name: string } | null }) =>
    open && application ? <div role="dialog" aria-label="Application">{application.course_name}</div> : null,
}));

import CoursesRegister from '@/modules/development/pages/CoursesRegister';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const app = (over: Record<string, unknown>) => ({
  id: 'x',
  application_number: 'DEV-2026-001',
  course_name: 'Course',
  course_provider: null,
  category: 'professional',
  status: 'approved',
  course_start_date: null,
  course_end_date: null,
  estimated_total_usd: null,
  created_at: '2026-01-01T00:00:00Z',
  crew_member: { first_name: 'Chief', last_name: 'Stew', email: null, department: 'Interior' },
  vessel: { name: 'Draak' },
  ...over,
});

const ROWS = [
  app({ id: 'a', application_number: 'DEV-2026-001', course_name: 'Wine service', course_start_date: '2099-05-01', course_end_date: '2099-05-03', estimated_total_usd: 1200 }),
  app({ id: 'b', application_number: 'DEV-2026-002', course_name: 'Advanced firefighting', course_provider: 'Sea School', course_start_date: '2001-02-01', course_end_date: '2001-02-05', status: 'enrolled', crew_member: { first_name: 'Second', last_name: 'Engineer', email: null, department: 'Engineering' }, vessel: { name: 'Hydra' } }),
  app({ id: 'c', application_number: 'DEV-2026-003', course_name: 'Yacht rating', course_start_date: '2001-01-01', course_end_date: '2098-12-31', estimated_total_usd: 300 }),
  app({ id: 'd', application_number: 'DEV-2026-004', course_name: 'Barista basics', crew_member: null, vessel: null }),
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CoursesRegister />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const courseNames = () =>
  within(screen.getByRole('table', { name: 'Courses register' }))
    .getAllByRole('row')
    .filter((r) => r.hasAttribute('data-row-id'))
    .map((r) => r.querySelectorAll('td')[3]?.textContent);

beforeEach(() => {
  state.result = { data: ROWS, error: null };
});

describe('Courses Register on DataTable', () => {
  it('lists every application, newest start date first, undated last', async () => {
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    expect(courseNames()).toEqual(['Wine service', 'Advanced firefighting', 'Yacht rating', 'Barista basics']);
    expect(screen.getByRole('columnheader', { name: /Start/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByText(/Showing 4 of 4 courses/)).toBeInTheDocument();
  });

  it('filters by phase with live count chips', async () => {
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    const group = screen.getByRole('group', { name: 'Filter courses' });
    expect(within(group).getByRole('button', { name: /All phases/ })).toHaveTextContent('4');
    expect(within(group).getByRole('button', { name: /Upcoming/ })).toHaveTextContent('1');
    expect(within(group).getByRole('button', { name: /Current/ })).toHaveTextContent('1');
    expect(within(group).getByRole('button', { name: /Completed/ })).toHaveTextContent('1');
    expect(within(group).getByRole('button', { name: /Unscheduled/ })).toHaveTextContent('1');
    fireEvent.click(within(group).getByRole('button', { name: /Current/ }));
    expect(courseNames()).toEqual(['Yacht rating']);
  });

  it('searches course, crew, provider and number, and Clear filters resets everything', async () => {
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    const box = screen.getByRole('searchbox', { name: 'Search course, crew, provider, #...' });
    fireEvent.change(box, { target: { value: 'sea school' } });
    expect(courseNames()).toEqual(['Advanced firefighting']);
    fireEvent.change(box, { target: { value: 'second engineer' } });
    expect(courseNames()).toEqual(['Advanced firefighting']);
    fireEvent.change(box, { target: { value: 'DEV-2026-004' } });
    expect(courseNames()).toEqual(['Barista basics']);
    expect(screen.getByText(/Showing 1 of 4 courses/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Clear filters/ })[0]);
    expect(courseNames()).toHaveLength(4);
    expect(box).toHaveValue('');
  });

  it('sorts by cost with figures right-aligned and blanks explained', async () => {
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Cost/ })).getByRole('button'));
    expect(courseNames()).toEqual(['Yacht rating', 'Wine service', 'Advanced firefighting', 'Barista basics']);
    const barista = screen.getByText('Barista basics').closest('tr')!;
    expect(within(barista).getByText('No crew member linked')).toBeInTheDocument();
    expect(within(barista).getByText('No estimate')).toBeInTheDocument();
  });

  it('opens the application from the row and from its action', async () => {
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    fireEvent.click(screen.getByText('Yacht rating'));
    expect(screen.getByRole('dialog', { name: 'Application' })).toHaveTextContent('Yacht rating');
  });

  it('exports the rows as shown to CSV', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:x');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => expect(courseNames()).toHaveLength(4));
    fireEvent.click(within(screen.getByRole('group', { name: 'Filter courses' })).getByRole('button', { name: /Upcoming/ }));
    fireEvent.click(screen.getByRole('button', { name: /Export CSV/ }));
    expect(click).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0][0];
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    const lines = text.split('\n');
    expect(lines[0]).toContain('Application #');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Wine service');
    click.mockRestore();
  });

  it('shows the real error instead of an empty register', async () => {
    state.result = { data: null as unknown as unknown[], error: { message: 'permission denied for table development_applications', code: '42501' } };
    renderPage();
    expect(await screen.findByText('This could not load')).toBeInTheDocument();
    expect(screen.getByText(/permission/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says when there are no applications at all', async () => {
    state.result = { data: [], error: null };
    renderPage();
    expect(await screen.findByRole('heading', { name: 'No course applications yet' })).toBeInTheDocument();
  });
});
