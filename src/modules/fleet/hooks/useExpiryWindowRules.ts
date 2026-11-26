/**
 * The company's expiry warning windows (gap/02 X2; DECISIONS C5; D-X5-02):
 * the `expiry_window_rules` rows and the two definers that change them.
 *
 * Read: the rows of the caller's company (RLS: active members only). While
 * the table is missing (D-01) the answer is `not_set_up` with the default
 * windows (passports 270 days, everything else 90), shown read-only; any
 * other error is `error` with a retry.
 *
 * Write: only through `set_expiry_window_rule` / `clear_expiry_window_rule`
 * (no browser write grant; the server gates on
 * `fleet.operations.fleet_reports.admin` with fleet reach). The input is
 * checked first with the same rules as the server; the stored row the
 * definer returns is checked against what was asked (no fake success);
 * refusals (22023, 42501, P0002) become sentences through `notify()`; a
 * change invalidates every expiry query of the company, because a window
 * moves items between buckets.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ExpiryWindowRule } from '@/lib/records/expiry';
import { isMissingRelationError as isMissingRelation, notify } from '@/shared/lib/notify';
import { fleetDb } from '../lib/fleetDb';
import {
  EXPIRY_ITEM_TYPE_LABELS,
  expiryWindowFor,
  expiryWindowRefusal,
  isExpiryItemType,
  isValidWarnDays,
  toExpiryWindowRules,
  type ExpiryItemType,
} from '../lib/expiryWindows';
import type { ExpiryWindowRuleRow } from '../types/db.pending';
import { fleetKeys } from './keys';

/** The columns this module reads (never `select('*')`). */
const RULE_COLUMNS = 'id, company_id, item_type, certificate_type_id, warn_days, updated_at' as const;

export type ExpiryWindowRuleView = Pick<ExpiryWindowRuleRow, 'id' | 'company_id' | 'item_type' | 'certificate_type_id' | 'warn_days' | 'updated_at'>;

/** The window an item gets under the rules read (or the defaults). */
export type WindowFor = (item: { itemType: string | null | undefined; certificateTypeId?: string | null }) => number;

export type ExpiryWindowRulesState =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'not_set_up'; windowFor: WindowFor }
  | { state: 'error'; error: unknown; retry: () => void }
  | { state: 'ready'; rows: ExpiryWindowRuleView[]; rules: ExpiryWindowRule[]; windowFor: WindowFor; refreshing: boolean };

const NOT_SET_UP = { kind: 'not_set_up' } as const;
type Answer = typeof NOT_SET_UP | { kind: 'ok'; rows: ExpiryWindowRuleView[] };

const DEFAULT_WINDOWS: WindowFor = (item) => expiryWindowFor([], item);

export async function fetchExpiryWindowRules(companyId: string): Promise<Answer> {
  const { data, error } = await fleetDb
    .from('expiry_window_rules')
    .select(RULE_COLUMNS)
    .eq('company_id', companyId)
    .order('item_type', { ascending: true })
    .order('certificate_type_id', { ascending: true, nullsFirst: true });
  if (error) {
    if (isMissingRelation(error)) return NOT_SET_UP;
    throw error;
  }
  return { kind: 'ok', rows: data ?? [] };
}

/** The company's window rules. `companyId` null or `enabled: false` sends no request (`idle`). */
export function useExpiryWindowRules(companyId: string | null | undefined, options: { enabled?: boolean } = {}): ExpiryWindowRulesState {
  const active = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: fleetKeys.expiry.windows(companyId),
    queryFn: () => fetchExpiryWindowRules(companyId as string),
    enabled: active,
    retry: (failureCount, error) => (error as { code?: unknown } | null)?.code !== '42501' && failureCount < 1,
    staleTime: 5 * 60_000,
  });
  if (!active) return { state: 'idle' };
  if (query.data?.kind === 'not_set_up') return { state: 'not_set_up', windowFor: DEFAULT_WINDOWS };
  if (query.error) return { state: 'error', error: query.error, retry: () => void query.refetch() };
  if (query.data?.kind === 'ok') {
    const rows = query.data.rows;
    const rules = toExpiryWindowRules(rows);
    return { state: 'ready', rows, rules, windowFor: (item) => expiryWindowFor(rules, item), refreshing: query.isFetching };
  }
  return { state: 'loading' };
}

// ─── Writes ──────────────────────────────────────────────────────────────

/** A refused or failed window change, worded for the reader. */
export class ExpiryWindowRuleError extends Error {
  /** The definer's snake_case message, or a client reason. */
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = 'ExpiryWindowRuleError';
    this.reason = reason;
  }
}

