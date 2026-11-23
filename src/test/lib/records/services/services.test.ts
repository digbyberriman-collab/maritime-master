/**
 * Record-engine services against a mocked Supabase client (Phase 2 spec
 * §B.6): every wrapper maps a missing relation (D-01) to `missing`, a rule
 * refusal (`{ok:false}` jsonb, or SQLSTATE 22023 for the row-returning
 * RPCs) to `refused`, and throws a 403 / 500 so the page's error state sees
 * it. The client never writes a status: transitions are RPCs that name an
 * action.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

type Reply = { data: unknown; error: unknown };
const h = vi.hoisted(() => ({
  /** Reply per table or RPC name; default: no rows. */
  replies: new Map<string, Reply>(),
  rpcs: [] as { name: string; args: unknown }[],
  reads: [] as { table: string; columns: string; filters: [string, string, unknown][]; order: string[]; limit?: number }[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const call = { table, columns: '', filters: [] as [string, string, unknown][], order: [] as string[], limit: undefined as number | undefined };
    h.reads.push(call);
    const builder = {
      select: (columns: string) => {
        call.columns = columns;
        return builder;
      },
      eq: (k: string, v: unknown) => {
        call.filters.push([k, 'eq', v]);
        return builder;
      },
      is: (k: string, v: unknown) => {
        call.filters.push([k, 'is', v]);
        return builder;
      },
      order: (k: string) => {
        call.order.push(k);
        return builder;
      },
      limit: (n: number) => {
        call.limit = n;
        return builder;
      },
      maybeSingle: () => builder,
      then: (resolve: (v: Reply) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve(h.replies.get(table) ?? { data: [], error: null }).then(resolve, reject),
    };
    return builder;
  };
  const rpc = (name: string, args: unknown) => {
    h.rpcs.push({ name, args });
    return Promise.resolve(h.replies.get(name) ?? { data: null, error: null });
  };
  return { supabase: { from, rpc } };
});

import {
  cancelExportJob,
  cancelRecordSlotPass,
  exportPollInterval,
  fetchAttachments,
  fetchEnvelope,
  fetchEnvelopeByEntity,
  fetchExportJob,
  fetchRecordEvents,
  fetchRecordLinks,
  fetchSlotStates,
  fetchThreadEntries,
  fromRpcResult,
  linkRecords,
  logClientExport,
  passRecordSlot,
  reSignRecordSlot,
  recordKeys,
  refusedOrThrow,
  removeRecordAttachment,
  removeRecordSignature,
  requestExport,
  resolveThreadRequest,
  signRecordSlot,
  transitionRecord,
  unlinkRecords,
  postThreadEntry,
} from '@/lib/records/services';

const MISSING_TABLE = { code: 'PGRST205', message: "Could not find the table 'public.record_envelopes' in the schema cache" };
const MISSING_FN = { code: 'PGRST202', message: 'Could not find the function public.record_transition in the schema cache' };
const FORBIDDEN = { code: '42501', message: 'permission denied for function record_transition' };
const SERVER = { code: '500', message: 'Internal Server Error' };
const RULE = { code: '22023', message: 'record_closed' };
const REFUSAL = { ok: false, error: { code: 'open_requests', message: 'Resolve the open requests first.' } };

afterEach(() => {
  h.replies.clear();
  h.rpcs.length = 0;
  h.reads.length = 0;
});

/** Each read: [name, the table it reads, call]. */
const reads: [string, string, () => Promise<unknown>][] = [
  ['fetchEnvelope', 'record_envelopes', () => fetchEnvelope('e1')],
  ['fetchEnvelopeByEntity', 'record_envelopes', () => fetchEnvelopeByEntity('safety.incident', 'x1')],
  ['fetchRecordEvents', 'record_events', () => fetchRecordEvents('e1')],
  ['fetchSlotStates', 'record_signature_slot_states', () => fetchSlotStates('e1', 2)],
  ['fetchThreadEntries', 'record_threads', () => fetchThreadEntries('e1', 'status_updates')],
  ['fetchAttachments', 'record_attachments', () => fetchAttachments('e1')],
  ['fetchRecordLinks', 'record_links', () => fetchRecordLinks('e1')],
  ['fetchExportJob', 'export_jobs', () => fetchExportJob('j1')],
];

