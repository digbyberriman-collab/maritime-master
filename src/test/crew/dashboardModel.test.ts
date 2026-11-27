/**
 * The vessel crew dashboard's model (gap/04 C2; X1-10B;
 * src/modules/crew/lib/dashboardModel.ts):
 *
 * - the parse of crew_vessel_dashboard (061000): each section on its own
 *   (allowed false hides it, hours of rest switched off, a malformed section
 *   is that tile's error only); an answer that is not the contract throws;
 * - the five tiles for every state of the RPC (loading, not applied, error)
 *   and every state of every section (4^4 x 4): a tile never shows 0 when
 *   its source is missing or unreadable, a hidden source hides its tile,
 *   every number links to the list it summarises;
 * - the Action required list (most urgent first, links by capability) and
 *   when the page may say nothing needs action;
 * - links and words.
 */
import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_ANCHORS,
  DASHBOARD_PEOPLE_LIMIT,
  DASHBOARD_TILE_KEYS,
  DashboardShapeError,
  NOT_SET_UP_REASON,
  anchorHref,
  cardState,
  complianceHref,
  crewListHref,
  dashboardActions,
  dashboardAllClear,
  dashboardTiles,
  documentsHref,
  horBoardHref,
  horReportHref,
  isCapped,
  monthName,
  monthShort,
  nextExpiryText,
  parseCrewDashboard,
  plural,
  worstComplianceStatus,
  type CrewDashboard,
  type DashboardAccess,
  type DashboardQuery,
  type SectionState,
  type TileModel,
} from '@/modules/crew/lib/dashboardModel';

const ALL: DashboardAccess = { compliance: true, documents: true, hoursOfRest: true };
const NONE: DashboardAccess = { compliance: false, documents: false, hoursOfRest: false };

/** The RPC's answer as crew_vessel_dashboard builds it. */
const answer = (over: Record<string, unknown> = {}) => ({
  vessel_id: 'v-dra',
  today: '2026-11-27',
  crewing: { allowed: true, total: 13, on_board: 8, on_leave: 1, pending: 2, on_transfer: 1, ashore: 1 },
  compliance: { allowed: true, total: 13, complete: 8, expiring: 2, missing: 2, expired: 1 },
  onboarding: {
    allowed: true,
    joiners: 7,
    open: 3,
    people: [
      {
        profile_id: 'p36', first_name: 'Demo', last_name: 'Purser', preferred_name: null, position_name: 'Purser', placement_kind: 'assignment',
        join_date: '2026-11-07', percent: 71, passed: 5, known: 7, fam_required: 2, fam_completed: 1,
        familiarisation: [
          { record_id: 'f1', template_name: 'Arrival safety (24 hours)', status: 'completed', due_date: '2026-11-08', overdue: false },
          { record_id: 'f2', template_name: 'Purser office handover', status: 'in_progress', due_date: '2026-11-21', overdue: true },
        ],
      },
      { profile_id: 'p34', first_name: 'Demo', last_name: 'Junior Stew', position_name: 'Steward', placement_kind: 'planned', join_date: '2026-11-30', percent: 43, passed: 3, known: 7, fam_required: 1, fam_completed: 0, familiarisation: [] },
      { profile_id: 'p31', first_name: 'Demo', last_name: 'Second Officer', position_name: 'Second Officer', placement_kind: 'pending_placement', join_date: '2026-11-21', percent: 29, passed: 2, known: 7, fam_required: 0, fam_completed: 0, familiarisation: [{ record_id: 'f3', status: 'completed', overdue: true }] },
    ],
  },
  documents: {
    allowed: true,
    expired: 2,
    expiring: 3,
    people: [
      { profile_id: 'p13', first_name: 'Demo', last_name: 'Chief Engineer', expired: 1, expiring: 1, next_expiry: '2026-11-03' },
      { profile_id: 'p14', first_name: 'Demo', last_name: 'Bosun', expired: 1, expiring: 0, next_expiry: '2026-11-20' },
      { profile_id: 'p15', first_name: 'Demo', last_name: 'Chief Stew', preferred_name: 'Stew', expired: 0, expiring: 2, next_expiry: '2026-12-12' },
    ],
  },
  hours_of_rest: {
    allowed: true,
    enabled: true,
    open_breaches: 3,
    unsubmitted: 2,
    month: '2026-10',
    people: [
      { profile_id: 'p14', first_name: 'Demo', last_name: 'Bosun', open_breaches: 2, unsubmitted: false },
      { profile_id: 'p16', first_name: 'Demo', last_name: 'Deckhand', open_breaches: 1, unsubmitted: true },
      { profile_id: 'p12', first_name: 'Demo', last_name: 'Chief Officer', open_breaches: 0, unsubmitted: true },
    ],
  },
  ...over,
});

