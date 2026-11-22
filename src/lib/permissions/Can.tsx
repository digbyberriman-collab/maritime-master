import React from 'react';
import { useCapability } from './useCan';
import type { CanContext, CapabilityKey } from './types';

export interface CanProps {
  /** PMS capability key, e.g. `vessel.safety.permit_to_work.approve`. */
  capability: CapabilityKey;
  /** Optional scope; see `CanContext`. */
  context?: CanContext;
  children: React.ReactNode;
  /** Rendered when the capability is denied or unknown. Defaults to nothing. */
  fallback?: React.ReactNode;
  /** Rendered while access is loading. Defaults to `fallback` (fail closed). */
  loading?: React.ReactNode;
}

/**
 * Renders `children` only when the caller holds `capability`.
 *
 * ```tsx
 * <Can capability="vessel.safety.permit_to_work.approve">
 *   <Button onClick={approve}>Approve</Button>
 * </Can>
 * ```
 *
 * Hiding a control is a convenience, never the control: RLS and the
 * server-side transition functions decide what actually happens.
 */
export function Can({ capability, context, children, fallback = null, loading }: CanProps) {
  const decision = useCapability(capability, context);
  if (decision.status === 'loading') return <>{loading ?? fallback}</>;
  return <>{decision.allowed ? children : fallback}</>;
}

export default Can;
