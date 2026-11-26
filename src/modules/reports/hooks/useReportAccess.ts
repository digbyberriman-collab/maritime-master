/**
 * Which reports the reader may open (D-04): one adaptor decision per
 * report's capability, from one access snapshot, so the hub and the "Switch
 * report" picker filter a list without a hook per entry. Fails closed:
 * while the access state loads nothing is offered (`loading`), and a key the
 * adaptor does not know is denied.
 */
import { useMemo } from 'react';
import { resolveCapability } from '@/lib/permissions/adaptor';
import { useAccessSnapshot } from '@/lib/permissions/useCan';
import type { ReportDefinition } from '../registry';

export interface ReportAccess {
  /** `loading` until every decision is known; nothing is offered meanwhile. */
  status: 'loading' | 'ready';
  /** The reports the reader may open, in the given order (empty while loading). */
  allowed: ReportDefinition[];
  can: (definition: ReportDefinition) => boolean;
}

export function useReportAccess(definitions: readonly ReportDefinition[]): ReportAccess {
  const snapshot = useAccessSnapshot();
  return useMemo(() => {
    const decisions = new Map(definitions.map((d) => [d.key, resolveCapability(d.capability, snapshot)]));
    const loading = [...decisions.values()].some((d) => d.status === 'loading');
    const can = (definition: ReportDefinition) => !loading && decisions.get(definition.key)?.allowed === true;
    return { status: loading ? 'loading' : 'ready', allowed: loading ? [] : definitions.filter(can), can };
  }, [definitions, snapshot]);
}
