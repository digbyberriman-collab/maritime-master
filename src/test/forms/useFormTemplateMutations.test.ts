/**
 * Template mutations (src/modules/forms/hooks/useFormTemplateMutations.ts;
 * gap/02 W2; D-X5-13, D-X5-20):
 *
 * - every wrapper calls its definer with the server's argument names,
 *   checks its input first where the server has a limit (no request), and
 *   checks the returned row: another id, company, status or value is not a
 *   save (no fake success);
 * - a definer refusal becomes its sentence; a missing definer is
 *   `not_set_up`; anything else is passed on;
 * - D-X5-20: only publish and archive fall back to today's write, and only
 *   when the definer is missing; the fallback checks the draft and the
 *   publish blockers first and the affected row after; any other error
 *   never falls back;
 * - the hook toasts the outcome and invalidates the template queries.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

type Answer = { data: unknown; error: { code?: string; message: string } | null };
type Op = { method: string; args: unknown[] };

const state = vi.hoisted(() => ({
  rpcAnswers: {} as Record<string, Answer>,
  rpc: null as unknown as ReturnType<typeof vi.fn>,
  /** Answers of the plain table reads and writes, in call order. */
  tableAnswers: [] as Answer[],
  /** Every chain built on `from(...)`. */
  chains: [] as { table: string; ops: Op[] }[],
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  state.rpc = vi.fn((fn: string) => Promise.resolve(state.rpcAnswers[fn] ?? { data: null, error: { code: 'XX000', message: `no answer for ${fn}` } }));
  const from = (table: string) => {
    const chain = { table, ops: [] as Op[] };
    state.chains.push(chain);
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'update', 'insert', 'delete', 'eq', 'neq', 'in', 'order']) {
      builder[method] = (...args: unknown[]) => {
        chain.ops.push({ method, args });
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(state.tableAnswers.shift() ?? { data: null, error: { message: 'no table answer' } });
    return builder;
  };
  return { supabase: { rpc: state.rpc, from } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { company_id: 'co-1' }, user: { id: 'user-1' } }),
}));
vi.mock('@/shared/lib/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/notify')>();
  return { ...actual, notify: { ...actual.notify, error: state.toastError, success: state.toastSuccess } };
});

import {
  FormTemplateRefusalError,
  NOT_SAVED_MESSAGE,
  NOT_SET_UP_MESSAGE,
  archiveTemplate,
  archiveTemplateWithFallback,
  customiseTemplate,
  deleteDraftTemplate,
  moveTemplateArea,
  newTemplateVersion,
  publishTemplate,
  publishTemplateWithFallback,
  reorderTemplates,
  setTemplateVisibility,
  toFormTemplateError,
  useFormTemplateMutations,
} from '@/modules/forms/hooks/useFormTemplateMutations';
import { formTemplateRefusal } from '@/modules/forms/lib/templateMachine';
import type { FormTemplateArea } from '@/modules/forms/types/db.pending';

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.form_template_publish(p_template_id) in the schema cache' };
const MISSING_ARCHIVE = { code: 'PGRST202', message: 'Could not find the function public.form_template_archive(p_template_id) in the schema cache' };
const refusal = (message: string, code = '22023') => ({ data: null, error: { code, message } });
const row = (over: Record<string, unknown> = {}) => ({
  id: 't-1', company_id: 'co-1', status: 'PUBLISHED', version: 1, version_label: null, template_code: 'DECK', template_name: 'Deck rounds',
  supersedes_template_id: null, source_template_id: null, origin: 'company', area: 'safety', ...over,
});
const draft = (over: Record<string, unknown> = {}) => ({
  id: 't-1', company_id: 'co-1', status: 'DRAFT', template_name: 'Deck rounds', vessel_scope: 'FLEET', vessel_ids: null,
  form_schema: { fields: [{ type: 'checkbox', label: 'Lifejackets stowed' }] }, published_at: null, archived_at: null, ...over,
});