const ready = (d: CrewDashboard): DashboardQuery => ({ status: 'ready', dashboard: d });
const tile = (tiles: TileModel[], key: TileModel['key']): TileModel => {
  const t = tiles.find((x) => x.key === key);
  if (!t) throw new Error(`no tile ${key}`);
  return t;
};

describe('parseCrewDashboard', () => {
  it('reads every section of a full answer', () => {
    const d = parseCrewDashboard(answer());
    expect(d.vesselId).toBe('v-dra');
    expect(d.today).toBe('2026-11-27');
    expect(d.crewing).toEqual({ kind: 'ready', data: { total: 13, onBoard: 8, onLeave: 1, pending: 2, onTransfer: 1, ashore: 1 } });
    expect(d.compliance).toEqual({ kind: 'ready', data: { total: 13, complete: 8, expiring: 2, missing: 2, expired: 1 } });
    if (d.onboarding.kind !== 'ready') throw new Error('onboarding');
    expect(d.onboarding.data).toMatchObject({ joiners: 7, open: 3 });
    expect(d.onboarding.data.people.map((p) => [p.profileId, p.displayName, p.placementKind, p.percent])).toEqual([
      ['p36', 'Demo Purser', 'assignment', 71],
      ['p34', 'Demo Junior Stew', 'planned', 43],
      ['p31', 'Demo Second Officer', 'pending_placement', 29],
    ]);
    // Overdue counts only records that are not completed.
    expect(d.onboarding.data.overdueFamiliarisations).toBe(1);
    if (d.documents.kind !== 'ready') throw new Error('documents');
    expect(d.documents.data.people.map((p) => [p.displayName, p.expired, p.expiring, p.nextExpiry])).toEqual([
      ['Demo Chief Engineer', 1, 1, '2026-11-03'],
      ['Demo Bosun', 1, 0, '2026-11-20'],
      ['Stew Chief Stew', 0, 2, '2026-12-12'],
    ]);
    if (d.hoursOfRest.kind !== 'ready') throw new Error('hor');
    expect(d.hoursOfRest.data).toMatchObject({ openBreaches: 3, unsubmitted: 2, month: '2026-10' });
    expect(d.hoursOfRest.data.people.map((p) => [p.profileId, p.openBreaches, p.unsubmitted])).toEqual([
      ['p14', 2, false],
      ['p16', 1, true],
      ['p12', 0, true],
    ]);
  });

  it('refuses an answer that is not the contract', () => {
    for (const bad of [null, [], 'x', 3, {}, { vessel_id: 'v' }, { today: '2026-11-27' }, { vessel_id: '', today: '2026-11-27' }, { vessel_id: 'v', today: 'today' }]) {
      expect(() => parseCrewDashboard(bad), JSON.stringify(bad)).toThrow(DashboardShapeError);
    }
  });

  it('hides a section the viewer may not read, and reads hours of rest switched off', () => {
    const d = parseCrewDashboard(
      answer({ compliance: { allowed: false }, documents: { allowed: false }, hours_of_rest: { allowed: true, enabled: false } }),
    );
    expect(d.compliance).toEqual({ kind: 'no_access' });
    expect(d.documents).toEqual({ kind: 'no_access' });
    expect(d.hoursOfRest).toEqual({ kind: 'off' });
    expect(parseCrewDashboard(answer({ hours_of_rest: { allowed: false } })).hoursOfRest).toEqual({ kind: 'no_access' });
  });

  it('reads a missing or malformed section as invalid, and only that section', () => {
    const cases: Array<[string, unknown]> = [
      ['crewing', undefined],
      ['crewing', { total: 3, on_board: 1, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 }], // no allowed
      ['crewing', { allowed: 'yes', total: 3, on_board: 1, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 }],
      ['crewing', { allowed: true, total: 3, on_board: 4, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 }], // more aboard than listed
      ['crewing', { allowed: true, total: 3, on_board: -1, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 }],
      ['crewing', { allowed: true, total: 3, on_board: 1.5, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 }],
      ['compliance', { allowed: true, total: 2, complete: 3, expiring: 0, missing: 0, expired: 0 }],
      ['compliance', { allowed: true, total: 2, complete: 1, expiring: 0, missing: 0 }],
      ['onboarding', { allowed: true, joiners: 2, open: 3, people: [] }],
      ['onboarding', { allowed: true, joiners: 2, open: 1 }],
      ['documents', { allowed: true, expired: 1, expiring: '2', people: [] }],
      ['documents', { allowed: true, expired: 1, expiring: 2, people: null }],
      ['hours_of_rest', { allowed: true, open_breaches: 0, unsubmitted: 0, month: '2026-10', people: [] }], // no enabled
      ['hours_of_rest', { allowed: true, enabled: true, open_breaches: 0, unsubmitted: 0, month: '2026-13', people: [] }],
      ['hours_of_rest', { allowed: true, enabled: true, open_breaches: 0, unsubmitted: 0, month: '2026-10' }],
      ['hours_of_rest', 'off'],
    ];
    const field: Record<string, keyof CrewDashboard> = { crewing: 'crewing', compliance: 'compliance', onboarding: 'onboarding', documents: 'documents', hours_of_rest: 'hoursOfRest' };
    for (const [key, value] of cases) {
      const d = parseCrewDashboard(answer({ [key]: value }));
      expect(d[field[key]], `${key} ${JSON.stringify(value)}`).toEqual({ kind: 'invalid' });
      for (const other of Object.keys(field).filter((k) => k !== key)) expect((d[field[other]] as SectionState<unknown>).kind, other).toBe('ready');
    }
  });

  it('drops a person row that is not readable, and keeps the rest', () => {
    const d = parseCrewDashboard(
      answer({
        documents: { allowed: true, expired: 1, expiring: 0, people: [null, { profile_id: '' }, { profile_id: 'p1', expired: 'one', expiring: 0 }, { profile_id: 'p2', expired: 1, expiring: 0 }] },
        hours_of_rest: { allowed: true, enabled: true, open_breaches: 1, unsubmitted: 0, month: '2026-10', people: [{ profile_id: 'p3' }, { profile_id: 'p4', open_breaches: 1, unsubmitted: 'yes' }] },
        onboarding: { allowed: true, joiners: 1, open: 1, people: [{ first_name: 'No id' }, { profile_id: 'p5', percent: 140 }] },
      }),
    );
    expect(d.documents.kind === 'ready' && d.documents.data.people.map((p) => p.profileId)).toEqual(['p2']);
    expect(d.hoursOfRest.kind === 'ready' && d.hoursOfRest.data.people).toEqual([{ profileId: 'p4', displayName: 'Unnamed crew member', openBreaches: 1, unsubmitted: false }]);
    expect(d.onboarding.kind === 'ready' && d.onboarding.data.people.map((p) => [p.profileId, p.percent, p.known])).toEqual([['p5', 100, 0]]);
  });
});

