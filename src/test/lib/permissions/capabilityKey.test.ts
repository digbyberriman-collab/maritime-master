import { describe, expect, it } from 'vitest';
import {
  CAPABILITY_ACTIONS,
  isCapabilityAction,
  isCapabilityKey,
  parseCapabilityKey,
} from '@/lib/permissions/types';

describe('capability keys', () => {
  it('parses a four-segment snake_case key', () => {
    expect(parseCapabilityKey('vessel.safety.permit_to_work.final_approve')).toEqual({
      domain: 'vessel',
      module: 'safety',
      subcategory: 'permit_to_work',
      action: 'final_approve',
      path: 'vessel.safety.permit_to_work',
      modulePath: 'vessel.safety',
    });
  });

  it.each([
    ['three segments', 'vessel.safety.view'],
    ['five segments', 'vessel.safety.drills.extra.view'],
    ['empty segment', 'vessel..drills.view'],
    ['upper case', 'Vessel.safety.drills.view'],
    ['kebab case', 'vessel.safety.permit-to-work.view'],
    ['leading digit', 'vessel.safety.1drills.view'],
    ['unknown action', 'vessel.safety.drills.read'],
    ['whitespace', 'vessel.safety.drills.view '],
    ['empty string', ''],
  ])('rejects %s', (_label, key) => {
    expect(parseCapabilityKey(key)).toBeNull();
    expect(isCapabilityKey(key)).toBe(false);
  });

  it('knows every PMS action and nothing else', () => {
    expect(CAPABILITY_ACTIONS).toHaveLength(12);
    for (const action of CAPABILITY_ACTIONS) expect(isCapabilityAction(action)).toBe(true);
    expect(isCapabilityAction('read')).toBe(false);
    expect(isCapabilityAction('dash')).toBe(false);
  });

  it('allows digits and underscores after the first letter', () => {
    expect(isCapabilityKey('vessel.dept_it_av.work_lists.assign')).toBe(true);
    expect(parseCapabilityKey('vessel.safety.ntvrp_opa90.view')?.subcategory).toBe('ntvrp_opa90');
    // Shape only: whether the key exists is the catalogue's question.
    expect(isCapabilityKey('vessel.nowhere.nothing.view')).toBe(true);
  });
});