const expectRefusal = async (promise: Promise<unknown>, code: string, sentence = formTemplateRefusal(code)) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(FormTemplateRefusalError);
  expect((error as FormTemplateRefusalError).code).toBe(code);
  expect((error as Error).message).toBe(sentence);
};

afterEach(() => {
  state.rpcAnswers = {};
  state.tableAnswers = [];
  state.chains = [];
  state.rpc.mockClear();
  state.toastError.mockClear();
  state.toastSuccess.mockClear();
});

describe('errors', () => {
  it('maps a missing definer to not set up, a refusal to its sentence, anything else as it is', () => {
    const missing = toFormTemplateError(MISSING);
    expect(missing).toBeInstanceOf(FormTemplateRefusalError);
    expect((missing as Error).message).toBe(NOT_SET_UP_MESSAGE);
    expect((toFormTemplateError({ code: '22023', message: 'empty_section' }) as Error).message).toBe(formTemplateRefusal('empty_section'));
    expect((toFormTemplateError({ code: '42501', message: 'form_templates_guarded' }) as FormTemplateRefusalError).code).toBe('form_templates_guarded');
    const other = { code: '08006', message: 'connection lost' };
    expect(toFormTemplateError(other)).toBe(other);
    expect((toFormTemplateError(null) as Error).message).toBe(NOT_SAVED_MESSAGE);
  });
});

describe('publish', () => {
  it('sends the template, the trimmed label and the expected updated_at, and checks the row', async () => {
    state.rpcAnswers.form_template_publish = { data: row({ version_label: 'SMS-CL-001 Rev 4' }), error: null };
    const out = await publishTemplate('co-1', { templateId: 't-1', versionLabel: '  SMS-CL-001 Rev 4 ', expectedUpdatedAt: '2026-11-20T10:00:00Z' });
    expect(out.id).toBe('t-1');
    expect(state.rpc).toHaveBeenCalledWith('form_template_publish', {
      p_template_id: 't-1', p_version_label: 'SMS-CL-001 Rev 4', p_expected_updated_at: '2026-11-20T10:00:00Z',
    });
  });

  it('sends no label for a blank one', async () => {
    state.rpcAnswers.form_template_publish = { data: [row()], error: null };
    await publishTemplate('co-1', { templateId: 't-1', versionLabel: '   ' });
    expect(state.rpc).toHaveBeenCalledWith('form_template_publish', { p_template_id: 't-1', p_version_label: null, p_expected_updated_at: null });
  });

  it('refuses a 41-character label before any request', async () => {
    await expectRefusal(publishTemplate('co-1', { templateId: 't-1', versionLabel: 'x'.repeat(41) }), 'version_label_too_long');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['another template', row({ id: 't-2' })],
    ['another company', row({ company_id: 'co-2' })],
    ['still a draft', row({ status: 'DRAFT' })],
    ['another label', row({ version_label: 'Rev 9' })],
    ['no row', null],
  ])('is not a save when the server answers %s', async (_label, data) => {
    state.rpcAnswers.form_template_publish = { data, error: null };
    await expectRefusal(publishTemplate('co-1', { templateId: 't-1' }), 'not_saved', NOT_SAVED_MESSAGE);
  });

  it('words a refusal', async () => {
    state.rpcAnswers.form_template_publish = refusal('empty_section');
    await expectRefusal(publishTemplate('co-1', { templateId: 't-1' }), 'empty_section');
  });
});

