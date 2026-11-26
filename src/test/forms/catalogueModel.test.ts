/**
 * The fleet catalogue model (src/modules/forms/lib/catalogueModel.ts;
 * gap/02 FC1, FC2, FC4, FC5, FC6, W2):
 *
 * - the live rows joined to the catalogue columns, or Unsorted without
 *   them (D-01); vessel_scope as 040500's backfill normalises it;
 * - targeting mirrors form_template_targets_vessel; placement on the
 *   vessels in view; the overview counts per area;
 * - the order on one vessel (sort_order, then name; hidden ones kept) and
 *   the reorder moves and keys;
 * - runs across vessels and the vessel page's tallies;
 * - the vessel pages' list (hidden left out, order kept; every area while
 *   the area column is missing);
 * - Showing (?vessel=), and the small formatters.
 */
import { describe, expect, it } from 'vitest';
import {
  areaCounts,
  areaKeyFromSlug,
  areaKeyLabel,
  areaKeySlug,
  formatDay,
  formatUpdatedUtc,
  indexSettings,
  isCustomisedCopy,
  lastRunText,
  moveItem,
  normaliseVesselScope,
  orderOnVessel,
  originKind,
  placement,
  reorderKeyTarget,
  resolveShowing,
  runSummary,
  sameOrder,
  showingPhrase,
  targetsVessel,
  toCatalogueTemplates,
  toVesselSettings,
  vesselRunTally,
  vesselTemplates,
  type CatalogueTemplate,
} from '@/modules/forms/lib/catalogueModel';
import type { FormTemplateRunStatRow } from '@/modules/forms/types/db.pending';

const live = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  company_id: 'co',
  template_code: id.toUpperCase(),
  template_name: id,
  status: 'PUBLISHED',
  version: 1,
  vessel_scope: 'FLEET',
  vessel_ids: null,
  ...over,
});

const tpl = (id: string, over: Partial<CatalogueTemplate> = {}): CatalogueTemplate => ({
  id,
  companyId: 'co',
  code: id.toUpperCase(),
  name: id,
  description: null,
  formType: 'CHECKLIST',
  status: 'PUBLISHED',
  version: 1,
  versionLabel: null,
  area: 'safety',
  kind: 'checklist',
  cadence: 'daily',
  requiresSignature: false,
  origin: 'company',
  sourceTemplateId: null,
  supersedesTemplateId: null,
  vesselScope: 'FLEET',
  vesselIds: [],
  publishedAt: null,
  updatedAt: null,
  createdAt: null,
  ...over,
});

const stat = (template_id: string, vessel_id: string, over: Partial<FormTemplateRunStatRow> = {}): FormTemplateRunStatRow => ({
  template_id,
  vessel_id,
  hidden: false,
  runs: 0,
  last_run_at: null,
  last_run_on: null,
  next_due: null,
  overdue: false,
  ...over,
});

describe('toCatalogueTemplates', () => {
  it('joins the catalogue columns by id and sorts by name', () => {
    const rows = toCatalogueTemplates(
      [live('b'), live('a', { status: 'draft', version: 2, template_name: '  ' })],
      [{ id: 'b', area: 'technical', form_kind: 'register', cadence: 'weekly', origin: 'platform', version_label: ' PTW-03 ', requires_completion_signature: true }],
    );
    // 'a' has a blank name, read as "Untitled template", which sorts after 'b'.
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    const b = rows.find((r) => r.id === 'b') as CatalogueTemplate;
    expect(b).toMatchObject({ area: 'technical', kind: 'register', cadence: 'weekly', origin: 'platform', versionLabel: 'PTW-03', requiresSignature: true });
    const a = rows.find((r) => r.id === 'a') as CatalogueTemplate;
    expect(a).toMatchObject({ status: 'DRAFT', version: 2, name: 'Untitled template', area: null, kind: null, cadence: null, origin: 'company' });
  });

  it('without the catalogue columns every template is Unsorted with no catalogue values (D-01)', () => {
    const [row] = toCatalogueTemplates([live('a')], null);
    expect(row).toMatchObject({ area: null, kind: null, cadence: null, versionLabel: null, origin: 'company', sourceTemplateId: null, requiresSignature: false });
  });

  it('drops rows whose status is not one of the four, and reads unknown catalogue values as none', () => {
    const rows = toCatalogueTemplates([live('a', { status: 'active' }), live('b')], [{ id: 'b', area: 'deck', form_kind: 'memo', cadence: 'hourly', origin: 'vendor' }]);
    expect(rows.map((r) => r.id)).toEqual(['b']);
    expect(rows[0]).toMatchObject({ area: null, kind: null, cadence: null, origin: 'company' });
  });

  it('sorts by name, then code, then the newest version first', () => {
    const rows = toCatalogueTemplates([live('x2', { template_name: 'Rounds', template_code: 'R', version: 1 }), live('x1', { template_name: 'rounds', template_code: 'R', version: 2 }), live('a', { template_name: 'Anchor' })], []);
    expect(rows.map((r) => r.id)).toEqual(['a', 'x1', 'x2']);
  });
});

