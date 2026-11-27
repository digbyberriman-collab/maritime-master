/**
 * The legacy familiarisation tab (X1-10; gap/04 C63), now the D-01
 * fallback of crew/familiarisation:
 *
 * - C63: starting from a template copies that template's sections into the
 *   checklist (it always copied the default sections); without a template
 *   the default sections are used;
 * - with `vesselId` the list and the start dialog keep to the route vessel
 *   (no vessel picker; records of other vessels are not shown);
 * - statuses are read in both vocabularies (legacy In_Progress / Completed /
 *   Overdue and X1-10 open / in_progress / awaiting_signatures / completed),
 *   and a record past its date counts as overdue.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  records: [] as Record<string, unknown>[],
  templates: [] as Record<string, unknown>[],
  start: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: null, error: null }) } }));
vi.mock('@/modules/training/hooks/useTraining', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/modules/training/hooks/useTraining')>();
  return {
    ...actual,
    useTraining: () => ({
      familiarizationRecords: h.records,
      templates: h.templates,
      startFamiliarization: { mutateAsync: (...a: unknown[]) => h.start(...a), isPending: false },
      updateChecklistItem: { mutateAsync: vi.fn() },
      fetchChecklistItems: vi.fn().mockResolvedValue([]),
      isLoading: false,
    }),
  };
});
vi.mock('@/modules/crew/hooks/useCrew', () => ({
  useCrew: () => ({
    crew: [
      { user_id: 'u-sam', first_name: 'Sam', last_name: 'Stewart', rank: 'Stewardess', role: 'crew' },
      { user_id: 'u-chris', first_name: 'Chris', last_name: 'Chief', rank: 'Chief Officer', role: 'chief_officer' },
    ],
  }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({
  useVessels: () => ({ vessels: [{ id: 'v-dra', name: 'DRAAK' }, { id: 'v-other', name: 'OTHER' }] }),
}));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { user_id: 'u-chris' } }) }));

import FamiliarizationTab from '@/modules/training/components/FamiliarizationTab';

const TEMPLATE = {
  id: 'tpl-galley',
  vessel_id: 'v-dra',
  template_name: 'Galley familiarisation',
  total_duration_days: 7,
  is_active: true,
  applicable_ranks: [],
  sections: [
    { section_name: 'Galley', checklist_items: ['Fire blanket shown', 'Gas shut-off shown'] },
    { section_name: 'Stores', checklist_items: ['Cold store alarm explained'] },
  ],
};

const rec = (over: Record<string, unknown>) => ({
  id: 'r',
  vessel_id: 'v-dra',
  user_id: 'u-sam',
  status: 'In_Progress',
  completion_percentage: 0,
  join_date: '2026-11-01',
  target_completion_date: '2099-01-01',
  user: { first_name: 'Sam', last_name: 'Stewart', rank: 'Stewardess' },
  vessel: { name: 'DRAAK' },
  supervisor: null,
  ...over,
});

async function choose(trigger: HTMLElement, option: string | RegExp) {
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const item = await screen.findByRole('option', { name: option });
  fireEvent.keyDown(item, { key: 'Enter' });
}

const stat = (label: string) => {
  const el = screen.getByText(label, { selector: 'p' });
  return (el.previousElementSibling as HTMLElement).textContent;
};

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
  if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = () => false;
  if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  h.records = [];
  h.templates = [TEMPLATE, { ...TEMPLATE, id: 'tpl-other', vessel_id: 'v-other', template_name: 'Other vessel template' }];
  h.start.mockReset();
  h.start.mockResolvedValue({ id: 'new' });
});

describe('statuses in both vocabularies, and the route vessel only', () => {
  it('counts legacy and X1-10 statuses alike, a past date as overdue, and hides other vessels', () => {
    h.records = [
      rec({ id: 'a', status: 'In_Progress' }),
      rec({ id: 'b', status: 'in_progress' }),
      rec({ id: 'c', status: 'awaiting_signatures' }),
      rec({ id: 'd', status: 'open', target_completion_date: '2020-01-01' }),
      rec({ id: 'e', status: 'Completed' }),
      rec({ id: 'f', status: 'completed' }),
      rec({ id: 'g', status: 'In_Progress', vessel_id: 'v-other' }),
    ];
    render(<FamiliarizationTab vesselId="v-dra" />);
    expect(stat('In Progress')).toBe('4');
    expect(stat('Completed')).toBe('2');
    expect(stat('Overdue')).toBe('1');
    // The status pill speaks the new vocabulary for every record.
    expect(screen.getAllByText('In progress').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Awaiting signatures')).toBeInTheDocument();
  });
});

describe('C63: start copies the chosen template', () => {
  it("the template's sections become the checklist, numbered section by section, on the route vessel", async () => {
    render(<FamiliarizationTab vesselId="v-dra" />);
    fireEvent.click(screen.getAllByRole('button', { name: /Start Familiarization/ })[0]);
    const dialog = await screen.findByRole('dialog');
    // The vessel is the route's: no vessel picker, and the other vessel's template is not offered.
    expect(within(dialog).queryByText('Vessel')).toBeNull();
    const triggers = within(dialog).getAllByRole('combobox');
    await choose(triggers[0], /Sam Stewart/);
    fireEvent.keyDown(triggers[1], { key: 'Enter' });
    expect(screen.queryByRole('option', { name: 'Other vessel template' })).toBeNull();
    fireEvent.keyDown(await screen.findByRole('option', { name: 'Galley familiarisation' }), { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Familiarization' }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
    const arg = h.start.mock.calls[0][0] as { record: Record<string, unknown>; checklistItems: Record<string, unknown>[] };
    expect(arg.record.vessel_id).toBe('v-dra');
    expect(arg.record.template_id).toBe('tpl-galley');
    expect(arg.record.user_id).toBe('u-sam');
    expect(String(arg.record.join_date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(arg.checklistItems).toEqual([
      { section_name: 'Galley', item_text: 'Fire blanket shown', item_order: 1001, completed: false },
      { section_name: 'Galley', item_text: 'Gas shut-off shown', item_order: 1002, completed: false },
      { section_name: 'Stores', item_text: 'Cold store alarm explained', item_order: 2001, completed: false },
    ]);
  });

  it('without a template the default sections are used', async () => {
    render(<FamiliarizationTab vesselId="v-dra" />);
    fireEvent.click(screen.getAllByRole('button', { name: /Start Familiarization/ })[0]);
    const dialog = await screen.findByRole('dialog');
    await choose(within(dialog).getAllByRole('combobox')[0], /Sam Stewart/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Familiarization' }));
    await waitFor(() => expect(h.start).toHaveBeenCalledTimes(1));
    const arg = h.start.mock.calls[0][0] as { record: Record<string, unknown>; checklistItems: { section_name: string }[] };
    expect(arg.record.template_id).toBeNull();
    expect(arg.checklistItems[0].section_name).toBe('Safety & Emergency');
    expect(arg.checklistItems.length).toBeGreaterThan(5);
  });
});