describe.each(reads)('%s', (_name, table, call) => {
  it('missing table → missing (the "not set up" state)', async () => {
    h.replies.set(table, { data: null, error: MISSING_TABLE });
    await expect(call()).resolves.toEqual({ status: 'missing' });
  });

  it.each([
    ['403', FORBIDDEN],
    ['500', SERVER],
  ])('a %s is thrown, never "nothing there"', async (_code, error) => {
    h.replies.set(table, { data: null, error });
    await expect(call()).rejects.toBe(error);
  });

  it('rows → ok', async () => {
    await expect(call()).resolves.toMatchObject({ status: 'ok' });
  });
});

describe('reads ask for what they need, in order', () => {
  it('envelopes by id and by entity, the event trail newest first', async () => {
    await fetchEnvelope('e1');
    await fetchEnvelopeByEntity('safety.incident', 'x1');
    await fetchRecordEvents('e1', 50);
    expect(h.reads[0].filters).toEqual([['id', 'eq', 'e1']]);
    expect(h.reads[0].columns).not.toContain('*');
    expect(h.reads[1].filters).toEqual([['kind_key', 'eq', 'safety.incident'], ['entity_id', 'eq', 'x1']]);
    expect(h.reads[2]).toMatchObject({ table: 'record_events', filters: [['envelope_id', 'eq', 'e1']], order: ['created_at'], limit: 50 });
  });

  it('slot states of one cycle, in cycle and signing order', async () => {
    await fetchSlotStates('e1', 2);
    expect(h.reads[0]).toMatchObject({ filters: [['envelope_id', 'eq', 'e1'], ['cycle', 'eq', 2]], order: ['cycle', 'order_no'] });
  });

  it('a thread with no row yet is empty (not missing); entries come from the thread row', async () => {
    h.replies.set('record_threads', { data: null, error: null });
    await expect(fetchThreadEntries('e1', 'status_updates')).resolves.toEqual({ status: 'ok', value: [] });
    h.replies.set('record_threads', { data: { id: 't1' }, error: null });
    h.replies.set('record_thread_entries', { data: [{ id: 'n1' }], error: null });
    await expect(fetchThreadEntries('e1', 'company_review')).resolves.toEqual({ status: 'ok', value: [{ id: 'n1' }] });
    expect(h.reads.at(-1)).toMatchObject({ table: 'record_thread_entries', filters: [['thread_id', 'eq', 't1']] });
  });

  it('attachments and links leave out removed rows', async () => {
    await fetchAttachments('e1');
    await fetchRecordLinks('e1');
    expect(h.reads[0].filters).toContainEqual(['removed_at', 'is', null]);
    expect(h.reads[1].filters).toContainEqual(['removed_at', 'is', null]);
  });
});

/** Each jsonb-envelope RPC: [name, rpc, call]. */
const jsonbRpcs: [string, string, () => Promise<unknown>][] = [
  ['transitionRecord', 'record_transition', () => transitionRecord({ envelopeId: 'e1', action: 'acknowledge' })],
  ['signRecordSlot', 'record_sign_slot', () => signRecordSlot({ signatureId: 's1', slotId: 'sl1', method: 'verified' })],
  ['passRecordSlot', 'record_pass_slot', () => passRecordSlot('sl1', 'p2')],
  ['cancelRecordSlotPass', 'record_cancel_pass', () => cancelRecordSlotPass('sl1')],
  ['removeRecordSignature', 'record_remove_signature', () => removeRecordSignature('s1', 'wrong slot')],
  ['reSignRecordSlot', 'record_resign_slot', () => reSignRecordSlot('s2', 'sl1')],
  ['postThreadEntry', 'record_post_thread_entry', () => postThreadEntry({ entryId: 'n1', envelopeId: 'e1', threadKind: 'status_updates', entryType: 'update', body: 'Hatch secured' })],
  ['resolveThreadRequest', 'record_resolve_thread_request', () => resolveThreadRequest('r1', 'done')],
];