describe('the other definers', () => {
  it('starts a new version: a new draft superseding the source', async () => {
    state.rpcAnswers.form_template_new_version = { data: row({ id: 't-2', status: 'DRAFT', version: 2, supersedes_template_id: 't-1' }), error: null };
    expect((await newTemplateVersion('co-1', 't-1')).id).toBe('t-2');
    expect(state.rpc).toHaveBeenCalledWith('form_template_new_version', { p_template_id: 't-1' });
    state.rpcAnswers.form_template_new_version = { data: row({ id: 't-2', status: 'DRAFT', supersedes_template_id: null }), error: null };
    await expectRefusal(newTemplateVersion('co-1', 't-1'), 'not_saved', NOT_SAVED_MESSAGE);
    state.rpcAnswers.form_template_new_version = refusal('draft_exists');
    await expectRefusal(newTemplateVersion('co-1', 't-1'), 'draft_exists');
  });

  it('customises: a company draft linked to the source', async () => {
    state.rpcAnswers.form_template_customise = { data: row({ id: 't-9', status: 'DRAFT', source_template_id: 't-1', template_code: 'DECK_CUSTOM1' }), error: null };
    expect((await customiseTemplate('co-1', 't-1')).template_code).toBe('DECK_CUSTOM1');
    expect(state.rpc).toHaveBeenCalledWith('form_template_customise', { p_source_template_id: 't-1' });
    state.rpcAnswers.form_template_customise = { data: row({ id: 't-9', status: 'DRAFT', source_template_id: 't-1', origin: 'platform' }), error: null };
    await expectRefusal(customiseTemplate('co-1', 't-1'), 'not_saved', NOT_SAVED_MESSAGE);
  });

  it('archives with an optional reason, refusing a 501-character one before any request', async () => {
    state.rpcAnswers.form_template_archive = { data: row({ status: 'ARCHIVED' }), error: null };
    await archiveTemplate('co-1', { templateId: 't-1', reason: '  Replaced  ' });
    expect(state.rpc).toHaveBeenCalledWith('form_template_archive', { p_template_id: 't-1', p_reason: 'Replaced' });
    state.rpc.mockClear();
    await expectRefusal(archiveTemplate('co-1', { templateId: 't-1', reason: 'r'.repeat(501) }), 'reason_too_long');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('deletes a draft and checks the deleted row', async () => {
    state.rpcAnswers.form_template_delete_draft = { data: row({ status: 'DRAFT' }), error: null };
    expect((await deleteDraftTemplate('co-1', 't-1')).id).toBe('t-1');
    state.rpcAnswers.form_template_delete_draft = refusal('template_has_runs');
    await expectRefusal(deleteDraftTemplate('co-1', 't-1'), 'template_has_runs');
  });

  it('moves an area, refusing an unknown one before any request', async () => {
    state.rpcAnswers.form_template_move_area = { data: row({ area: 'movement' }), error: null };
    await moveTemplateArea('co-1', { templateId: 't-1', area: 'movement' });
    expect(state.rpc).toHaveBeenCalledWith('form_template_move_area', { p_template_id: 't-1', p_area: 'movement' });
    state.rpc.mockClear();
    await expectRefusal(moveTemplateArea('co-1', { templateId: 't-1', area: 'galley' as FormTemplateArea }), 'invalid_area');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('hides with a reason and shows without one', async () => {
    const setting = (over: Record<string, unknown>) => ({ template_id: 't-1', vessel_id: 'v-1', company_id: 'co-1', visibility: 'hidden', reason: 'Not on board', ...over });
    state.rpcAnswers.form_template_set_visibility = { data: setting({}), error: null };
    await setTemplateVisibility('co-1', { templateId: 't-1', vesselId: 'v-1', visibility: 'hidden', reason: ' Not on board ' });
    expect(state.rpc).toHaveBeenCalledWith('form_template_set_visibility', { p_template_id: 't-1', p_vessel_id: 'v-1', p_visibility: 'hidden', p_reason: 'Not on board' });
    state.rpcAnswers.form_template_set_visibility = { data: setting({ visibility: 'shown', reason: null }), error: null };
    await setTemplateVisibility('co-1', { templateId: 't-1', vesselId: 'v-1', visibility: 'shown', reason: 'ignored' });
    expect(state.rpc).toHaveBeenLastCalledWith('form_template_set_visibility', { p_template_id: 't-1', p_vessel_id: 'v-1', p_visibility: 'shown', p_reason: null });
    await expectRefusal(setTemplateVisibility('co-1', { templateId: 't-1', vesselId: 'v-1', visibility: 'hidden', reason: 'w'.repeat(301) }), 'reason_too_long');
    state.rpcAnswers.form_template_set_visibility = { data: setting({ vessel_id: 'v-2' }), error: null };
    await expectRefusal(setTemplateVisibility('co-1', { templateId: 't-1', vesselId: 'v-1', visibility: 'hidden', reason: 'Not on board' }), 'not_saved', NOT_SAVED_MESSAGE);
    state.rpcAnswers.form_template_set_visibility = refusal('vessel_out_of_reach', '42501');
    await expectRefusal(setTemplateVisibility('co-1', { templateId: 't-1', vesselId: 'v-1', visibility: 'shown' }), 'vessel_out_of_reach');
  });

  it('reorders, refusing duplicates before any request and checking the order that comes back', async () => {
    const settings = (ids: string[]) => ids.map((id, i) => ({ template_id: id, vessel_id: 'v-1', company_id: 'co-1', sort_order: i + 1 }));
    state.rpcAnswers.form_template_reorder = { data: settings(['b', 'a']), error: null };
    await reorderTemplates('co-1', { vesselId: 'v-1', area: 'safety', templateIds: ['b', 'a'] });
    expect(state.rpc).toHaveBeenCalledWith('form_template_reorder', { p_vessel_id: 'v-1', p_area: 'safety', p_template_ids: ['b', 'a'] });
    state.rpc.mockClear();
    await expectRefusal(reorderTemplates('co-1', { vesselId: 'v-1', area: 'safety', templateIds: ['a', 'a'] }), 'reorder_mismatch');
    await expectRefusal(reorderTemplates('co-1', { vesselId: 'v-1', area: null, templateIds: [] }), 'reorder_mismatch');
    expect(state.rpc).not.toHaveBeenCalled();
    state.rpcAnswers.form_template_reorder = { data: settings(['a', 'b']), error: null };
    await expectRefusal(reorderTemplates('co-1', { vesselId: 'v-1', area: 'safety', templateIds: ['b', 'a'] }), 'not_saved', NOT_SAVED_MESSAGE);
  });
});

describe('D-X5-20: the fallback while the definers are missing', () => {
  it('publishes through the definer when it exists, with no table write', async () => {
    state.rpcAnswers.form_template_publish = { data: row(), error: null };
    expect(await publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' })).toEqual({ id: 't-1', via: 'definer' });
    expect(state.chains).toHaveLength(0);
  });

  it('keeps today\'s publish write only when the definer is missing, checked before and after', async () => {
    state.rpcAnswers.form_template_publish = { data: null, error: MISSING };
    state.tableAnswers = [{ data: draft(), error: null }, { data: draft({ status: 'PUBLISHED' }), error: null }];
    expect(await publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' })).toEqual({ id: 't-1', via: 'legacy' });
    expect(state.chains).toHaveLength(2);
    const write = state.chains[1];
    expect(write.table).toBe('form_templates');
    const update = write.ops.find((o) => o.method === 'update')?.args[0] as Record<string, unknown>;
    expect(update.status).toBe('PUBLISHED');
    expect(update.published_by).toBe('user-1');
    expect(typeof update.published_at).toBe('string');
    expect(write.ops.filter((o) => o.method === 'eq').map((o) => o.args)).toEqual([['id', 't-1'], ['company_id', 'co-1'], ['status', 'DRAFT']]);
  });

  it('refuses in the fallback what the server would: a blocker, a published template, an unknown one', async () => {
    state.rpcAnswers.form_template_publish = { data: null, error: MISSING };
    state.tableAnswers = [{ data: draft({ form_schema: { fields: [{ type: 'section', label: 'Deck' }] } }), error: null }];
    await expectRefusal(publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' }), 'no_section');
    state.tableAnswers = [{ data: draft({ status: 'PUBLISHED' }), error: null }];
    await expectRefusal(publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' }), 'already_published');
    state.tableAnswers = [{ data: null, error: null }];
    await expectRefusal(publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' }), 'template_not_found');
    expect(state.chains.every((c) => !c.ops.some((o) => o.method === 'update'))).toBe(true);
  });

  it('is not a save when the fallback write changed no row (RLS)', async () => {
    state.rpcAnswers.form_template_publish = { data: null, error: MISSING };
    state.tableAnswers = [{ data: draft(), error: null }, { data: null, error: null }];
    await expectRefusal(publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' }), 'not_saved', NOT_SAVED_MESSAGE);
  });

  it('never falls back on any other error', async () => {
    state.rpcAnswers.form_template_publish = refusal('not_permitted', '42501');
    await expectRefusal(publishTemplateWithFallback('co-1', 'user-1', { templateId: 't-1' }), 'not_permitted');
    state.rpcAnswers.form_template_archive = { data: null, error: { code: '08006', message: 'connection lost' } };
    await expect(archiveTemplateWithFallback('co-1', { templateId: 't-1' })).rejects.toEqual({ code: '08006', message: 'connection lost' });
    expect(state.chains).toHaveLength(0);
  });

  it('archives with today\'s write only when the definer is missing', async () => {
    state.rpcAnswers.form_template_archive = { data: null, error: MISSING_ARCHIVE };
    state.tableAnswers = [{ data: draft({ status: 'PUBLISHED' }), error: null }, { data: draft({ status: 'ARCHIVED' }), error: null }];
    expect(await archiveTemplateWithFallback('co-1', { templateId: 't-1' })).toEqual({ id: 't-1', via: 'legacy' });
    const update = state.chains[1].ops.find((o) => o.method === 'update')?.args[0] as Record<string, unknown>;
    expect(update.status).toBe('ARCHIVED');
    expect(typeof update.archived_at).toBe('string');
    state.chains = [];
    state.tableAnswers = [{ data: draft({ status: 'ARCHIVED' }), error: null }];
    await expectRefusal(archiveTemplateWithFallback('co-1', { templateId: 't-1' }), 'already_archived');
  });

  it('does not fall back for delete, new version or customise', async () => {
    for (const fn of ['form_template_delete_draft', 'form_template_new_version', 'form_template_customise']) {
      state.rpcAnswers[fn] = { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}(p_template_id) in the schema cache` } };
    }
    await expectRefusal(deleteDraftTemplate('co-1', 't-1'), 'not_set_up', NOT_SET_UP_MESSAGE);
    await expectRefusal(newTemplateVersion('co-1', 't-1'), 'not_set_up', NOT_SET_UP_MESSAGE);
    await expectRefusal(customiseTemplate('co-1', 't-1'), 'not_set_up', NOT_SET_UP_MESSAGE);
    expect(state.chains).toHaveLength(0);
  });
});

describe('the hook', () => {
  const wrap = () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const spy = vi.spyOn(client, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
    return { wrapper, spy };
  };

  it('toasts a real success and invalidates the template queries', async () => {
    state.rpcAnswers.form_template_publish = { data: row(), error: null };
    const { wrapper, spy } = wrap();
    const { result } = renderHook(() => useFormTemplateMutations(), { wrapper });
    await act(async () => {
      await result.current.publish.mutateAsync({ templateId: 't-1' });
    });
    expect(state.toastSuccess).toHaveBeenCalledWith('Template published');
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    expect(keys).toEqual(expect.arrayContaining([['forms', 'co-1'], ['form-templates'], ['form-template']]));
  });

  it('toasts the refusal and never a success, and still invalidates', async () => {
    state.rpcAnswers.form_template_delete_draft = refusal('template_published');
    const { wrapper, spy } = wrap();
    const { result } = renderHook(() => useFormTemplateMutations(), { wrapper });
    await act(async () => {
      await result.current.deleteDraft.mutateAsync('t-1').catch(() => undefined);
    });
    expect(state.toastSuccess).not.toHaveBeenCalled();
    expect(state.toastError).toHaveBeenCalledTimes(1);
    const [error, options] = state.toastError.mock.calls[0];
    expect((error as Error).message).toBe(formTemplateRefusal('template_published'));
    expect(options).toEqual({ title: 'Draft not deleted' });
    expect(spy).toHaveBeenCalled();
  });
});
