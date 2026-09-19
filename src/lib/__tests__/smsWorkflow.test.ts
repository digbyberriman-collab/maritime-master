import { describe, it, expect } from 'vitest';
import {
  SIGNATURE_WORKFLOW,
  canTransition,
  getAvailableActions,
  generateSubmissionNumber,
  generateContentHash,
} from '../smsConstants';
import type { SubmissionStatus } from '../smsConstants';

const ALL_STATUSES = Object.keys(SIGNATURE_WORKFLOW) as SubmissionStatus[];

describe('canTransition', () => {
  it('moves a draft to submitted', () => {
    const t = canTransition('DRAFT', 'submit');
    expect(t?.to).toBe('SUBMITTED');
    expect(t?.requires).toContain('form_complete');
  });

  it('keeps a saved draft in draft', () => {
    expect(canTransition('DRAFT', 'save')?.to).toBe('DRAFT');
  });

  it('locks the form when signing starts', () => {
    const t = canTransition('SUBMITTED', 'start_signing');
    expect(t?.to).toBe('PENDING_SIGNATURE');
    expect(t?.action).toBe('lock_form');
  });

  it('holds in pending signature until every signature is collected', () => {
    const t = canTransition('PENDING_SIGNATURE', 'sign');
    expect(t?.to).toBe('PENDING_SIGNATURE');
    expect(t?.next_if_complete).toBe('SIGNED');
  });

  it('requires authentication to sign', () => {
    expect(canTransition('PENDING_SIGNATURE', 'sign')?.requires).toContain('valid_pin_or_auth');
  });

  it('requires a reason to reject', () => {
    const t = canTransition('PENDING_SIGNATURE', 'reject');
    expect(t?.to).toBe('REJECTED');
    expect(t?.requires).toContain('rejection_reason');
  });

  it('requires DPA approval to amend a signed submission', () => {
    const t = canTransition('SIGNED', 'amend');
    expect(t?.to).toBe('AMENDED');
    expect(t?.requires).toContain('dpa_approval');
    expect(t?.requires).toContain('amendment_reason');
  });

  it('sends a rejected submission back through submission', () => {
    expect(canTransition('REJECTED', 'resubmit')?.to).toBe('SUBMITTED');
  });

  it('sends an amended submission back for signature', () => {
    expect(canTransition('AMENDED', 're_sign')?.to).toBe('PENDING_SIGNATURE');
  });

  it('returns null for an action the state does not offer', () => {
    expect(canTransition('DRAFT', 'sign')).toBeNull();
    expect(canTransition('SIGNED', 'submit')).toBeNull();
    expect(canTransition('REJECTED', 'sign')).toBeNull();
  });

  it('returns null for an unknown status', () => {
    expect(canTransition('NOT_A_STATUS' as SubmissionStatus, 'submit')).toBeNull();
  });

  it('never allows a signed submission to be silently edited or re-signed', () => {
    // The only way out of SIGNED is a recorded amendment.
    expect(getAvailableActions('SIGNED')).toEqual(['amend']);
    expect(canTransition('SIGNED', 'save')).toBeNull();
    expect(canTransition('SIGNED', 'reject')).toBeNull();
  });
});

describe('getAvailableActions', () => {
  it('lists the actions a state offers', () => {
    expect(getAvailableActions('DRAFT').sort()).toEqual(['save', 'submit']);
    expect(getAvailableActions('PENDING_SIGNATURE').sort()).toEqual(['reject', 'sign']);
  });

  it('returns an empty list for an unknown status', () => {
    expect(getAvailableActions('NOT_A_STATUS' as SubmissionStatus)).toEqual([]);
  });

  it('agrees with canTransition for every state and action', () => {
    for (const status of ALL_STATUSES) {
      for (const action of getAvailableActions(status)) {
        expect(canTransition(status, action), `${status}.${action}`).not.toBeNull();
      }
    }
  });
});