describe.each(jsonbRpcs)('%s (jsonb result envelope)', (_name, rpc, call) => {
  it('{ok:true} → ok with the value', async () => {
    h.replies.set(rpc, { data: { ok: true, value: { id: 'x' } }, error: null });
    await expect(call()).resolves.toEqual({ status: 'ok', value: { id: 'x' } });
  });

  it('a rule refusal {ok:false} → refused with the stable code', async () => {
    h.replies.set(rpc, { data: REFUSAL, error: null });
    await expect(call()).resolves.toEqual({ status: 'refused', code: 'open_requests', message: 'Resolve the open requests first.' });
  });

  it('function not live → missing', async () => {
    h.replies.set(rpc, { data: null, error: MISSING_FN });
    await expect(call()).resolves.toEqual({ status: 'missing' });
  });

  it.each([
    ['403 (no access to the record)', FORBIDDEN],
    ['500', SERVER],
  ])('a %s is thrown', async (_code, error) => {
    h.replies.set(rpc, { data: null, error });
    await expect(call()).rejects.toBe(error);
  });

  it('an answer outside the envelope is a protocol error (thrown), never a fake success', async () => {
    h.replies.set(rpc, { data: 'done', error: null });
    await expect(call()).rejects.toThrow('The record engine returned an answer STORM does not understand.');
  });
});

/** Each row-returning RPC: [name, rpc, call]. */
const rowRpcs: [string, string, () => Promise<unknown>][] = [
  ['linkRecords', 'link_records', () => linkRecords({ fromEnvelopeId: 'e1', toEnvelopeId: 'e2', kind: 'related' })],
  ['unlinkRecords', 'unlink_records', () => unlinkRecords('l1')],
  ['removeRecordAttachment', 'remove_record_attachment', () => removeRecordAttachment('a1', 'duplicate photo')],
  ['requestExport', 'request_export', () => requestExport({ kind: 'record_pdf', sourceKey: 'safety.incident' })],
  ['logClientExport', 'log_client_export', () => logClientExport({ kind: 'csv', sourceKey: 'crew.list', rowCount: 12 })],
  ['cancelExportJob', 'cancel_export_job', () => cancelExportJob('j1')],
];

describe.each(rowRpcs)('%s (row-returning RPC)', (_name, rpc, call) => {
  it('the row → ok', async () => {
    h.replies.set(rpc, { data: { id: 'row-1' }, error: null });
    await expect(call()).resolves.toEqual({ status: 'ok', value: { id: 'row-1' } });
  });

  it('a business rule (22023 with a stable code) → refused', async () => {
    h.replies.set(rpc, { data: null, error: RULE });
    await expect(call()).resolves.toMatchObject({ status: 'refused', code: 'record_closed' });
  });

  it('function not live → missing', async () => {
    h.replies.set(rpc, { data: null, error: MISSING_FN });
    await expect(call()).resolves.toEqual({ status: 'missing' });
  });

  it.each([
    ['403 (cross-tenant id)', FORBIDDEN],
    ['500', SERVER],
    ['P0002 (unknown id)', { code: 'P0002', message: 'record not found' }],
  ])('a %s is thrown', async (_code, error) => {
    h.replies.set(rpc, { data: null, error });
    await expect(call()).rejects.toBe(error);
  });
});

