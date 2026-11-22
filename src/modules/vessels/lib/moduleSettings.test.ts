/**
 * The per-vessel module settings resolver (spec §5.2; gap/10 IA9, W4;
 * DECISIONS C13, D-01, D-04).
 */
import { describe, expect, it } from 'vitest';
import {
  ALL_MODULES_ON,
  TABLE_MISSING_STATE,
  localIsoDate,
  parentModuleKeys,
  resolveModuleSettings,
  type ModuleSettingsState,
  type VesselModuleSetting,
} from './moduleSettings';

const TODAY = '2026-11-22';

const setting = (moduleKey: string, extra: Partial<VesselModuleSetting> = {}): VesselModuleSetting => ({
  moduleKey,
  enabled: true,
  enabledFrom: null,
  labelOverride: null,
  ...extra,
});

const ready = (...rows: VesselModuleSetting[]): ModuleSettingsState => ({
  status: 'ready',
  source: 'table',
  settings: new Map(rows.map((row) => [row.moduleKey, row])),
});

describe('parentModuleKeys', () => {
  it('lists the key and every parent, outermost first', () => {
    expect(parentModuleKeys('technical.jobs')).toEqual(['technical', 'technical.jobs']);
    expect(parentModuleKeys('crew')).toEqual(['crew']);
    expect(parentModuleKeys('a.b.c')).toEqual(['a', 'a.b', 'a.b.c']);
  });
});

describe('resolveModuleSettings', () => {
  it('fails closed while loading and after an error: every key off, no labels', () => {
    for (const state of [{ status: 'loading' }, { status: 'error', message: 'boom' }] as ModuleSettingsState[]) {
      const r = resolveModuleSettings(state, TODAY);
      expect(r.status).toBe(state.status);
      expect(r.isModuleOn('crew')).toBe(false);
      expect(r.isModuleOn('technical.jobs')).toBe(false);
      expect(r.labelFor('planner')).toBeNull();
    }
  });

  it('a missing table means every module on (D-01)', () => {
    const r = resolveModuleSettings(TABLE_MISSING_STATE, TODAY);
    expect(r.status).toBe('ready');
    expect(r.isModuleOn('technical')).toBe(true);
    expect(r.isModuleOn('technical.deck_plans')).toBe(true);
    expect(r.labelFor('charter')).toBeNull();
  });

  it('a missing row means on', () => {
    const r = resolveModuleSettings(ready(setting('crew', { enabled: false })), TODAY);
    expect(r.isModuleOn('safety')).toBe(true);
  });

  it('a disabled row is off', () => {
    const r = resolveModuleSettings(ready(setting('technical', { enabled: false })), TODAY);
    expect(r.isModuleOn('technical')).toBe(false);
  });

  it('a parent key that is off switches its children off; a child off leaves the parent on', () => {
    const parentOff = resolveModuleSettings(ready(setting('technical', { enabled: false }), setting('technical.jobs')), TODAY);
    expect(parentOff.isModuleOn('technical.jobs')).toBe(false);
    const childOff = resolveModuleSettings(ready(setting('technical.jobs', { enabled: false })), TODAY);
    expect(childOff.isModuleOn('technical')).toBe(true);
    expect(childOff.isModuleOn('technical.jobs')).toBe(false);
    expect(childOff.isModuleOn('technical.surveys')).toBe(true);
  });

  it('enabled_from in the future is off, today or earlier is on (every key, not only Hours of Rest)', () => {
    const r = resolveModuleSettings(
      ready(
        setting('crew_hor', { enabledFrom: '2026-11-23' }),
        setting('crew_training', { enabledFrom: TODAY }),
        setting('safety', { enabledFrom: '2026-01-01' }),
        setting('charter', { enabledFrom: '2027-03-01' }),
      ),
      TODAY,
    );
    expect(r.isModuleOn('crew_hor')).toBe(false);
    expect(r.isModuleOn('crew_training')).toBe(true);
    expect(r.isModuleOn('safety')).toBe(true);
    expect(r.isModuleOn('charter')).toBe(false);
  });

  it('applies a label override to its exact key only, trimmed; a blank override keeps the default', () => {
    const r = resolveModuleSettings(
      ready(setting('planner', { labelOverride: '  Leave ' }), setting('charter', { labelOverride: 'Trip' }), setting('vessel', { labelOverride: '   ' })),
      TODAY,
    );
    expect(r.labelFor('planner')).toBe('Leave');
    expect(r.labelFor('charter')).toBe('Trip');
    expect(r.labelFor('vessel')).toBeNull();
    expect(r.labelFor('charter.guests')).toBeNull();
    expect(r.labelFor('crew')).toBeNull();
  });

  it('a label override never switches a module on or off', () => {
    const r = resolveModuleSettings(ready(setting('charter', { enabled: false, labelOverride: 'Trip' })), TODAY);
    expect(r.isModuleOn('charter')).toBe(false);
    expect(r.labelFor('charter')).toBe('Trip');
  });
});

describe('helpers', () => {
  it('ALL_MODULES_ON says yes to every key', () => {
    expect(ALL_MODULES_ON.isModuleOn('anything.at.all')).toBe(true);
    expect(ALL_MODULES_ON.labelFor('planner')).toBeNull();
  });

  it('localIsoDate is the local calendar date', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
