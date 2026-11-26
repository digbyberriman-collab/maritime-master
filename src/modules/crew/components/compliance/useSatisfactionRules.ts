/**
 * The satisfaction rules the reader may see (gap/04 C34; the equivalence
 * drawer): STORM's (company_id null) and their company's, read from
 * crew_document_type_satisfies with explicit columns (RLS: active users see
 * STORM's rows, members their company's). Kept under the catalogue's key, so
 * a confirmed rule change (refreshCompanyCompliance) refreshes it too.
 *
 * D-01: while 20261124060400 is not applied the table is missing:
 * 'not_set_up'. Any other error is an error with Retry. Nothing is mocked.
 */
import { useQuery } from '@tanstack/react-query';
import { isMissingTable, pendingClient, type NoPending } from '@/integrations/supabase/pending';
import { crewDocumentKeys } from '@/modules/crew/hooks/useDocumentTypes';
import type { CrewDocumentSatisfactionKind, CrewPendingFunctions, CrewPendingTables } from '@/modules/crew/types/db.pending';
import type { RuleLike } from '@/modules/crew/lib/complianceModel';

const crewDb = pendingClient<CrewPendingTables, NoPending, CrewPendingFunctions>();

export const RULE_COLUMNS = 'id, company_id, type_id, satisfies_type_id, kind';

export const satisfactionRuleKey = (companyId: string | null | undefined) => [...crewDocumentKeys.catalogue(companyId), 'rules'] as const;

export class SatisfactionRulesMissing extends Error {
  constructor() {
    super('crew_document_type_satisfies not applied');
    this.name = 'SatisfactionRulesMissing';
  }
}

const KINDS: readonly CrewDocumentSatisfactionKind[] = ['supersedes', 'component', 'equivalent'];

export async function fetchSatisfactionRules(): Promise<RuleLike[]> {
  const { data, error } = await crewDb.from('crew_document_type_satisfies').select(RULE_COLUMNS);
  if (error) {
    if (isMissingTable(error)) throw new SatisfactionRulesMissing();
    throw error;
  }
  return (data ?? [])
    .filter((r) => KINDS.includes(r.kind))
    .map((r) => ({ id: r.id, companyId: r.company_id, typeId: r.type_id, satisfiesTypeId: r.satisfies_type_id, kind: r.kind }));
}

export type SatisfactionRulesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'not_set_up' }
  | { status: 'error'; error: unknown; retry: () => void }
  | { status: 'ready'; rules: RuleLike[] };

export function useSatisfactionRules(companyId: string | null | undefined, options: { enabled?: boolean } = {}): SatisfactionRulesState {
  const enabled = (options.enabled ?? true) && Boolean(companyId);
  const query = useQuery({
    queryKey: satisfactionRuleKey(companyId),
    queryFn: fetchSatisfactionRules,
    enabled,
    staleTime: 5 * 60_000,
    retry: (failureCount, error) => !(error instanceof SatisfactionRulesMissing) && failureCount < 1,
  });
  if (!enabled) return { status: 'idle' };
  if (query.error instanceof SatisfactionRulesMissing) return { status: 'not_set_up' };
  if (query.error) return { status: 'error', error: query.error, retry: () => void query.refetch() };
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', rules: query.data };
}