describe('vessel scope and targeting', () => {
  it.each([
    ['FLEET', null, 'FLEET'],
    [' all ', null, 'FLEET'],
    ['company', ['v1'], 'FLEET'],
    ['fleet_wide', null, 'FLEET'],
    ['VESSEL_SPECIFIC', [], 'VESSEL_SPECIFIC'],
    ['selected', null, 'VESSEL_SPECIFIC'],
    ['vessels', null, 'VESSEL_SPECIFIC'],
    [null, ['v1'], 'VESSEL_SPECIFIC'],
    ['', [null, ''], 'FLEET'],
    [null, null, 'FLEET'],
  ] as const)('normalises %j with %j to %s', (scope, ids, expected) => {
    expect(normaliseVesselScope(scope, ids as readonly (string | null)[] | null)).toBe(expected);
  });

  it('FLEET targets every vessel; VESSEL_SPECIFIC only those listed; no vessel is never targeted', () => {
    expect(targetsVessel({ vesselScope: 'FLEET', vesselIds: [] }, 'v1')).toBe(true);
    expect(targetsVessel({ vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v1'] }, 'v1')).toBe(true);
    expect(targetsVessel({ vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v1'] }, 'v2')).toBe(false);
    expect(targetsVessel({ vesselScope: 'FLEET', vesselIds: [] }, null)).toBe(false);
  });

  it('placement splits the targeted vessels in view into shown and hidden', () => {
    const index = indexSettings(toVesselSettings([{ template_id: 't', vessel_id: 'v2', visibility: 'hidden' }, { template_id: 't', vessel_id: 'v1', visibility: 'shown', sort_order: 1 }]));
    expect(placement(tpl('t'), ['v1', 'v2', 'v3'], index)).toEqual({ targeted: ['v1', 'v2', 'v3'], shown: ['v1', 'v3'], hidden: ['v2'] });
    expect(placement(tpl('t', { vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v2'] }), ['v1', 'v2'], index)).toEqual({ targeted: ['v2'], shown: [], hidden: ['v2'] });
  });

  it('origin: a platform template is Standard, a company copy with a source Customised, else Company', () => {
    expect(originKind(tpl('a', { origin: 'platform' }))).toBe('standard');
    expect(originKind(tpl('a', { sourceTemplateId: 's' }))).toBe('customised');
    expect(isCustomisedCopy(tpl('a', { sourceTemplateId: 's' }))).toBe(true);
    expect(originKind(tpl('a'))).toBe('company');
  });
});

describe('area slugs', () => {
  it('maps the enum slugs (technical-forms) and unsorted; anything else is not found', () => {
    expect(areaKeyFromSlug('safety')).toBe('safety');
    expect(areaKeyFromSlug('technical-forms')).toBe('technical_forms');
    expect(areaKeyFromSlug('unsorted')).toBeNull();
    for (const bad of ['technical_forms', 'Safety', 'deck', '', null, undefined]) expect(areaKeyFromSlug(bad)).toBeUndefined();
    expect(areaKeySlug(null)).toBe('unsorted');
    expect(areaKeySlug('technical_forms')).toBe('technical-forms');
    expect(areaKeyLabel(null)).toBe('Unsorted');
    expect(areaKeyLabel('ptw')).toBe('Permits');
  });
});

describe('areaCounts', () => {
  const templates = [
    tpl('shown'),
    tpl('copy', { sourceTemplateId: 'shown' }),
    tpl('hidden-one'),
    tpl('elsewhere', { vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v9'] }),
    tpl('draft', { status: 'DRAFT' }),
    tpl('old', { status: 'SUPERSEDED' }),
    tpl('tech', { area: 'technical' }),
    tpl('loose', { area: null }),
  ];
  const index = indexSettings(toVesselSettings([{ template_id: 'hidden-one', vessel_id: 'v1', visibility: 'hidden' }, { template_id: 'copy', vessel_id: 'v2', visibility: 'hidden' }]));

  it('counts shown, customised, hidden and drafts per area, Unsorted last only when used', () => {
    const counts = areaCounts(templates, ['v1', 'v2'], index, null);
    expect(counts.map((c) => c.area)).toEqual(['charter', 'safety', 'technical', 'movement', 'ptw', 'familiarisation', 'crew', 'sms', 'technical_forms', null]);
    expect(counts.find((c) => c.area === 'safety')).toEqual({ area: 'safety', offered: 3, shown: 3, customised: 1, hidden: 2, drafts: 1, overdue: null });
    expect(counts.find((c) => c.area === 'technical')).toMatchObject({ offered: 1, shown: 1 });
    expect(counts.find((c) => c.area === null)).toMatchObject({ offered: 1 });
  });

  it('one vessel: a template hidden there is not shown', () => {
    expect(areaCounts(templates, ['v1'], index, null).find((c) => c.area === 'safety')).toMatchObject({ offered: 3, shown: 2, customised: 1, hidden: 1 });
  });

  it('overdue counts templates overdue on a vessel in view, once each', () => {
    const stats = [stat('shown', 'v1', { overdue: true }), stat('shown', 'v2', { overdue: true }), stat('copy', 'v9', { overdue: true })];
    expect(areaCounts(templates, ['v1', 'v2'], index, stats).find((c) => c.area === 'safety')?.overdue).toBe(1);
    expect(areaCounts(templates, ['v1', 'v2'], index, []).find((c) => c.area === 'safety')?.overdue).toBe(0);
  });

  it('no Unsorted card when every template has an area', () => {
    expect(areaCounts([tpl('a')], ['v1'], indexSettings([]), null).some((c) => c.area === null)).toBe(false);
  });
});

describe('order on one vessel', () => {
  const templates = [tpl('c', { name: 'Charlie' }), tpl('a', { name: 'Alpha' }), tpl('b', { name: 'Bravo' }), tpl('d', { name: 'Delta', status: 'DRAFT' }), tpl('e', { name: 'Echo', vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v2'] })];

  it('stored order first, then the rest by name; hidden ones kept; drafts and other vessels left out', () => {
    const index = indexSettings(toVesselSettings([{ template_id: 'c', vessel_id: 'v1', sort_order: 1 }, { template_id: 'b', vessel_id: 'v1', sort_order: 2, visibility: 'hidden' }]));
    expect(orderOnVessel(templates, 'safety', 'v1', index).map((t) => t.id)).toEqual(['c', 'b', 'a']);
    expect(orderOnVessel(templates, 'safety', 'v2', index).map((t) => t.id)).toEqual(['a', 'b', 'c', 'e']);
    expect(orderOnVessel(templates, 'technical', 'v1', index)).toEqual([]);
  });

  it('moves an item, clamped; an out-of-range start changes nothing', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, -4)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });

  it('the reorder keys: arrows step, Home and End jump, others do nothing; nothing past the ends', () => {
    expect(reorderKeyTarget('ArrowUp', 2, 4)).toBe(1);
    expect(reorderKeyTarget('ArrowDown', 2, 4)).toBe(3);
    expect(reorderKeyTarget('Home', 2, 4)).toBe(0);
    expect(reorderKeyTarget('End', 2, 4)).toBe(3);
    expect(reorderKeyTarget('ArrowUp', 0, 4)).toBeNull();
    expect(reorderKeyTarget('ArrowDown', 3, 4)).toBeNull();
    expect(reorderKeyTarget('Home', 0, 4)).toBeNull();
    expect(reorderKeyTarget('End', 3, 4)).toBeNull();
    expect(reorderKeyTarget('Enter', 1, 4)).toBeNull();
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('runs', () => {
  const stats = [
    stat('t', 'v1', { runs: 3, last_run_at: '2026-11-20T08:00:00Z', last_run_on: '2026-11-20', next_due: '2026-11-21' }),
    stat('t', 'v2', { runs: 2, last_run_at: '2026-11-24T08:00:00Z', last_run_on: '2026-11-24', next_due: '2026-11-19', overdue: true }),
    stat('t', 'v3', { hidden: true, next_due: null }),
    stat('u', 'v1', { runs: 9 }),
  ];

  it('sums runs, takes the latest run and the earliest due day, and lists where it is overdue', () => {
    expect(runSummary(stats, 't', ['v1', 'v2', 'v3'])).toEqual({ runs: 5, lastRunAt: '2026-11-24T08:00:00Z', lastRunOn: '2026-11-24', nextDue: '2026-11-19', overdueOn: ['v2'] });
    expect(runSummary(stats, 't', ['v1'])).toEqual({ runs: 3, lastRunAt: '2026-11-20T08:00:00Z', lastRunOn: '2026-11-20', nextDue: '2026-11-21', overdueOn: [] });
    expect(runSummary(stats, 'x', ['v1'])).toEqual({ runs: 0, lastRunAt: null, lastRunOn: null, nextDue: null, overdueOn: [] });
  });

  it('the vessel tiles: ran today, due within the week (not overdue), overdue; hidden and other templates left out', () => {
    const today = '2026-11-26';
    const rows = [
      stat('a', 'v1', { last_run_on: today, next_due: '2026-11-27' }),
      stat('b', 'v1', { next_due: '2026-12-02' }),
      stat('c', 'v1', { next_due: '2026-12-03' }),
      stat('d', 'v1', { next_due: '2026-11-20', overdue: true }),
      stat('e', 'v1', { hidden: true, last_run_on: today, overdue: true }),
      stat('a', 'v2', { last_run_on: today }),
      stat('z', 'v1', { last_run_on: today }),
    ];
    expect(vesselRunTally(rows, ['a', 'b', 'c', 'd', 'e'], 'v1', today)).toEqual({ ranToday: 1, dueSoon: 2, overdue: 1 });
  });
});

describe('vesselTemplates', () => {
  const templates = [tpl('b', { name: 'Bravo' }), tpl('a', { name: 'Alpha' }), tpl('h', { name: 'Hotel' }), tpl('t', { name: 'Tech', area: 'technical' }), tpl('d', { name: 'Draft', status: 'DRAFT' }), tpl('o', { name: 'Other', vesselScope: 'VESSEL_SPECIFIC', vesselIds: ['v2'] })];
  const index = indexSettings(toVesselSettings([{ template_id: 'h', vessel_id: 'v1', visibility: 'hidden' }, { template_id: 'b', vessel_id: 'v1', sort_order: 1 }]));

  it('published, offered on the vessel, in its order; hidden ones left out and counted', () => {
    const list = vesselTemplates(templates, 'v1', 'safety', index);
    expect(list.templates.map((t) => t.id)).toEqual(['b', 'a']);
    expect(list.hiddenCount).toBe(1);
  });

  it('every area by name while the area column is missing (area undefined)', () => {
    const list = vesselTemplates(templates, 'v1', undefined, index);
    expect(list.templates.map((t) => t.id)).toEqual(['a', 'b', 't']);
    expect(list.hiddenCount).toBe(1);
  });
});

describe('Showing and formatters', () => {
  const vessels = [
    { id: 'v1', name: 'DRAAK', code: 'DRA', counted: true },
    { id: 'v2', name: 'HYDRA', code: 'HYD', counted: true },
    { id: 'v3', name: 'XIPHIAS', code: 'XIP', counted: false },
  ];

  it('no code: the whole fleet of counted vessels; a known code (any case): that vessel; unknown: the fleet, said', () => {
    expect(resolveShowing(vessels, null)).toEqual({ showing: { kind: 'fleet', vesselIds: ['v1', 'v2'] }, unknownCode: null });
    expect(resolveShowing(vessels, 'xip')).toEqual({ showing: { kind: 'vessel', vessel: vessels[2], vesselIds: ['v3'] }, unknownCode: null });
    expect(resolveShowing(vessels, 'nope')).toEqual({ showing: { kind: 'fleet', vesselIds: ['v1', 'v2'] }, unknownCode: 'NOPE' });
    expect(showingPhrase({ kind: 'fleet', vesselIds: [] })).toBe('on the whole fleet');
    expect(showingPhrase({ kind: 'vessel', vessel: vessels[0], vesselIds: ['v1'] })).toBe('on DRAAK');
  });

  it('formats days, last runs and the freshness stamp', () => {
    expect(formatDay('2026-11-20')).toBe('20 Nov 2026');
    expect(formatDay('20/11/2026')).toBeNull();
    expect(lastRunText('2026-11-26', '2026-11-26')).toBe('Today');
    expect(lastRunText('2026-11-25', '2026-11-26')).toBe('Yesterday');
    expect(lastRunText('2026-11-20', '2026-11-26')).toBe('6 days ago');
    expect(lastRunText('2026-10-01', '2026-11-26')).toBe('1 Oct 2026');
    expect(lastRunText(null, '2026-11-26')).toBeNull();
    expect(formatUpdatedUtc(Date.UTC(2026, 10, 26, 14, 5))).toBe('Updated 26 Nov 2026, 14:05 UTC');
  });
});
