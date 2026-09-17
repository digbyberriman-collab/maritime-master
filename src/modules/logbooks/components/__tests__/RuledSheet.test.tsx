import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RuledSheet from '../RuledSheet';
import BookStrip from '../BookStrip';
import { LOGBOOK_BOOKS } from '../../lib/catalog';
import { bookColumns } from '../../lib/lineLayouts';
import type { EntryView } from '../../lib/types';
import type { LineBuffer } from '../../hooks/useWorkingCopies';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) }), storage: { from: () => ({}) } } }));
vi.mock('../LogbookAttachments', () => ({ default: () => <div data-testid="attachments" /> }));

const garbage = LOGBOOK_BOOKS.find((b) => b.id === 'garbage')!;
const reception = garbage.sections.find((s) => s.id === 'reception')!;
const official = LOGBOOK_BOOKS.find((b) => b.id === 'official')!;
const drills = official.sections.find((s) => s.id === 'drills')!;

const entry = (overrides: Partial<EntryView> = {}): EntryView => ({
  id: 'e1', logbook_id: 'l1', company_id: 'c1', vessel_id: 'v1', entry_at: '2026-09-15T10:00:00.000Z', entry_date: '2026-09-15', watch_period: null,
  page_number: null, summary: null, remarks: 'Fictional drill', data: { drill: 'Postponed / cancelled' }, latitude: null, longitude: null, position_text: null,
  status: 'draft', recorded_by: 'u1', recorded_by_name: 'Alex Morgan', signed_by: null, signed_by_name: null, signed_at: null, amended_from_id: null,
  amendment_reason: null, version: 1, updated_by: null, updated_by_name: null, created_at: '2026-09-15T10:01:00.000Z', updated_at: '2026-09-15T10:01:00.000Z',
  volume_id: 'vol1', section_id: 'drills', flag_profile: 'CISR', template_revision: 'workbooks-0.2.1', schema_snapshot: drills, line_number: 1, digest: null,
  source_sample_id: null, source_snapshot: null, override_reason: null, superseded_by_id: null, page_id: null, recorded_capacity: 'officer', signatures: [], ...overrides,
});

const buffer = (e: EntryView): LineBuffer => ({
  id: e.id, existingId: e.id, bookId: 'official', volumeId: 'vol1', sectionId: 'drills', schema: drills, version: e.version,
  fields: Object.fromEntries(Object.entries(e.data).map(([k, v]) => [k, String(v)])), occurredAt: '2026-09-15T10:00', originalTime: e.entry_at,
  notes: e.remarks ?? '', sample: null, overrideReason: '', correctsId: null, correctionReason: '', dirty: false,
});

const handlers = () => ({
  onChange: vi.fn(), onSave: vi.fn(), onRevert: vi.fn(), onDiscard: vi.fn(), onDelete: vi.fn(), onAttest: vi.fn(), onCorrect: vi.fn(), onOpenEntry: vi.fn(), onViewPage: vi.fn(),
});

const renderSheet = (props: Partial<React.ComponentProps<typeof RuledSheet>> = {}) => {
  const h = handlers();
  const utils = render(
    <QueryClientProvider client={new QueryClient()}>
    <RuledSheet
      book={official} section={drills} columns={bookColumns('official', drills)} rows={[]} buffers={{}} newRows={[]} allEntries={[]}
      highlightedId={null} busyIds={new Set()} errors={{}} editable fixed={false} capacity="officer" userId="u1" canManageAttachments
      canCorrectEntry={() => false} onWriteOnLine={vi.fn()} {...h} {...props}
    />
    </QueryClientProvider>,
  );
  return { ...utils, h };
};