describe('dashboardTiles before the answer is in', () => {
  const statuses: DashboardQuery[] = [{ status: 'loading' }, { status: 'not_set_up' }, { status: 'error' }];

  it('are the five, in order, each in the query\'s state, never a number', () => {
    for (const q of statuses) {
      const tiles = dashboardTiles(q, ALL);
      expect(tiles.map((t) => t.key)).toEqual([...DASHBOARD_TILE_KEYS]);
      expect(tiles.map((t) => t.label)).toEqual(['Crewing', 'Compliance', 'Onboarding', 'Documents', 'Hours of rest']);
      for (const t of tiles) {
        expect(t.value, `${q.status} ${t.key}`).toBeUndefined();
        expect(t.href).toBeUndefined();
        expect(t.state).toBe(q.status === 'loading' ? 'loading' : q.status === 'not_set_up' ? 'not-enabled' : 'error');
        if (q.status === 'not_set_up') expect(t.notEnabledReason).toBe(NOT_SET_UP_REASON);
        if (q.status === 'error') expect(t.errorMessage).toBe('Could not load');
      }
    }
  });

  it('hide the tiles the viewer could not see anyway (crewing and onboarding always show)', () => {
    for (const q of statuses) {
      const tiles = dashboardTiles(q, NONE);
      expect(tiles.filter((t) => t.state !== 'no-access').map((t) => t.key)).toEqual(['crewing', 'onboarding']);
    }
    for (const key of ['compliance', 'documents', 'hoursOfRest'] as const) {
      const tiles = dashboardTiles({ status: 'loading' }, { ...ALL, [key]: false });
      expect(tiles.filter((t) => t.state === 'no-access')).toHaveLength(1);
    }
  });
});