describe('workflow graph integrity', () => {
  it('only ever transitions to a state that exists', () => {
    for (const status of ALL_STATUSES) {
      for (const action of getAvailableActions(status)) {
        const t = canTransition(status, action)!;
        expect(ALL_STATUSES, `${status}.${action} -> ${t.to}`).toContain(t.to);
        if (t.next_if_complete) {
          expect(ALL_STATUSES, `${status}.${action} completes to ${t.next_if_complete}`).toContain(
            t.next_if_complete
          );
        }
      }
    }
  });

  it('treats ARCHIVED as terminal, reached outside the signature flow', () => {
    // Archiving is a retention action rather than a signature transition, so
    // nothing in this workflow moves into or out of ARCHIVED.
    expect(getAvailableActions('ARCHIVED')).toEqual([]);

    const inboundToArchived = ALL_STATUSES.flatMap((status) =>
      getAvailableActions(status)
        .map((action) => canTransition(status, action)!)
        .filter((t) => t.to === 'ARCHIVED' || t.next_if_complete === 'ARCHIVED')
    );
    expect(inboundToArchived).toEqual([]);
  });

  it('can reach every signature state from DRAFT', () => {
    const seen = new Set<SubmissionStatus>(['DRAFT']);
    const queue: SubmissionStatus[] = ['DRAFT'];

    while (queue.length) {
      const status = queue.shift()!;
      for (const action of getAvailableActions(status)) {
        const t = canTransition(status, action)!;
        for (const next of [t.to, t.next_if_complete]) {
          if (next && !seen.has(next as SubmissionStatus)) {
            seen.add(next as SubmissionStatus);
            queue.push(next as SubmissionStatus);
          }
        }
      }
    }

    for (const status of ALL_STATUSES) {
      if (status === 'ARCHIVED') continue; // terminal, entered by retention
      expect(seen, `${status} is unreachable from DRAFT`).toContain(status);
    }
  });
});

describe('generateSubmissionNumber', () => {
  it('builds a number from template, vessel, year and sequence', () => {
    expect(generateSubmissionNumber('CHK', 'Serenity', 2026, 42)).toBe('CHK-SEREN-2026-00042');
  });

  it('pads the sequence to five digits', () => {
    expect(generateSubmissionNumber('CHK', 'Serenity', 2026, 1)).toMatch(/-00001$/);
    expect(generateSubmissionNumber('CHK', 'Serenity', 2026, 99999)).toMatch(/-99999$/);
  });

  it('abbreviates the vessel to five characters, uppercased', () => {
    expect(generateSubmissionNumber('X', 'Britannia', 2026, 1)).toContain('-BRITA-');
  });

  it('strips whitespace out of the vessel abbreviation', () => {
    // "My Sh" would otherwise carry a space into the identifier.
    expect(generateSubmissionNumber('X', 'My Ship', 2026, 1)).toBe('X-MYSH-2026-00001');
  });

  it('handles a vessel name shorter than the abbreviation length', () => {
    expect(generateSubmissionNumber('X', 'Koi', 2026, 1)).toBe('X-KOI-2026-00001');
  });
});

describe('generateContentHash', () => {
  it('is stable for the same content', () => {
    const data = { a: 1, b: 'two' };
    expect(generateContentHash(data)).toBe(generateContentHash(data));
  });

  it('changes when any value changes', () => {
    expect(generateContentHash({ a: 1 })).not.toBe(generateContentHash({ a: 2 }));
  });

  it('changes when a field is added', () => {
    expect(generateContentHash({ a: 1 })).not.toBe(generateContentHash({ a: 1, b: 1 }));
  });

  it('always returns at least sixteen hex characters', () => {
    for (const data of [{}, { a: 1 }, { long: 'x'.repeat(500) }]) {
      expect(generateContentHash(data)).toMatch(/^[0-9a-f]{16,}$/);
    }
  });
});
