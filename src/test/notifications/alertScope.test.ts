/**
 * The alert scope the bell and the inbox share (gap/10 IA15; spec §2.1;
 * D-71; D-04): the route's vessel, else the company for fleet reach, else
 * the vessels in reach, and never wider because a selection is missing.
 */
import { describe, expect, it } from 'vitest';
import { alertOrFilter, alertScopeFor, alertScopeKey } from '@/modules/notifications/lib/alertScope';

describe('alertScopeFor', () => {
  it('inside the vessel scope: that vessel, whatever the reach', () => {
    for (const fleetReach of [true, false]) {
      expect(alertScopeFor({ routeScope: 'vessel', scopeVesselId: 'v-dra', fleetReach, reachableIds: ['v-dra', 'v-hyd'] })).toEqual({
        kind: 'vessel',
        vesselId: 'v-dra',
      });
    }
  });

  it('elsewhere with fleet reach: the whole company', () => {
    for (const routeScope of ['fleet', 'workspace', 'personal', 'legacy']) {
      expect(alertScopeFor({ routeScope, scopeVesselId: null, fleetReach: true, reachableIds: ['v-dra'] })).toEqual({ kind: 'company' });
    }
  });

  it('elsewhere without fleet reach: the vessels in reach (sorted, de-duplicated)', () => {
    expect(alertScopeFor({ routeScope: 'workspace', scopeVesselId: undefined, fleetReach: false, reachableIds: ['v-hyd', 'v-dra', 'v-hyd'] })).toEqual({
      kind: 'reach',
      vesselIds: ['v-dra', 'v-hyd'],
    });
  });

  it('a vessel scope that has not resolved its vessel falls back to reach, never to the company', () => {
    expect(alertScopeFor({ routeScope: 'vessel', scopeVesselId: undefined, fleetReach: false, reachableIds: ['v-dra'] })).toEqual({
      kind: 'reach',
      vesselIds: ['v-dra'],
    });
  });

  it('no vessel in reach (unassigned, or the vessel list failed): reach with no ids', () => {
    expect(alertScopeFor({ routeScope: 'fleet', scopeVesselId: null, fleetReach: false, reachableIds: [] })).toEqual({ kind: 'reach', vesselIds: [] });
  });
});

describe('alertOrFilter', () => {
  it('one vessel: its alerts and the company-wide ones', () => {
    expect(alertOrFilter({ kind: 'vessel', vesselId: 'v-dra' })).toBe('vessel_id.eq.v-dra,vessel_id.is.null');
  });

  it('the company: no vessel filter', () => {
    expect(alertOrFilter({ kind: 'company' })).toBeNull();
  });

  it('the vessels in reach and the company-wide ones', () => {
    expect(alertOrFilter({ kind: 'reach', vesselIds: ['v-dra'] })).toBe('vessel_id.in.(v-dra),vessel_id.is.null');
    expect(alertOrFilter({ kind: 'reach', vesselIds: ['v-dra', 'v-hyd'] })).toBe('vessel_id.in.(v-dra,v-hyd),vessel_id.is.null');
  });

  it('no vessel in reach: the company-wide alerts only, never every vessel', () => {
    expect(alertOrFilter({ kind: 'reach', vesselIds: [] })).toBe('vessel_id.is.null');
  });
});

describe('alertScopeKey', () => {
  it('differs per scope, so a read for one scope never answers another', () => {
    const keys = [
      alertScopeKey({ kind: 'vessel', vesselId: 'v-dra' }),
      alertScopeKey({ kind: 'vessel', vesselId: 'v-hyd' }),
      alertScopeKey({ kind: 'company' }),
      alertScopeKey({ kind: 'reach', vesselIds: [] }),
      alertScopeKey({ kind: 'reach', vesselIds: ['v-dra'] }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