describe('dashboardTiles from the answer', () => {
  const tiles = dashboardTiles(ready(parseCrewDashboard(answer())), ALL);

  it('Crewing: on board / total, the others in words, linking to the list of those on board', () => {
    expect(tile(tiles, 'crewing')).toMatchObject({ state: 'ready', value: 8, unit: '/ 13', sub: '2 pending · 1 on leave · 1 on transfer · 1 ashore', href: 'crew/list?status=on_board' });
    const allAboard = dashboardTiles(ready(parseCrewDashboard(answer({ crewing: { allowed: true, total: 4, on_board: 4, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 } }))), ALL);
    expect(tile(allAboard, 'crewing')).toMatchObject({ value: 4, unit: '/ 4', sub: 'Everyone on the list is on board' });
    const empty = dashboardTiles(ready(parseCrewDashboard(answer({ crewing: { allowed: true, total: 0, on_board: 0, on_leave: 0, pending: 0, on_transfer: 0, ashore: 0 } }))), ALL);
    // An empty list is a fact, not "All clear".
    expect(tile(empty, 'crewing')).toMatchObject({ state: 'ready', value: 0, sub: 'No one on the crew list yet', href: 'crew/list' });
    const noneAboard = dashboardTiles(ready(parseCrewDashboard(answer({ crewing: { allowed: true, total: 3, on_board: 0, on_leave: 3, pending: 0, on_transfer: 0, ashore: 0 } }))), ALL);
    expect(tile(noneAboard, 'crewing')).toMatchObject({ state: 'ready', value: 0, unit: '/ 3' });
  });

  it('Compliance: compliant / total, toned and linked by the worst problem', () => {
    expect(tile(tiles, 'compliance')).toMatchObject({
      state: 'ready', value: 8, unit: '/ 13', sub: '1 expired · 2 missing · 2 expiring', tone: 'danger', href: 'crew/compliance/status?status=expired',
    });
    const c = (over: Record<string, number>) =>
      tile(dashboardTiles(ready(parseCrewDashboard(answer({ compliance: { allowed: true, total: 5, complete: 5, expiring: 0, missing: 0, expired: 0, ...over } }))), ALL), 'compliance');
    expect(c({ complete: 3, missing: 2 })).toMatchObject({ tone: 'danger', href: 'crew/compliance/status?status=missing' });
    expect(c({ complete: 4, expiring: 1 })).toMatchObject({ tone: 'warn', href: 'crew/compliance/status?status=expiring', sub: '1 expiring' });
    expect(c({})).toMatchObject({ tone: undefined, href: 'crew/compliance/status', sub: 'Everyone holds what their position needs' });
    // No one compliant is never "All clear".
    expect(c({ complete: 0, expired: 5 })).toMatchObject({ state: 'ready', value: 0 });
    expect(c({ total: 0, complete: 0 })).toMatchObject({ state: 'ready', value: 0, sub: 'No one to check yet' });
  });

  it('Onboarding: open joiners, linking to the card below; none open is zero', () => {
    expect(tile(tiles, 'onboarding')).toMatchObject({
      state: 'ready', value: 3, sub: 'of 7 recent joiners · 1 familiarisation overdue', tone: 'danger', href: anchorHref(DASHBOARD_ANCHORS.onboarding),
    });
    const o = (over: Record<string, unknown>) => tile(dashboardTiles(ready(parseCrewDashboard(answer({ onboarding: { allowed: true, people: [], ...over } }))), ALL), 'onboarding');
    expect(o({ joiners: 4, open: 2 })).toMatchObject({ value: 2, sub: 'of 4 recent joiners', tone: 'info' });
    expect(o({ joiners: 1, open: 1 })).toMatchObject({ sub: 'of 1 recent joiner' });
    expect(o({ joiners: 4, open: 0 })).toMatchObject({ state: 'zero', value: 0, zeroLabel: 'Every recent joiner is onboarded' });
    expect(o({ joiners: 0, open: 0 })).toMatchObject({ state: 'zero', zeroLabel: 'No joiners in the last 90 days' });
  });

  it('Documents: expired + expiring, linking to the compliance documents view (else the card)', () => {
    expect(tile(tiles, 'documents')).toMatchObject({ state: 'ready', value: 5, sub: '2 expired · 3 expiring', tone: 'danger', href: 'crew/compliance/status?view=documents&status=expired' });
    const d = (docs: Record<string, unknown>, compliance: Record<string, unknown> = { allowed: true, total: 1, complete: 1, expiring: 0, missing: 0, expired: 0 }) =>
      tile(dashboardTiles(ready(parseCrewDashboard(answer({ documents: { allowed: true, people: [], ...docs }, compliance }))), ALL), 'documents');
    expect(d({ expired: 0, expiring: 2 })).toMatchObject({ value: 2, tone: 'warn', href: 'crew/compliance/status?view=documents&status=expiring' });
    expect(d({ expired: 0, expiring: 0 })).toMatchObject({ state: 'zero', value: 0, zeroLabel: 'Nothing expired or expiring', href: 'crew/compliance/status?view=documents' });
    expect(d({ expired: 1, expiring: 0 }, { allowed: false })).toMatchObject({ href: anchorHref(DASHBOARD_ANCHORS.documents) });
  });

  it('Hours of rest: open breaches + not submitted, linking to the year\'s report; off says so', () => {
    expect(tile(tiles, 'hours_of_rest')).toMatchObject({
      state: 'ready', value: 5, sub: '3 open breaches · 2 unsubmitted for Oct', tone: 'danger', href: 'crew/hours-of-rest/report?year=2026',
    });
    const h = (hor: Record<string, unknown>) => tile(dashboardTiles(ready(parseCrewDashboard(answer({ hours_of_rest: { allowed: true, enabled: true, month: '2025-12', people: [], ...hor } }))), ALL), 'hours_of_rest');
    expect(h({ open_breaches: 0, unsubmitted: 2 })).toMatchObject({ value: 2, tone: 'warn', sub: '0 open breaches · 2 unsubmitted for Dec', href: 'crew/hours-of-rest/report?year=2025' });
    expect(h({ open_breaches: 1, unsubmitted: 0 })).toMatchObject({ sub: '1 open breach · 0 unsubmitted for Dec' });
    expect(h({ open_breaches: 0, unsubmitted: 0 })).toMatchObject({ state: 'zero', value: 0, zeroLabel: 'No open breaches · Dec submitted' });
    expect(h({ enabled: false })).toMatchObject({ state: 'not-enabled', notEnabledReason: 'Hours of rest is off on this vessel' });
    expect(h({ enabled: false }).value).toBeUndefined();
  });

  it('every section state, for every tile: hidden, error, off or a number, never a made-up 0', () => {
    const kinds = ['ready', 'no_access', 'invalid'] as const;
    const sectionFor = (key: string, kind: (typeof kinds)[number] | 'off') => {
      const full = answer() as Record<string, unknown>;
      if (kind === 'ready') return full[key];
      if (kind === 'no_access') return { allowed: false };
      if (kind === 'off') return { allowed: true, enabled: false };
      return { allowed: true };
    };
    let n = 0;
    for (const crewing of kinds) for (const compliance of kinds) for (const onboarding of kinds) for (const documents of kinds) for (const hor of [...kinds, 'off'] as const) {
      n++;
      const d = parseCrewDashboard(
        answer({
          crewing: sectionFor('crewing', crewing),
          compliance: sectionFor('compliance', compliance),
          onboarding: sectionFor('onboarding', onboarding),
          documents: sectionFor('documents', documents),
          hours_of_rest: sectionFor('hours_of_rest', hor),
        }),
      );
      const tiles = dashboardTiles(ready(d), NONE);
      const want = { crewing, compliance, onboarding, documents, hours_of_rest: hor } as const;
      for (const t of tiles) {
        const kind = want[t.key];
        if (kind === 'no_access') expect(t.state, t.key).toBe('no-access');
        else if (kind === 'invalid') {
          expect(t.state, t.key).toBe('error');
          expect(t.value, t.key).toBeUndefined();
        } else if (kind === 'off') {
          expect(t.state).toBe('not-enabled');
          expect(t.value).toBeUndefined();
        } else {
          expect(['ready', 'zero'], t.key).toContain(t.state);
          expect(typeof t.value, t.key).toBe('number');
          expect(t.href, t.key).toBeTruthy();
        }
      }
      // The documents link follows the compliance section the viewer has.
      const docs = tile(tiles, 'documents');
      if (documents === 'ready') expect(docs.href?.startsWith(compliance === 'ready' ? 'crew/compliance/status?view=documents' : 'crew#')).toBe(true);
    }
    expect(n).toBe(3 ** 4 * 4);
  });
});

