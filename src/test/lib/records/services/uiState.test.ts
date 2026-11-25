/**
 * Page-state helpers (Phase 2 spec §B.6) over the frozen C3 libraries:
 * the action bar from `availableActions` / `envelopeStateForKind`, the
 * whose-move chip from the server's `whose_move`, the signing-order banner
 * from `orderBanner` over the server's slot states, and stale warnings. No
 * helper computes a status the server did not return.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import type { RecordKind } from '@/lib/records/registry';
import {
  envelopeActions,
  envelopeCloseAsOptions,
  envelopeStateFromRow,
  envelopeWhoseMoveLabel,
  sheetFromSlotStates,
  signingOrderBanner,
  staleSignatureWarning,
  type EnvelopeSummary,
  type RecordSignatureSlotStateRow,
} from '@/lib/records/services';

const INCIDENT: RecordKind = {
  key: 'safety.incident',
  moduleKey: 'safety',
  label: 'Incident',
  refPrefix: 'INC',
  scope: 'vessel',
  capabilityPath: 'vessel.safety.incidents',
  enveloped: true,
  companyStep: 'sign_off',
  reportFirst: true,
  allowCloseAs: true,
  editAfterSign: 'allow_with_flag',
  deleteRule: 'never_after_submit',
  slotTemplate: [
    { key: 'master', label: 'Master', order: 1, party: 'vessel' },
    { key: 'dpa', label: 'DPA', order: 2, party: 'company' },
  ],
};

const envelope = (patch: Partial<EnvelopeSummary> = {}): EnvelopeSummary => ({
  id: 'e1',
  company_id: 'c1',
  vessel_id: 'v1',
  module_key: 'safety',
  kind_key: 'safety.incident',
  entity_id: null,
  reference: 'INC-DRA-2026-001',
  title: null,
  status: 'open',
  whose_move: 'vessel',
  closed_by_kind: null,
  closed_as: null,
  company_decision: null,
  company_acknowledged: false,
  initial_report_acknowledged: false,
  current_cycle: 1,
  acknowledged_cycle: null,
  version: 1,
  last_update_at: null,
  follow_up_due: null,
  voided_at: null,
  opened_at: '2026-11-23T08:00:00Z',
  updated_at: '2026-11-23T08:00:00Z',
  ...patch,
});

const slot = (patch: Partial<RecordSignatureSlotStateRow>): RecordSignatureSlotStateRow => ({
  slot_id: `slot-${patch.slot_key ?? 'x'}`,
  envelope_id: 'e1',
  company_id: 'c1',
  vessel_id: 'v1',
  cycle: 1,
  slot_key: 'x',
  label: 'X',
  order_no: 1,
  party: 'vessel',
  required: true,
  state: 'open',
  live_signature_id: null,
  stale: false,
  passed_to_profile_id: null,
  passed_at: null,
  ...patch,
});

describe('the action bar', () => {
  it('maps the server row onto the envelope machine of the kind', () => {
    const state = envelopeStateFromRow(INCIDENT, envelope({ status: 'submitted', current_cycle: 2, acknowledged_cycle: 1, version: 7, closed_by_kind: null }));
    expect(state).toMatchObject({ status: 'submitted', companyStep: 'sign_off', reportFirst: true, allowCloseAs: true, cycle: 2, acknowledgedCycle: 1, version: 7, deleteRule: 'never_after_submit' });
  });

  it('offers the vessel Submit on an open incident and the company nothing yet', () => {
    expect(envelopeActions(INCIDENT, envelope(), 'vessel')).toContain('submit');
    expect(envelopeActions(INCIDENT, envelope(), 'company')).not.toContain('sign_off');
  });

  it('offers the company Acknowledge on a submitted report, never vessel_sign', () => {
    const company = envelopeActions(INCIDENT, envelope({ status: 'submitted' }), 'company');
    expect(company).toContain('acknowledge');
    for (const party of ['vessel', 'company'] as const) {
      for (const status of ['open', 'in_review', 'submitted', 'acknowledged', 'awaiting_company_close'] as const) {
        expect(envelopeActions(INCIDENT, envelope({ status }), party)).not.toContain('vessel_sign');
      }
    }
  });

  it('a closed record offers nothing that is not allowed by the kind', () => {
    expect(envelopeActions(INCIDENT, envelope({ status: 'closed', closed_by_kind: 'company_sign_off', whose_move: 'none' }), 'company')).not.toContain('reopen');
    expect(envelopeCloseAsOptions(INCIDENT, envelope({ status: 'submitted' }))).toEqual(['raised_in_error', 'duplicate']);
  });
});

describe('the whose-move chip is the server\'s, in STORM words', () => {
  it.each([
    ['vessel', 'open', 'Waiting on vessel'],
    ['company', 'submitted', 'Waiting on company'],
    ['none', 'closed', 'Closed'],
    ['none', 'void', 'Voided'],
  ] as const)('%s / %s → %s', (move, status, label) => {
    expect(envelopeWhoseMoveLabel({ whose_move: move, status })).toBe(label);
  });
});

describe('the signing-order banner', () => {
  it('waits on the open required slot', () => {
    const rows = [
      slot({ slot_key: 'master', label: 'Master', order_no: 1, state: 'open' }),
      slot({ slot_key: 'chief_officer', label: 'Chief Officer', order_no: 2, state: 'waiting' }),
    ];
    expect(signingOrderBanner(rows)).toBe("Waiting for the Master's signature — sign in order");
  });

  it('parallel slots, a passed slot, and a complete sheet', () => {
    const parallel = [
      slot({ slot_key: 'master', label: 'Master', order_no: 1, state: 'signed', live_signature_id: 's1' }),
      slot({ slot_key: 'bosun', label: 'Bosun', order_no: 2, state: 'requested', passed_to_profile_id: 'p2', passed_at: '2026-11-23T09:00:00Z' }),
      slot({ slot_key: 'chief_engineer', label: 'Chief Engineer', order_no: 2, state: 'open' }),
    ];
    expect(signingOrderBanner(parallel)).toBe("Waiting for the Bosun's and the Chief Engineer's signatures — sign in order");
    const complete = [slot({ slot_key: 'master', label: 'Master', state: 'signed', live_signature_id: 's1' })];
    expect(signingOrderBanner(complete)).toBeNull();
  });

  it('says nothing when the library would contradict the server', () => {
    // The server says the later slot is open although the earlier required one is unsigned.
    const contradictory = [
      slot({ slot_key: 'master', label: 'Master', order_no: 1, state: 'open' }),
      slot({ slot_key: 'chief_officer', label: 'Chief Officer', order_no: 2, state: 'open' }),
    ];
    expect(sheetFromSlotStates(contradictory)).toBeNull();
    expect(signingOrderBanner(contradictory)).toBeNull();
    // Rows of two cycles are not one sheet.
    expect(sheetFromSlotStates([slot({ cycle: 1 }), slot({ slot_key: 'y', cycle: 2 })])).toBeNull();
    expect(signingOrderBanner([])).toBeNull();
  });
});

describe('stale signatures', () => {
  it('names the stale slots and says when it blocks', () => {
    const rows = [
      slot({ slot_key: 'master', label: 'Master', state: 'signed', live_signature_id: 's1', stale: true }),
      slot({ slot_key: 'witness', label: 'Witness', order_no: 2, required: false, state: 'signed', live_signature_id: 's2', stale: true }),
    ];
    expect(staleSignatureWarning(rows)).toBe(
      'The Master and Witness signatures are out of date: the record changed after signing. Re-sign before it can go to the company or close.',
    );
    expect(staleSignatureWarning([rows[1]])).toBe('The Witness signature is out of date: the record changed after signing. Re-sign to confirm the change.');
    expect(staleSignatureWarning([slot({ state: 'signed', live_signature_id: 's1', stale: false })])).toBeNull();
  });
});