const NOT_SET_UP_MESSAGE = 'Expiry windows cannot be changed yet: this part of STORM is not set up.';
const NOT_SAVED_MESSAGE = 'The window was not saved. Refresh to see the current windows, then try again.';

/** The sentence for a refusal reason (the definers' messages, checked first on the client too). */
const sentenceFor = (reason: string): string => expiryWindowRefusal(reason) ?? NOT_SAVED_MESSAGE;

/** Maps a definer error to a sentence; an error with no known reason is returned as it is. */
function refusal(error: { code: string; message: string }): unknown {
  if (isMissingRelation(error)) return new ExpiryWindowRuleError('not_set_up', NOT_SET_UP_MESSAGE);
  const message = error.message ?? '';
  const sentence = message === 'rule_not_saved' ? NOT_SAVED_MESSAGE : expiryWindowRefusal(message);
  return sentence ? new ExpiryWindowRuleError(message, sentence) : error;
}

export interface SetExpiryWindowRuleInput {
  itemType: ExpiryItemType;
  /** A type of the item type's catalogue; null = the item type's own rule. */
  certificateTypeId?: string | null;
  warnDays: number;
}

/**
 * The stored row is what was asked: same company, item type, type id and
 * days. Anything else (no row, another row) is not a save.
 */
function checkStoredRule(data: unknown, companyId: string, input: SetExpiryWindowRuleInput): ExpiryWindowRuleRow {
  const row = (Array.isArray(data) ? data[0] : data) as Partial<ExpiryWindowRuleRow> | null | undefined;
  const ok =
    !!row &&
    typeof row.id === 'string' &&
    row.company_id === companyId &&
    row.item_type === input.itemType &&
    (row.certificate_type_id ?? null) === (input.certificateTypeId ?? null) &&
    row.warn_days === input.warnDays;
  if (!ok) throw new ExpiryWindowRuleError('rule_not_saved', NOT_SAVED_MESSAGE);
  return row as ExpiryWindowRuleRow;
}

export async function setExpiryWindowRule(companyId: string, input: SetExpiryWindowRuleInput): Promise<ExpiryWindowRuleRow> {
  if (!isExpiryItemType(input.itemType)) {
    throw new ExpiryWindowRuleError('invalid_item_type', sentenceFor('invalid_item_type'));
  }
  if (!isValidWarnDays(input.warnDays)) {
    throw new ExpiryWindowRuleError('invalid_warn_days', sentenceFor('invalid_warn_days'));
  }
  const { data, error } = await fleetDb.rpc('set_expiry_window_rule', {
    p_item_type: input.itemType,
    p_certificate_type_id: input.certificateTypeId ?? null,
    p_warn_days: input.warnDays,
  });
  if (error) throw refusal(error);
  return checkStoredRule(data, companyId, input);
}

export async function clearExpiryWindowRule(ruleId: string): Promise<void> {
  if (!ruleId) throw new ExpiryWindowRuleError('rule_required', sentenceFor('rule_required'));
  // The definer deletes by id within the caller's company and raises P0002
  // rule_not_found when nothing was deleted, so no error means one row went.
  const { error } = await fleetDb.rpc('clear_expiry_window_rule', { p_rule_id: ruleId });
  if (error) throw refusal(error);
}

const dayCount = (days: number) => `${days} ${days === 1 ? 'day' : 'days'}`;

/** Sets a window (`set_expiry_window_rule`). Toasts the outcome; invalidates the company's expiry queries. */
export function useSetExpiryWindowRule(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetExpiryWindowRuleInput) => {
      if (!companyId) return Promise.reject(new ExpiryWindowRuleError('no_company', 'Your account is not linked to a company.'));
      return setExpiryWindowRule(companyId, input);
    },
    onSuccess: (row) => {
      const label = isExpiryItemType(row.item_type) ? EXPIRY_ITEM_TYPE_LABELS[row.item_type] : 'Items';
      notify.success(`${label}: warning window set to ${dayCount(row.warn_days)}`);
    },
    onError: (error) => notify.error(error, { title: 'Could not save the expiry window' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetKeys.expiry.all(companyId) }),
  });
}

/** Removes a window rule (`clear_expiry_window_rule`); the items fall back to the item type's rule or the default. */
export function useClearExpiryWindowRule(companyId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => clearExpiryWindowRule(ruleId),
    onSuccess: () => notify.success('Warning window reset to the default'),
    onError: (error) => notify.error(error, { title: 'Could not reset the expiry window' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: fleetKeys.expiry.all(companyId) }),
  });
}