describe('dashboardActions', () => {
  const d = parseCrewDashboard(answer());

  it('lists what needs someone, most urgent first, each linking to its list', () => {
    expect(dashboardActions(d, { canApproveHor: true, canViewFamiliarisation: true })).toEqual([
      { key: 'documents_expired', tone: 'danger', count: 2, text: '2 documents expired', href: 'crew/compliance/status?view=documents&status=expired' },
      { key: 'compliance_missing', tone: 'danger', count: 2, text: '2 crew members missing something their position requires', href: 'crew/compliance/status?status=missing' },
      { key: 'hor_breaches', tone: 'danger', count: 3, text: '3 hours-of-rest breaches to review', href: 'crew/hours-of-rest/report?year=2026' },
      { key: 'familiarisation_overdue', tone: 'danger', count: 1, text: '1 familiarisation overdue', href: 'crew/familiarisation?all=1' },
      { key: 'hor_unsubmitted', tone: 'warn', count: 2, text: '2 crew members yet to submit October 2026', href: 'crew/hours-of-rest?month=2026-10&queue=waiting' },
      { key: 'documents_expiring', tone: 'warn', count: 3, text: '3 documents expiring soon', href: 'crew/compliance/status?view=documents&status=expiring' },
    ]);
  });

  it('links to what the viewer can open: the report instead of the board, the card instead of the forms', () => {
    const actions = dashboardActions(d, { canApproveHor: false, canViewFamiliarisation: false });
    expect(actions.find((a) => a.key === 'hor_unsubmitted')?.href).toBe('crew/hours-of-rest/report?year=2026');
    expect(actions.find((a) => a.key === 'familiarisation_overdue')?.href).toBe(anchorHref(DASHBOARD_ANCHORS.onboarding));
  });

  it('leaves out what is zero, hidden, off or unreadable', () => {
    const quiet = parseCrewDashboard(
      answer({
        compliance: { allowed: true, total: 3, complete: 3, expiring: 0, missing: 0, expired: 0 },
        documents: { allowed: false },
        hours_of_rest: { allowed: true, enabled: false },
        onboarding: { allowed: true },
      }),
    );
    expect(dashboardActions(quiet, { canApproveHor: true, canViewFamiliarisation: true })).toEqual([]);
    const singular = parseCrewDashboard(answer({ documents: { allowed: true, expired: 1, expiring: 1, people: [] }, compliance: { allowed: true, total: 1, complete: 0, expiring: 0, missing: 1, expired: 0 } }));
    const texts = dashboardActions(singular, { canApproveHor: true, canViewFamiliarisation: true }).map((a) => a.text);
    expect(texts).toContain('1 document expired');
    expect(texts).toContain('1 crew member missing something their position requires');
    expect(texts).toContain('1 document expiring soon');
  });

  it('says nothing needs action only when every source answered', () => {
    const calm = {
      compliance: { allowed: true, total: 3, complete: 3, expiring: 0, missing: 0, expired: 0 },
      documents: { allowed: true, expired: 0, expiring: 0, people: [] },
      onboarding: { allowed: true, joiners: 2, open: 0, people: [] },
      hours_of_rest: { allowed: true, enabled: true, open_breaches: 0, unsubmitted: 0, month: '2026-10', people: [] },
    };
    const ctx = { canApproveHor: true, canViewFamiliarisation: true };
    const clear = parseCrewDashboard(answer(calm));
    expect(dashboardAllClear(clear, dashboardActions(clear, ctx))).toBe(true);
    const off = parseCrewDashboard(answer({ ...calm, hours_of_rest: { allowed: true, enabled: false } }));
    expect(dashboardAllClear(off, dashboardActions(off, ctx))).toBe(true);
    for (const hidden of ['compliance', 'documents', 'hours_of_rest', 'onboarding', 'crewing']) {
      const partial = parseCrewDashboard(answer({ ...calm, [hidden]: { allowed: false } }));
      expect(dashboardAllClear(partial, dashboardActions(partial, ctx)), hidden).toBe(false);
      const broken = parseCrewDashboard(answer({ ...calm, [hidden]: { allowed: true } }));
      expect(dashboardAllClear(broken, dashboardActions(broken, ctx)), hidden).toBe(false);
    }
    expect(dashboardAllClear(d, dashboardActions(d, ctx))).toBe(false);
  });
});