describe('RPC arguments: the client names the action, the server derives the rest', () => {
  it('record_transition gets the action and free-text inputs only (no status, no guards)', async () => {
    h.replies.set('record_transition', { data: { ok: true, value: {} }, error: null });
    await transitionRecord({ envelopeId: 'e1', action: 'close_as', payload: { closedAs: 'duplicate', duplicateOf: 'e0' }, expectedVersion: 4 });
    expect(h.rpcs[0]).toEqual({
      name: 'record_transition',
      args: { p_envelope_id: 'e1', p_action: 'close_as', p_payload: { closedAs: 'duplicate', duplicateOf: 'e0' }, p_expected_version: 4 },
    });
    const args = JSON.stringify(h.rpcs[0].args);
    for (const forbidden of ['status', 'openRequests', 'staleRequiredSignatures', 'allVesselSlotsSigned', 'actor']) expect(args).not.toContain(forbidden);
  });

  it('signing sends the client-generated id (idempotent retry) and the method', async () => {
    h.replies.set('record_sign_slot', { data: { ok: true, value: {} }, error: null });
    await signRecordSlot({ signatureId: 's1', slotId: 'sl1', method: 'witnessed', signerProfileId: 'p9', expectedVersion: 2 });
    expect(h.rpcs[0].args).toMatchObject({ p_signature_id: 's1', p_slot_id: 'sl1', p_method: 'witnessed', p_signer_profile_id: 'p9', p_expected_version: 2 });
  });

  it('a thread post and a request resolution', async () => {
    h.replies.set('record_post_thread_entry', { data: { ok: true, value: {} }, error: null });
    h.replies.set('record_resolve_thread_request', { data: { ok: true, value: {} }, error: null });
    await postThreadEntry({ entryId: 'n1', envelopeId: 'e1', threadKind: 'status_updates', entryType: 'request', body: 'Send the photos', requestDue: '2026-12-01' });
    await resolveThreadRequest('r1', 'change_date', { note: 'Yard delay', newDue: '2026-12-08' });
    expect(h.rpcs[0].args).toMatchObject({ p_entry_id: 'n1', p_entry_type: 'request', p_request_due: '2026-12-01' });
    expect(h.rpcs[1].args).toEqual({ p_request_id: 'r1', p_resolution: 'change_date', p_note: 'Yard delay', p_new_due: '2026-12-08' });
  });
});

describe('results and keys', () => {
  it('fromRpcResult tolerates a refusal without a message, and refuses non-envelopes', () => {
    expect(fromRpcResult({ ok: false, error: { code: 'not_open' } })).toEqual({ status: 'refused', code: 'not_open', message: 'The record engine refused the action.' });
    expect(() => fromRpcResult(null)).toThrow();
    expect(() => fromRpcResult([1])).toThrow();
  });

  it('refusedOrThrow: a 22023 without a stable code keeps the STORM sentence under invalid_input', () => {
    expect(refusedOrThrow({ code: '22023', message: 'The caption is too long.' })).toEqual({ status: 'refused', code: 'invalid_input', message: 'The caption is too long.' });
  });

  it('every key carries its ids and nests under the envelope, so one invalidation reaches them all', () => {
    const envelope = recordKeys.envelope('e1');
    for (const key of [recordKeys.events('e1'), recordKeys.slots('e1', 2), recordKeys.thread('e1', 'status_updates'), recordKeys.attachments('e1'), recordKeys.links('e1')]) {
      expect(key.slice(0, envelope.length)).toEqual([...envelope]);
    }
    expect(recordKeys.exportJob('j1')).toEqual(['records', 'export-job', 'j1']);
    expect(recordKeys.envelopes('c1', { vesselId: 'v1' })).toEqual(['records', 'envelopes', 'c1', { vesselId: 'v1' }]);
  });

  it('exports poll while requested or running, never after a terminal status', () => {
    expect(exportPollInterval('requested')).toBe(3000);
    expect(exportPollInterval('running')).toBe(3000);
    for (const s of ['ready', 'failed', 'cancelled', 'expired', 'purged'] as const) expect(exportPollInterval(s)).toBe(false);
    expect(exportPollInterval(null)).toBe(false);
  });
});
