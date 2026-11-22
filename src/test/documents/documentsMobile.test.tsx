/**
 * Documents register at phone width (/fleet/documents; Phase 1 S7, owner's
 * screenshot review: "the documents page is not usable at 390 px").
 *
 * - One PageHeader (the page's only heading of its own; the shell's interim
 *   PageLocationHeader h1 is L1c's to collapse, spec §7).
 * - Below 768 px the register is cards: no table, no list/table toggle.
 * - Below 1024 px the filter column becomes a "Filters" button that opens the
 *   same controls in a sheet; from 1024 px the column sits beside the list.
 * - Status chips come from the status registry (StatusPill), not raw palette.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Document } from '@/modules/documents/hooks/useDocuments';

const state = vi.hoisted(() => ({
  width: 390,
  documents: [] as unknown[],
  isLoading: false,
}));

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/documents/hooks/useDocuments', () => ({
  useDocuments: () => ({ data: state.documents, isLoading: state.isLoading }),
  useDocumentCategories: () => ({
    data: [{ id: 'cat-1', name: 'Manuals', icon: 'book-open', color: 'hsl(var(--chart-1))', display_order: 1 }],
  }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVessels: () => ({ vessels: [{ id: 'v-1', name: 'DRAAK' }] }) }));
vi.mock('@/modules/documents/components/UploadDocumentModal', () => ({ default: () => null }));
vi.mock('@/modules/documents/components/DocumentViewerModal', () => ({
  default: ({ open, document }: { open: boolean; document: Document | null }) =>
    open ? <div role="dialog" aria-label="Document viewer">{document?.title}</div> : null,
}));
vi.mock('@/modules/documents/components/DeleteDocumentDialog', () => ({ default: () => null }));

import Documents from '@/modules/documents/pages/Documents';

const doc = (id: string, title: string, status: string, extra: Partial<Document> = {}): Document => ({
  id,
  company_id: 'co-1',
  vessel_id: null,
  category_id: 'cat-1',
  document_number: `SMS-${id}`,
  title,
  description: null,
  revision: 'C',
  language: 'EN',
  file_url: 'https://example.invalid/file.pdf',
  file_name: 'file.pdf',
  file_size: 1024,
  file_type: 'application/pdf',
  status,
  author_id: 'u-1',
  reviewer_id: null,
  approver_id: null,
  issue_date: null,
  next_review_date: null,
  approved_date: null,
  tags: [],
  is_mandatory_read: false,
  ism_sections: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
  category: { id: 'cat-1', name: 'Manuals', icon: 'book-open', color: 'hsl(var(--chart-1))', display_order: 1 },
  vessel: null,
  ...extra,
});

/** matchMedia that answers `(min-width: Npx)` from the current width. */
function installMatchMedia() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => {
    const m = /min-width:\s*(\d+)px/.exec(query);
    const matches = m ? state.width >= Number(m[1]) : false;
    return {
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    } as MediaQueryList;
  }) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

let restore: () => void = () => undefined;

beforeEach(() => {
  state.width = 390;
  state.isLoading = false;
  state.documents = [
    doc('001', 'Safety Management Manual', 'Approved', { is_mandatory_read: true }),
    doc('014', 'Enclosed Space Entry', 'Under_Review'),
    doc('020', 'Garbage Management Plan', 'Obsolete'),
  ];
  restore = installMatchMedia();
});

afterEach(() => restore());

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/fleet/documents']}>
      <Documents />
    </MemoryRouter>,
  );

describe('documents at 390 px', () => {
  it('renders one PageHeader with the page title', () => {
    const { container } = renderPage();
    const headers = container.querySelectorAll('[data-page-heading]');
    expect(headers).toHaveLength(1);
    expect(within(headers[0] as HTMLElement).getByRole('heading', { level: 1 })).toHaveTextContent('Documents');
  });

  it('renders cards, not a table, and offers no table toggle', () => {
    renderPage();
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: 'Documents' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Table' })).toBeNull();
  });

  it('moves the filters into a sheet behind a Filters button', async () => {
    renderPage();
    expect(screen.queryByRole('complementary', { name: 'Document filters' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Status')).toBeInTheDocument();
    expect(within(sheet).getByLabelText('Vessel')).toBeInTheDocument();
  });

  it('shows status through the registry pill and keeps the card actions reachable on touch', () => {
    renderPage();
    const list = screen.getByRole('list', { name: 'Documents' });
    const review = within(list).getByText('Under review').closest('[data-tone]');
    expect(review).toHaveAttribute('data-tone', 'signal');
    expect(within(list).getByText('Approved').closest('[data-tone]')).toHaveAttribute('data-tone', 'ok');
    expect(within(list).getByText('Required reading').closest('[data-tone]')).toHaveAttribute('data-tone', 'danger');
    const actions = within(list).getByRole('button', { name: 'Actions for Enclosed Space Entry' });
    // Hidden until hover only on a fine pointer; always visible on touch.
    expect(actions.className).toContain('[@media(pointer:fine)]:opacity-0');
    expect(actions.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(list.innerHTML).not.toMatch(/(bg|text)-(yellow|green|red)-\d/);
  });

  it('opens a document from the card title with the keyboard', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Enclosed Space Entry' }));
    expect(screen.getByRole('dialog', { name: 'Document viewer' })).toHaveTextContent('Enclosed Space Entry');
  });

  it('marks the loading state busy and says when filters match nothing', () => {
    state.isLoading = true;
    const loadingView = renderPage();
    expect(loadingView.container.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    loadingView.unmount();
    state.isLoading = false;
    state.documents = [];
    renderPage();
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });
});

describe('documents on wider screens', () => {
  it('shows the table toggle from 768 px and renders the table on request', () => {
    state.width = 800;
    renderPage();
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    const table = screen.getByRole('table');
    expect(within(table).getByText('Garbage Management Plan')).toBeInTheDocument();
    // Still a Filters button below 1024 px.
    expect(screen.getByRole('button', { name: /filters/i })).toBeInTheDocument();
  });

  it('puts the filter column beside the list from 1024 px', () => {
    state.width = 1440;
    renderPage();
    expect(screen.getByRole('complementary', { name: 'Document filters' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^filters/i })).toBeNull();
  });
});