describe('links and words', () => {
  it('builds every list link relative to the vessel', () => {
    expect(crewListHref()).toBe('crew/list');
    expect(crewListHref('pending')).toBe('crew/list?status=pending');
    expect(complianceHref()).toBe('crew/compliance/status');
    expect(complianceHref({ view: 'documents' })).toBe('crew/compliance/status?view=documents');
    expect(complianceHref({ status: null })).toBe('crew/compliance/status');
    expect(horReportHref()).toBe('crew/hours-of-rest/report');
    expect(horReportHref('nonsense')).toBe('crew/hours-of-rest/report');
    expect(horBoardHref()).toBe('crew/hours-of-rest');
    expect(horBoardHref({ month: '2026-10' })).toBe('crew/hours-of-rest?month=2026-10');
    expect(horBoardHref({ month: '2026-1', queue: 'waiting' })).toBe('crew/hours-of-rest?queue=waiting');
    expect(anchorHref('x')).toBe('crew#x');
    const d = parseCrewDashboard(answer());
    expect(documentsHref(d, null)).toBe('crew/compliance/status?view=documents');
    expect(documentsHref(parseCrewDashboard(answer({ compliance: { allowed: false } })), 'expired')).toBe('crew#crew-dashboard-documents');
  });

  it('names the worst compliance problem', () => {
    const c = { total: 3, complete: 0, expiring: 1, missing: 1, expired: 1 };
    expect(worstComplianceStatus(c)).toBe('expired');
    expect(worstComplianceStatus({ ...c, expired: 0 })).toBe('missing');
    expect(worstComplianceStatus({ ...c, expired: 0, missing: 0 })).toBe('expiring');
    expect(worstComplianceStatus({ ...c, expired: 0, missing: 0, expiring: 0 })).toBeNull();
  });

  it('says months, counts and expiries', () => {
    expect(monthName('2026-01')).toBe('January 2026');
    expect(monthName('2026-12')).toBe('December 2026');
    expect(monthName('bad')).toBe('bad');
    expect(monthShort('2026-10')).toBe('Oct');
    expect(monthShort('2026-09')).toBe('Sep');
    expect(monthShort('nope')).toBe('nope');
    expect(plural(1, 'document')).toBe('1 document');
    expect(plural(0, 'document')).toBe('0 documents');
    expect(plural(2, 'open breach', 'open breaches')).toBe('2 open breaches');
    expect(nextExpiryText({ nextExpiry: '2026-11-03' }, '2026-11-27')).toBe('Expired 3 Nov 2026');
    expect(nextExpiryText({ nextExpiry: '2026-11-27' }, '2026-11-27')).toBe('Next expires 27 Nov 2026');
    expect(nextExpiryText({ nextExpiry: null }, '2026-11-27')).toBeNull();
    expect(isCapped(Array.from({ length: DASHBOARD_PEOPLE_LIMIT }))).toBe(true);
    expect(isCapped(Array.from({ length: DASHBOARD_PEOPLE_LIMIT - 1 }))).toBe(false);
  });
});