describe('RuledSheet', () => {
  it('shows ruled blank lines with grouped field labels and a write-on-line control for an empty section', () => {
    const onWriteOnLine = vi.fn();
    renderSheet({ book: garbage, section: reception, columns: bookColumns('garbage', reception), onWriteOnLine });
    expect(screen.getByRole('columnheader', { name: /To facility \/ ship · m³/ })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Incinerated · m³/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Write on this line' }));
    expect(onWriteOnLine).toHaveBeenCalled();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 blank lines
  });

  it('renders every schema field as an editable cell for the author of a draft and saves with Ctrl+Enter', () => {
    const e = entry();
    const { h } = renderSheet({ rows: [e], buffers: { [e.id]: { ...buffer(e), dirty: true } } });
    for (const field of drills.fields) {
      expect(screen.getByLabelText(`${field.label} · line 1`)).toBeInTheDocument();
    }
    fireEvent.keyDown(screen.getByLabelText('Event time UTC · line 1'), { key: 'Enter', ctrlKey: true });
    expect(h.onSave).toHaveBeenCalledWith('e1');
    fireEvent.click(screen.getByRole('button', { name: 'Save line' }));
    expect(h.onSave).toHaveBeenCalledTimes(2);
  });

  it('lists missing required fields as focusable links and disables review until the line is complete', () => {
    const e = entry();
    renderSheet({ rows: [e], buffers: { [e.id]: buffer(e) } });
    const missing = screen.getByText(/fields? to complete/);
    expect(missing).toBeInTheDocument();
    const reason = screen.getByRole('button', { name: /Postponement \/ defect action is required before signing/ });
    fireEvent.click(reason);
    expect(document.activeElement).toBe(screen.getByLabelText('Postponement / defect action · line 1'));
    expect(screen.getByRole('checkbox', { name: 'I have reviewed this line' })).toBeDisabled();
  });

  it('locks signed lines, shows the signatures beside them and offers Master review to the Master', () => {
    const e = entry({
      status: 'signed', version: 3, digest: 'abc',
      signatures: [{ id: 's1', entry_id: 'e1', company_id: 'c1', vessel_id: 'v1', kind: 'author', actor_id: 'u1', actor_name: 'Alex Morgan', actor_role: 'officer', actor_capacity: 'officer', witness_name: null, witness_capacity: null, digest: 'abc', entry_version: 2, page_id: null, method: 'reviewed-attestation', statement: null, signed_at: '2026-09-15T10:05:00.000Z' }],
    });
    const { h } = renderSheet({ rows: [e], capacity: 'master', userId: 'm1', canCorrectEntry: () => true });
    expect(screen.queryByLabelText(/· line 1$/)).toBeNull();
    const cell = screen.getByText('Alex Morgan').closest('td')!;
    expect(within(cell).getByText(/Signed · Deck officer/)).toBeInTheDocument();
    expect(within(cell).getByText('Awaiting Master')).toBeInTheDocument();
    const review = within(cell).getByRole('button', { name: /Master review/ });
    expect(review).toBeDisabled();
    fireEvent.click(within(cell).getByRole('checkbox'));
    expect(review).toBeEnabled();
    fireEvent.click(review);
    expect(h.onAttest).toHaveBeenCalledWith(e, 'verify', undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Add correction line' }));
    expect(h.onCorrect).toHaveBeenCalledWith(e);
  });
});

describe('BookStrip', () => {
  it('lists all books, filters by title or code and selects with Enter', () => {
    const onSelect = vi.fn();
    const Wrapper = () => {
      const [query, setQuery] = React.useState('');
      return <BookStrip books={LOGBOOK_BOOKS} counts={{ deck: { records: 3, drafts: 1 } }} selectedId="official" onSelect={onSelect} query={query} onQueryChange={setQuery} />;
    };
    render(<Wrapper />);
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(19);
    expect(screen.getByRole('button', { name: 'Open Official logbook' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1 draft')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a logbook'), { target: { value: 'bw' } });
    const cards = screen.getAllByRole('button', { name: /^Open / });
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAccessibleName('Open Ballast water record');
    fireEvent.click(cards[0]);
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'ballast' }));
    fireEvent.change(screen.getByLabelText('Find a logbook'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No logbooks match/)).toBeInTheDocument();
  });
});
