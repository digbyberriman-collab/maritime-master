/**
 * Crew edit refusal copy and the office normaliser (finding
 * crew-edit-guard-refusal-fake-success): a guard refusal reads as its
 * DETAIL sentence, a bare code never reaches the user, and Master /
 * Captain are recognised the way the SQL guards normalise them.
 */
import { describe, expect, it } from 'vitest';
import {
  CrewUpdatePartialError,
  crewRefusalMessage,
  isMasterOffice,
  isPendingPlacementAssignment,
  normaliseOffice,
} from '@/modules/crew/lib/crewUpdateErrors';

describe('crewRefusalMessage', () => {
  it('uses the DETAIL of a 42501 guard refusal', () => {
    expect(
      crewRefusalMessage({
        code: '42501',
        message: 'master_office_change_refused',
        details: 'Only a users-access administrator of the vessel can appoint or remove a Master.',
      }),
    ).toBe('Only a users-access administrator of the vessel can appoint or remove a Master.');
  });

  it('falls back to the notify copy for a 42501 without a DETAIL', () => {
    expect(crewRefusalMessage({ code: '42501', message: 'new row violates row-level security policy for table "profiles"' })).toBe(
      "You don't have permission to do that.",
    );
  });

  it('never returns a bare code', () => {
    expect(crewRefusalMessage({ code: 'P0001', message: 'self_office_change_refused' })).toBe("You don't have permission to do that.");
    expect(crewRefusalMessage(new Error('profile_access_columns_locked'))).toBe("You don't have permission to do that.");
    expect(crewRefusalMessage({ code: '42501', message: 'x_refused', details: 'still_a_code' })).toBe("You don't have permission to do that.");
  });

  it('keeps a sentence and maps other codes through notify', () => {
    expect(crewRefusalMessage(new Error('No changes were saved.'))).toBe('No changes were saved.');
    expect(crewRefusalMessage({ code: '22007', message: 'invalid input syntax for type date: ""' })).toBe('One of the dates is not valid.');
  });
});

describe('CrewUpdatePartialError', () => {
  it('names both parts', () => {
    const error = new CrewUpdatePartialError("You can't change this assignment.");
    expect(error.profileSaved).toBe(true);
    expect(error.name).toBe('CrewUpdatePartialError');
    expect(error.reason).toBe("You can't change this assignment.");
    expect(error.message).toBe("Profile saved. The position change was refused: You can't change this assignment.");
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isMasterOffice', () => {
  it('normalises as the SQL guards do', () => {
    expect(normaliseOffice('  Chief  Officer ')).toBe('chief_officer');
    expect(normaliseOffice('-Master-')).toBe('master');
    expect(normaliseOffice(null)).toBe('');
  });

  it('is true for master and captain only', () => {
    for (const office of ['Master', 'MASTER', ' master ', 'Captain', 'captain.', '(Captain)']) expect(isMasterOffice(office)).toBe(true);
    for (const office of ['Relief Captain', 'Master Chef', 'Chief Officer', '', null, undefined, 'Mästër']) expect(isMasterOffice(office)).toBe(false);
  });

  it('lower-cases ASCII only, like translate()', () => {
    // The Kelvin sign lower-cases to an ASCII k in JavaScript; the SQL leaves it alone.
    expect(normaliseOffice('Kapitan')).toBe('apitan');
  });
});

describe('isPendingPlacementAssignment', () => {
  it('recognises the placement useCrew builds from imported_vessel_id', () => {
    expect(isPendingPlacementAssignment({ id: 'imported-p-1' })).toBe(true);
    expect(isPendingPlacementAssignment({ id: 'x', pending_placement: true })).toBe(true);
    expect(isPendingPlacementAssignment({ id: '7c1e0a52-0000-4000-8000-000000000001' })).toBe(false);
    expect(isPendingPlacementAssignment(null)).toBe(false);
  });
});
