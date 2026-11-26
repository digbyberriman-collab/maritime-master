/**
 * The crew profile's Activity tab (X1-03B; gap/04 C22): the crew log and
 * the HR trail merged by time into one timeline, newest first, each row
 * once, rows without a time last; the document rows of the person's crew
 * documents; field names shown, values never; the HR history gate
 * (loading and denied send no request); empty, filtered and error states.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

type Result = { data: unknown; error: unknown };

const h = vi.hoisted(() => ({
  gate: 'granted' as 'granted' | 'loading' | 'denied',
  queries: [] as { table: string; select: string; filters: [string, string, unknown][] }[],
  answer: (() => ({ data: [], error: null })) as (q: { table: string; select: string; filters: [string, string, unknown][] }) => Result,
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const q = { table, select: '', filters: [] as [string, string, unknown][] };
    h.queries.push(q);
    const chain: Record<string, unknown> = {};
    chain.select = (columns: string) => {
      q.select = columns;
      return chain;
    };
    for (const m of ['eq', 'in', 'order', 'limit']) {
      chain[m] = (col: string, value: unknown) => {
        q.filters.push([m, col, value]);
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(h.answer(q)).then(resolve);
    return chain;
  };
  return { supabase: { from } };
});
vi.mock('@/lib/permissions/useCan', () => ({
  useCapability: () => ({ allowed: h.gate === 'granted', status: h.gate, reason: 'test' }),
  useCan: () => h.gate === 'granted',
}));

import ActivityTab, { ACTIVITY_DENIED_TITLE, type AuditRow } from '@/modules/crew/components/profile/ActivityTab';
import type { CrewProfileSummary } from '@/modules/crew/hooks/useCrewProfile';
import type { Json } from '@/integrations/supabase/types';

const PROFILE = 'b0000000-0000-4000-8000-000000000015';
const USER = 'a0000000-0000-4000-8000-000000000015';

const audit = (over: Partial<AuditRow> & { new_values?: Json }): AuditRow & { new_values?: Json } => ({
  id: 'x',
  entity_type: 'crew_profile',
  entity_id: PROFILE,
  action: 'UPDATE',
  actor_email: 'hr.manager@example.test',
  actor_role: 'shore_management',
  changed_fields: null,
  timestamp: '2026-11-01T10:00:00Z',
  ...over,
});

// ---------------------------------------------------------------- the tab

const profile = (over: Partial<CrewProfileSummary> = {}): CrewProfileSummary =>
  ({
    profileId: PROFILE,
    userId: USER,
    firstName: 'Demo',
    lastName: 'Chief Stew',
    preferredName: null,
    displayName: 'Demo Chief Stew',
    isOwn: false,
    tabs: null,
    source: 'server',
    ...over,
  }) as CrewProfileSummary;
const VESSEL = { id: 'v-dra', companyId: 'c-1', name: 'DRAAK' };

const renderTab = (p = profile()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ActivityTab profile={p} vessel={VESSEL} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const ROWS: Record<string, unknown[]> = {
  person: [
    audit({ id: 'hr-1', entity_type: 'crew_profile', entity_id: PROFILE, changed_fields: ['date_of_birth', 'height_cm'], timestamp: '2026-11-02T09:00:00Z' }),
    audit({ id: 'crew-1', entity_type: 'crew_profile', entity_id: USER, changed_fields: { position: true }, timestamp: '2026-11-04T15:30:00Z', actor_email: 'master@example.test', actor_role: 'master' }),
    audit({ id: 'emp-1', entity_type: 'crew_assignment', entity_id: USER, action: 'CREATE', timestamp: '2026-10-20T08:00:00Z' }),
  ],
  certificates: [{ id: 'cert-1' }],
  documents: [audit({ id: 'doc-1', entity_type: 'crew_certificate', entity_id: 'cert-1', action: 'CREATE', timestamp: '2026-11-03T11:00:00Z', new_values: { certificate_name: 'ENG1' } })],
};

beforeEach(() => {
  h.gate = 'granted';
  h.queries = [];
  h.answer = (q) => {
    if (q.table === 'crew_certificates') return { data: ROWS.certificates, error: null };
    if (q.table === 'audit_logs' && q.filters.some(([m, c]) => m === 'eq' && c === 'entity_type')) return { data: ROWS.documents, error: null };
    if (q.table === 'audit_logs') return { data: ROWS.person, error: null };
    return { data: [], error: null };
  };
});

describe('the gate', () => {
  it('loading: no request', () => {
    h.gate = 'loading';
    renderTab();
    expect(screen.getByLabelText('Loading activity')).toBeInTheDocument();
    expect(h.queries).toEqual([]);
  });

  it('no HR history access: says who sees it, no request', () => {
    h.gate = 'denied';
    renderTab();
    expect(screen.getByRole('heading', { name: ACTIVITY_DENIED_TITLE })).toBeInTheDocument();
    expect(h.queries).toEqual([]);
  });
});

describe('the timeline', () => {
  it('merges the crew log, the HR trail and the document rows, newest first, grouped by day', async () => {
    const { container } = renderTab();
    expect(await screen.findByRole('heading', { name: 'Activity' })).toBeInTheDocument();
    const ids = Array.from(container.querySelectorAll('[data-activity-entry]')).map((el) => el.getAttribute('data-activity-entry'));
    expect(ids).toEqual(['crew-1', 'doc-1', 'hr-1', 'emp-1']);
    // The person by profiles.id and by login id; the documents by their own ids.
    const person = h.queries.find((q) => q.table === 'audit_logs' && !q.filters.some(([m, c]) => m === 'eq' && c === 'entity_type'));
    expect(person?.filters).toContainEqual(['in', 'entity_id', [PROFILE, USER]]);
    const docs = h.queries.find((q) => q.table === 'audit_logs' && q.filters.some(([m, c]) => m === 'eq' && c === 'entity_type'));
    expect(docs?.filters).toContainEqual(['in', 'entity_id', ['cert-1']]);
    expect(screen.getByText(/Wednesday 4 November 2026/)).toBeInTheDocument();
  });

  it('shows who changed which fields, never the values', async () => {
    const { container } = renderTab();
    await screen.findByRole('heading', { name: 'Activity' });
    const hr = container.querySelector('[data-activity-entry="hr-1"]') as HTMLElement;
    expect(within(hr).getByText('Date of birth')).toBeInTheDocument();
    expect(within(hr).getByText('Height cm')).toBeInTheDocument();
    expect(hr).toHaveTextContent('hr.manager@example.test · Shore management');
    const doc = container.querySelector('[data-activity-entry="doc-1"]') as HTMLElement;
    expect(doc).toHaveTextContent('Document added · ENG1');
    // The person rows are read without old or new values.
    for (const q of h.queries.filter((x) => x.table === 'audit_logs' && !x.filters.some(([m, c]) => m === 'eq' && c === 'entity_type'))) {
      expect(q.select).not.toMatch(/old_values|new_values|ip_address|user_agent/);
    }
  });

  it('filters by kind', async () => {
    const { container } = renderTab();
    await screen.findByRole('heading', { name: 'Activity' });
    fireEvent.click(screen.getByRole('radio', { name: 'Documents' }));
    expect(Array.from(container.querySelectorAll('[data-activity-entry]')).map((el) => el.getAttribute('data-activity-entry'))).toEqual(['doc-1']);
    fireEvent.click(screen.getByRole('radio', { name: 'Employment' }));
    expect(Array.from(container.querySelectorAll('[data-activity-entry]')).map((el) => el.getAttribute('data-activity-entry'))).toEqual(['emp-1']);
  });

  it('the merge order: newest first whatever order the reads return, a row in two reads once, rows without a time last', async () => {
    h.answer = (q) => {
      if (q.table === 'crew_certificates') return { data: [{ id: 'cert-1' }], error: null };
      if (q.table === 'audit_logs' && q.filters.some(([m, c]) => m === 'eq' && c === 'entity_type')) {
        return {
          data: [
            audit({ id: 'doc-1', entity_type: 'crew_certificate', entity_id: 'cert-1', timestamp: '2026-11-03T08:00:00Z' }),
            // Also keyed on the person: read twice, shown once.
            audit({ id: 'shared', entity_type: 'crew_certificate', entity_id: 'cert-1', timestamp: '2026-11-04T08:00:00Z' }),
          ],
          error: null,
        };
      }
      return {
        data: [
          audit({ id: 'old', timestamp: '2026-10-01T08:00:00Z' }),
          audit({ id: 'undated', timestamp: null }),
          audit({ id: 'new', entity_id: USER, timestamp: '2026-11-05T08:00:00Z' }),
          audit({ id: 'shared', entity_type: 'crew_certificate', entity_id: USER, timestamp: '2026-11-04T08:00:00Z' }),
          audit({ id: 'tie-b', timestamp: '2026-11-03T08:00:00Z' }),
          audit({ id: 'tie-a', timestamp: '2026-11-03T08:00:00Z' }),
        ],
        error: null,
      };
    };
    const { container } = renderTab();
    await screen.findByRole('heading', { name: 'Activity' });
    const ids = Array.from(container.querySelectorAll('[data-activity-entry]')).map((el) => el.getAttribute('data-activity-entry'));
    expect(ids).toEqual(['new', 'shared', 'doc-1', 'tie-a', 'tie-b', 'old', 'undated']);
    expect(screen.getByText('Date not recorded')).toBeInTheDocument();
  });

  it('reads changed fields written as a list of names or as flags, and names roles as people say them', async () => {
    h.answer = (q) =>
      q.table === 'audit_logs' && !q.filters.some(([m, c]) => m === 'eq' && c === 'entity_type')
        ? {
            data: [
              audit({ id: 'list', changed_fields: ['address_line1', ''], actor_role: 'dpa', timestamp: '2026-11-02T08:00:00Z' }),
              audit({ id: 'flags', changed_fields: { rank: false, position: true }, timestamp: '2026-11-01T08:00:00Z' }),
            ],
            error: null,
          }
        : { data: [], error: null };
    const { container } = renderTab();
    await screen.findByRole('heading', { name: 'Activity' });
    const list = container.querySelector('[data-activity-entry="list"]') as HTMLElement;
    expect(within(list).getByRole('list', { name: 'Changed fields' })).toHaveTextContent(/^Address line 1$/);
    expect(list).toHaveTextContent('hr.manager@example.test · DPA');
    const flags = container.querySelector('[data-activity-entry="flags"]') as HTMLElement;
    expect(within(flags).getByRole('list', { name: 'Changed fields' })).toHaveTextContent(/^Position$/);
  });

  it('no login: only the profiles.id rows are read, documents are not looked up', async () => {
    renderTab(profile({ userId: null }));
    await screen.findByRole('heading', { name: 'Activity' });
    expect(h.queries.some((q) => q.table === 'crew_certificates')).toBe(false);
    expect(h.queries[0].filters).toContainEqual(['in', 'entity_id', [PROFILE]]);
  });

  it('empty: "No changes recorded yet"', async () => {
    h.answer = () => ({ data: [], error: null });
    renderTab();
    expect(await screen.findByRole('heading', { name: 'No changes recorded yet' })).toBeInTheDocument();
  });

  it('an error is an error with Retry', async () => {
    h.answer = () => ({ data: null, error: { code: '500', message: 'boom' } });
    renderTab();
    expect(await screen.findByRole('heading', { name: 'The activity could not load' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});
