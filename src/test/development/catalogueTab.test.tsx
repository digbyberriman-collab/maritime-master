/**
 * Fleet › Training › Catalogue (X5-07B; gap/02 TR7, TR8; D-01, D-X5-05):
 *
 * - courses show with their rules (valid for, renewal, who it applies to,
 *   mandatory, the qualification it grants), active by default, archived on
 *   the chip; a course promoted from a proposal says so;
 * - while the rule columns are missing the rule cells read "Not set up yet",
 *   the live columns still show, and every catalogue action is disabled with
 *   that reason;
 * - only training admins add, edit, archive or promote; a save goes through
 *   development_course_save with the course schema's payload, an edit with
 *   its id and the updated_at it loaded; nothing says "saved" until the
 *   returned row is this company's course; a refusal is a sentence in the
 *   dialog, which stays open; a missing definer is "not set up yet";
 * - "Add to catalogue" sends development_course_promote and checks the
 *   course came from that application.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { COMPANY, application, freshTrainingState, vesselsReady, type FakeRow, type TrainingDbState } from './fakeTrainingDb';

const h = vi.hoisted(() => ({
  state: null as unknown as TrainingDbState,
  caps: {} as Record<string, boolean>,
  vessels: null as unknown,
}));

vi.mock('@/integrations/supabase/client', async () => {
  const { createTrainingDb: create } = await import('./fakeTrainingDb');
  return {
    supabase: {
      from: (t: string) => create(h.state).from(t),
      rpc: (fn: string, args: Record<string, unknown>) => create(h.state).rpc(fn, args),
    },
  };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me' }, profile: { company_id: 'co-1' } }) }));
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ status: 'allowed', allowed: true }),
  useCan: (key: string) => Boolean(h.caps[key]),
}));
vi.mock('@/modules/fleet', () => ({ useFleetVesselsShown: () => h.vessels }));
vi.mock('@/shared/components/data/useMinWidth', () => ({ useMinWidth: () => true, TABLET_MIN_WIDTH: 768 }));
vi.mock('@/modules/development/components/ApplicationDetailModal', () => ({ default: () => null }));

import FleetTrainingPage from '@/modules/development/pages/FleetTrainingPage';

beforeAll(() => {
  if (!window.PointerEvent) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const STAMP = '2026-11-20T10:00:00.000Z';

function course(id: string, over: FakeRow = {}): FakeRow {
  return {
    id,
    company_id: COMPANY,
    catalogue_number: null,
    name: `Course ${id}`,
    department: 'Deck',
    sub_section: null,
    category: 'mandatory',
    format: 'in_person',
    duration_description: '5 days',
    renewal_period: null,
    reimbursement_summary: null,
    notes: null,
    contact_person: null,
    over_4k_rule: false,
    requires_fleet_doctor_agreement: false,
    tags: [],
    status: 'active',
    updated_at: STAMP,
    valid_for_months: 60,
    renew_from_months: 6,
    applies_to_departments: ['Deck'],
    applies_to_positions: ['Bosun'],
    is_mandatory: true,
    renewal_note: null,
    pathway: null,
    origin: 'catalogue',
    proposed_by: null,
    proposed_from_application_id: null,
    qualification_label: 'Advanced firefighting certificate',
    qualification_document_type_id: null,
    ...over,
  };
}

function renderCatalogue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/fleet/training/catalogue']}>
        <Routes>
          <Route path="/fleet/training/:tab" element={<FleetTrainingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const savedRow = (over: FakeRow = {}) => ({ data: { ...course('new', { name: 'Medical first aid' }), ...over }, error: null });

beforeEach(() => {
  h.state = freshTrainingState();
  h.state.rows.development_courses = [
    course('c1', { name: 'Advanced firefighting' }),
    course('c2', { name: 'Ship security officer', status: 'archived', valid_for_months: null, renew_from_months: null, applies_to_departments: [], applies_to_positions: [], is_mandatory: false, qualification_label: null }),
    course('c3', { name: 'Plant-based cuisine', category: 'extracurricular', origin: 'proposed', valid_for_months: null, renew_from_months: null, applies_to_departments: [], applies_to_positions: [], is_mandatory: false, qualification_label: null }),
  ];
  h.state.rows.development_applications = [
    application('p1', { course_name: 'Superyacht interior design', is_custom_course: true, course_id: null, status: 'hod_review' }),
    application('p2', { course_name: 'Already promoted', is_custom_course: true, course_id: 'c3', status: 'approved' }),
  ];
  h.state.rows.program_settings = [{ id: 'ps', company_id: COMPANY, final_approval_mode: 'both', category_labels: {}, fx_overrides: {} }];
  h.caps = { 'fleet.operations.fleet_training.view': true };
  h.vessels = vesselsReady();
});

const coursesTable = () => screen.findByRole('table', { name: 'Courses' });

describe('the catalogue', () => {
  it('lists the active courses with their rules, archived ones on the chip', async () => {
    renderCatalogue();
    const table = await coursesTable();
    const row = within(table).getByText('Advanced firefighting').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('60 months');
    expect(row).toHaveTextContent('6 months before');
    expect(row).toHaveTextContent('Deck, Bosun');
    expect(row).toHaveTextContent('Yes');
    expect(row).toHaveTextContent('Advanced firefighting certificate');
    expect(within(table).getByText('Plant-based cuisine').closest('tr')).toHaveTextContent('From a crew proposal');
    expect(within(table).queryByText('Ship security officer')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Archived/ }));
    expect(within(await coursesTable()).getByText('Ship security officer')).toBeInTheDocument();
  });

  it('lists crew proposals not yet in the catalogue', async () => {
    renderCatalogue();
    const heading = await screen.findByRole('heading', { name: 'Crew proposals' });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText('Superyacht interior design')).toBeInTheDocument();
    expect(within(section).queryByText('Already promoted')).toBeNull();
    // Readers see proposals but cannot promote them.
    expect(within(section).queryByRole('button', { name: /Add to catalogue/ })).toBeNull();
  });

  it('offers nothing to change to someone who is not a training admin', async () => {
    renderCatalogue();
    await coursesTable();
    expect(screen.queryByRole('button', { name: /New course/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
  });
});

describe('before the rule columns are set up (D-01)', () => {
  beforeEach(() => {
    h.caps['fleet.operations.fleet_training.admin'] = true;
    h.state.missingColumns.add('development_courses.valid_for_months');
  });

  it('reads the live columns, says the rules are not set up, and disables every action', async () => {
    renderCatalogue();
    const table = await coursesTable();
    const row = within(table).getByText('Advanced firefighting').closest('tr') as HTMLElement;
    expect(within(row).getAllByText('Not set up yet').length).toBeGreaterThan(0);
    expect(screen.getByTestId('catalogue-rules-not-set-up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New course/ })).toBeDisabled();
    const section = (await screen.findByRole('heading', { name: 'Crew proposals' })).closest('section') as HTMLElement;
    expect(within(section).getByRole('button', { name: /Add to catalogue/ })).toBeDisabled();
  });
});

describe('a training admin', () => {
  beforeEach(() => {
    h.caps['fleet.operations.fleet_training.admin'] = true;
  });

  it('adds a course with its rules through development_course_save', async () => {
    h.state.rpc.development_course_save = savedRow();
    renderCatalogue();
    await coursesTable();
    fireEvent.click(screen.getByRole('button', { name: /New course/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New course' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Medical first aid' } });
    fireEvent.change(within(dialog).getByLabelText('Valid for (months)'), { target: { value: '60' } });
    fireEvent.change(within(dialog).getByLabelText('Renewal opens (months before expiry)'), { target: { value: '3' } });
    fireEvent.change(within(dialog).getByLabelText('Grants qualification'), { target: { value: 'Medical first aid certificate' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add course' }));
    await waitFor(() => expect(h.state.rpcCalls.map((c) => c.fn)).toContain('development_course_save'));
    const course = h.state.rpcCalls.find((c) => c.fn === 'development_course_save')?.args.p_course as Record<string, unknown>;
    expect(course).toMatchObject({
      name: 'Medical first aid',
      department: 'All',
      category: 'professional',
      valid_for_months: 60,
      renew_from_months: 3,
      qualification_label: 'Medical first aid certificate',
      applies_to_departments: [],
      applies_to_positions: [],
      is_mandatory: false,
    });
    expect(course).not.toHaveProperty('id');
    expect(course).not.toHaveProperty('qualification_document_type_id');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New course' })).toBeNull());
    expect(h.state.writes).toEqual([]);
  });

  it('refuses a renewal window that does not open before expiry, before sending anything', async () => {
    renderCatalogue();
    await coursesTable();
    fireEvent.click(screen.getByRole('button', { name: /New course/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New course' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Medical first aid' } });
    fireEvent.change(within(dialog).getByLabelText('Valid for (months)'), { target: { value: '12' } });
    fireEvent.change(within(dialog).getByLabelText('Renewal opens (months before expiry)'), { target: { value: '12' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add course' }));
    expect(await within(dialog).findByText('Renewal must open before the course expires')).toBeInTheDocument();
    expect(h.state.rpcCalls).toEqual([]);
  });

  it('edits a course with its id and the updated_at it loaded; a refusal stays in the dialog', async () => {
    h.state.rpc.development_course_save = { data: null, error: { code: '22023', message: 'stale_course' } };
    renderCatalogue();
    const table = await coursesTable();
    const row = within(table).getByText('Advanced firefighting').closest('tr') as HTMLElement;
    fireEvent.pointerDown(within(row).getByRole('button', { name: 'Actions for Advanced firefighting' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Edit/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit course' });
    expect(within(dialog).getByLabelText('Valid for (months)')).toHaveValue('60');
    fireEvent.change(within(dialog).getByLabelText('Valid for (months)'), { target: { value: '36' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save course' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone changed this course since you opened it.');
    const args = h.state.rpcCalls[0].args.p_course as Record<string, unknown>;
    expect(args).toMatchObject({ id: 'c1', expected_updated_at: STAMP, valid_for_months: 36 });
    expect(screen.getByRole('dialog', { name: 'Edit course' })).toBeInTheDocument();
  });

  it('never says saved when the answer is not this company’s course', async () => {
    h.state.rpc.development_course_save = savedRow({ company_id: 'someone-else' });
    renderCatalogue();
    await coursesTable();
    fireEvent.click(screen.getByRole('button', { name: /New course/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New course' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Medical first aid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add course' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('did not confirm the change');
  });

  it('says the catalogue is not set up yet when the definer is missing', async () => {
    renderCatalogue();
    await coursesTable();
    fireEvent.click(screen.getByRole('button', { name: /New course/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New course' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Medical first aid' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add course' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('not set up yet');
  });

  it('adds a crew proposal to the catalogue through development_course_promote', async () => {
    h.state.rpc.development_course_promote = (args) => ({ data: course('c9', { name: 'Superyacht interior design', origin: 'proposed', proposed_from_application_id: args.p_application_id }), error: null });
    renderCatalogue();
    const section = (await screen.findByRole('heading', { name: 'Crew proposals' })).closest('section') as HTMLElement;
    fireEvent.click(within(section).getByRole('button', { name: /Add to catalogue/ }));
    await waitFor(() => expect(h.state.rpcCalls).toContainEqual({ fn: 'development_course_promote', args: { p_application_id: 'p1' } }));
  });

  it('archives a course through development_course_archive', async () => {
    h.state.rpc.development_course_archive = (args) => ({ data: course(String(args.p_course_id), { status: 'archived' }), error: null });
    renderCatalogue();
    const table = await coursesTable();
    const row = within(table).getByText('Advanced firefighting').closest('tr') as HTMLElement;
    fireEvent.pointerDown(within(row).getByRole('button', { name: 'Actions for Advanced firefighting' }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    await waitFor(() => expect(h.state.rpcCalls).toContainEqual({ fn: 'development_course_archive', args: { p_course_id: 'c1', p_archived: true } }));
  });
});
