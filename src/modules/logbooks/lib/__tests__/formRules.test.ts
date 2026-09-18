import { describe, expect, it } from 'vitest';
import { LOGBOOK_BOOKS } from '../catalog';
import { canAttestWitness, canCountersign, completion, fieldProblems, missingSigners } from '../formRules';
import { capacityFor, canWrite, resolveCapacity } from '../roles';

const official = LOGBOOK_BOOKS.find((b) => b.id === 'official')!;
const ballast = LOGBOOK_BOOKS.find((b) => b.id === 'ballast')!;

describe('field validation', () => {
  it('rejects out-of-range numbers, unknown options, bad UTC times and unexpected keys', () => {
    const drills = official.sections.find((s) => s.id === 'drills')!;
    expect(fieldProblems(drills, { unexpected: 'x' })[0].message).toMatch(/Unexpected/);
    const numeric = ballast.sections.find((s) => s.fields.some((f) => f.type === 'number'))!;
    const numberField = numeric.fields.find((f) => f.type === 'number')!;
    expect(fieldProblems(numeric, { [numberField.key]: -1 })[0].message).toMatch(/must be between/);
    const select = drills.fields.find((f) => f.type === 'select')!;
    expect(fieldProblems(drills, { [select.key]: 'Nope' })[0].message).toMatch(/valid/);
    const timed = ballast.sections.find((s) => s.fields.some((f) => f.type === 'datetime-local'))!;
    const time = timed.fields.find((f) => f.type === 'datetime-local')!;
    expect(fieldProblems(timed, { [time.key]: '2026-13-40T99:99' })[0].message).toMatch(/UTC/);
  });

  it('applies conditional requirements before signing', () => {
    const drills = official.sections.find((s) => s.id === 'drills')!;
    const reason = drills.fields.find((f) => f.key === 'reason')!;
    expect(reason.requiredWhen).toEqual({ field: 'drill', equals: 'Postponed / cancelled' });
    const incomplete = completion(drills, { drill: 'Postponed / cancelled' });
    expect(incomplete.missing.some((p) => p.key === 'reason')).toBe(true);
    const other = completion(drills, { drill: drills.fields.find((f) => f.key === 'drill')!.options![0] });
    expect(other.missing.some((p) => p.key === 'reason')).toBe(false);
  });

  it('requires finish after start', () => {
    const section = ballast.sections.find((s) => s.fields.some((f) => f.key === 'startTime') && s.fields.some((f) => f.key === 'endTime'))!;
    const problems = fieldProblems(section, { startTime: '2026-09-15T10:00', endTime: '2026-09-15T09:00' });
    expect(problems.some((p) => p.key === 'endTime')).toBe(true);
  });
});

describe('signature policies', () => {
  const author = { kind: 'author', actor_id: 'u1', actor_capacity: 'officer' } as const;
  it('lists outstanding signers and clears them with the Master page review', () => {
    expect(missingSigners('master-catering', [author])).toEqual(['Master', 'catering witness']);
    expect(missingSigners('master-catering', [author], true)).toEqual(['catering witness']);
    expect(missingSigners('master-mother', [author, { kind: 'attested', actor_id: 'm', actor_capacity: 'master', witness_capacity: 'mother' }])).toEqual([]);
    expect(missingSigners('inspector-crew', [author], true)).toEqual([]);
    expect(missingSigners('inspector-crew', [author])).toEqual(['Master', 'another crew member']);
  });

  it('only allows the right capacity to countersign, never the author', () => {
    const entry = { status: 'signed', recorded_by: 'u1', superseded_by_id: null, schema_snapshot: { signing: 'master-catering' as const } };
    expect(canCountersign(entry, [author], 'steward', 'u2')).toBe(true);
    expect(canCountersign(entry, [author], 'officer', 'u2')).toBe(false);
    expect(canCountersign(entry, [author], 'steward', 'u1')).toBe(false);
    expect(canCountersign({ ...entry, status: 'draft' }, [author], 'steward', 'u2')).toBe(false);
  });

  it('lets only the Master attest an external witness where the policy needs one', () => {
    const entry = { status: 'signed', recorded_by: 'u1', superseded_by_id: null, schema_snapshot: { signing: 'surveyor-master' as const } };
    expect(canAttestWitness(entry, [author], 'master')).toBe('surveyor');
    expect(canAttestWitness(entry, [author], 'officer')).toBeNull();
    expect(canAttestWitness(entry, [author, { kind: 'attested', actor_id: 'm', actor_capacity: 'master', witness_capacity: 'surveyor' }], 'master')).toBeNull();
  });
});

describe('role mapping', () => {
  it('maps platform roles to strict onboard capacities', () => {
    expect(capacityFor(['captain'])).toBe('master');
    expect(capacityFor(['master'])).toBe('master');
    expect(capacityFor(['chief_officer'])).toBe('officer');
    expect(capacityFor(['chief_engineer'])).toBe('engineer');
    expect(capacityFor(['crew'])).toBe('steward');
    expect(capacityFor(['dpa'])).toBeNull();
    expect(capacityFor(['superadmin', 'fleet_master'])).toBeNull();
  });

  it('lets RBAC roles decide before the legacy profile role, as the database does', () => {
    expect(resolveCapacity(['officer'], 'master')).toBe('officer');
    expect(resolveCapacity([], 'master')).toBe('master');
    expect(resolveCapacity(['dpa'], 'chief_engineer')).toBe('engineer');
    expect(resolveCapacity(['dpa'], 'dpa')).toBeNull();
    // Legacy profile values the database does not map carry no capacity.
    expect(resolveCapacity([], 'captain')).toBeNull();
    expect(resolveCapacity([], 'purser')).toBeNull();
  });

  it('exempts the Master from section role lists, as the database does', () => {
    const orders = LOGBOOK_BOOKS.find((b) => b.id === 'orders')!;
    const restricted = { ...orders.sections[0], roles: ['engineer' as const] };
    expect(canWrite('master', orders, restricted)).toBe(true);
    expect(canWrite('engineer', orders, restricted)).toBe(true);
    expect(canWrite('officer', orders, restricted)).toBe(false);
  });

  it('lets the Master write everywhere and restricts sections by author role', () => {
    const particulars = official.sections.find((s) => s.id === 'particulars')!;
    expect(canWrite('master', official, particulars)).toBe(true);
    expect(canWrite('officer', official, particulars)).toBe(false);
    expect(canWrite('engineer', official, official.sections.find((s) => s.id === 'drills'))).toBe(false);
    expect(canWrite('officer', official, official.sections.find((s) => s.id === 'drills'))).toBe(true);
  });
});