describe('cardState', () => {
  const pickDocs = (d: CrewDashboard) => d.documents;
  it('follows the query before the answer, hidden when the viewer could not see the source', () => {
    expect(cardState({ status: 'loading' }, pickDocs, true)).toEqual({ kind: 'loading' });
    expect(cardState({ status: 'not_set_up' }, pickDocs, true)).toEqual({ kind: 'not_set_up' });
    expect(cardState({ status: 'error' }, pickDocs, true)).toEqual({ kind: 'error' });
    for (const status of ['loading', 'not_set_up', 'error'] as const) expect(cardState({ status }, pickDocs, false)).toEqual({ kind: 'hidden' });
  });

  it('follows the section once the answer is in, whatever the capability guess was', () => {
    const d = parseCrewDashboard(answer());
    expect(cardState(ready(d), pickDocs, false).kind).toBe('ready');
    expect(cardState(ready(parseCrewDashboard(answer({ documents: { allowed: false } }))), pickDocs, true)).toEqual({ kind: 'hidden' });
    expect(cardState(ready(parseCrewDashboard(answer({ documents: { allowed: true } }))), pickDocs, true)).toEqual({ kind: 'invalid' });
    expect(cardState(ready(parseCrewDashboard(answer({ hours_of_rest: { allowed: true, enabled: false } }))), (x) => x.hoursOfRest, true)).toEqual({ kind: 'off' });
  });
});
