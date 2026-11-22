/**
 * The vessel switcher's pure model (spec §6.2): grouping, search and the
 * alert labels.
 */
import { describe, expect, it } from 'vitest';
import {
  alertSummaryLabel,
  buildSwitcherGroups,
  severityTone,
  switcherFilter,
  switcherSearchValue,
  type SwitcherVessel,
} from '@/shared/components/layout/topbar/vesselSwitcherModel';

const v = (id: string, name: string, code: string, fleetGroupId: string | null = null, imo: string | null = null): SwitcherVessel => ({
  id,
  name,
  code,
  imo,
  fleetGroupId,
});

const DRA = v('dra', 'DRAAK', 'DRA', 'med', '9416202');
const HYD = v('hyd', 'HYDRA', 'HYD', 'carib');
const GAM = v('gam', 'GAME CHANGER', 'GAM', 'med');
const XIP = v('xip', 'XIPHIAS', 'XIP');
const GROUPS = [
  { id: 'med', name: 'Mediterranean' },
  { id: 'carib', name: 'Caribbean' },
  { id: 'empty', name: 'Arctic' },
];

describe('buildSwitcherGroups', () => {
  it('Recent first, then fleet groups by name, then Other vessels', () => {
    const groups = buildSwitcherGroups({ vessels: [XIP, DRA, HYD, GAM], recentIds: ['hyd', 'dra'], groups: GROUPS });
    expect(groups.map((g) => [g.heading, g.vessels.map((x) => x.code)])).toEqual([
      ['Recent', ['HYD', 'DRA']],
      ['Caribbean', ['HYD']],
      ['Mediterranean', ['DRA', 'GAM']],
      ['Other vessels', ['XIP']],
    ]);
  });

  it('keeps at most three recent vessels and drops ids no longer in reach', () => {
    const groups = buildSwitcherGroups({ vessels: [DRA, HYD, GAM, XIP], recentIds: ['gone', 'xip', 'dra', 'hyd', 'gam'], groups: [] });
    expect(groups[0]).toMatchObject({ heading: 'Recent' });
    expect(groups[0].vessels.map((x) => x.code)).toEqual(['XIP', 'DRA', 'HYD']);
  });

  it('one "Vessels" group without fleet groups (none, loading or failed)', () => {
    const groups = buildSwitcherGroups({ vessels: [HYD, DRA], recentIds: [], groups: [] });
    expect(groups).toEqual([{ id: 'all', heading: 'Vessels', vessels: [DRA, HYD] }]);
  });

  it('one "Vessels" group when no vessel belongs to a fleet group', () => {
    const groups = buildSwitcherGroups({ vessels: [XIP], recentIds: [], groups: GROUPS });
    expect(groups.map((g) => g.heading)).toEqual(['Vessels']);
  });

  it('nothing for no vessels', () => {
    expect(buildSwitcherGroups({ vessels: [], recentIds: ['dra'], groups: GROUPS })).toEqual([]);
  });
});

describe('search', () => {
  it('matches on name, code and IMO', () => {
    expect(switcherSearchValue(DRA)).toBe('DRAAK DRA 9416202');
    expect(switcherSearchValue(XIP)).toBe('XIPHIAS XIP');
    const keywords = [DRA.name, DRA.code, DRA.imo ?? ''];
    expect(switcherFilter('x', 'draak', keywords)).toBe(1);
    expect(switcherFilter('x', 'dra', keywords)).toBe(1);
    expect(switcherFilter('x', '9416', keywords)).toBe(1);
    expect(switcherFilter('x', 'hyd', keywords)).toBe(0);
    expect(switcherFilter('x', '', keywords)).toBe(1);
  });

  it('matches every word, ignoring case and accents', () => {
    const keywords = ['GAME CHANGER', 'GAM', ''];
    expect(switcherFilter('x', 'game ch', keywords)).toBe(1);
    expect(switcherFilter('x', 'gâme', keywords)).toBe(1);
    expect(switcherFilter('x', 'game hydra', keywords)).toBe(0);
  });

  it('never matches the item value (an id), only the keywords', () => {
    expect(switcherFilter('recent:v-123', 'recent', ['DRAAK', 'DRA', ''])).toBe(0);
  });
});

describe('alert labels and tones', () => {
  it('maps severities to the pill tones of D-57', () => {
    expect(['RED', 'ORANGE', 'YELLOW', 'GREEN'].map((s) => severityTone(s as 'RED'))).toEqual(['danger', 'orange', 'warn', 'ok']);
  });

  it('says the count and the worst severity, with n+ when the summary was cut', () => {
    expect(alertSummaryLabel(1, 'ORANGE', false)).toBe('1 open alert, worst orange');
    expect(alertSummaryLabel(3, 'RED', false)).toBe('3 open alerts, worst red');
    expect(alertSummaryLabel(1000, 'RED', true)).toBe('1000+ open alerts, worst red');
  });
});
