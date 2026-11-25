/**
 * Honest outcomes for the client's vessel writes (DECISIONS D-124, D-224;
 * non-negotiable 9).
 *
 * Since the P3 vessel policies (file 8), adding, changing and removing a
 * vessel needs `fleet.operations.vessels.admin`. Row level security answers
 * a refused write in three ways, and none of them may read as success or as
 * raw database text:
 *
 * - an UPDATE the policy filters out matches 0 rows and returns no error,
 *   so a write that asks for its rows back (`.select('id')`) gets `[]`;
 * - the same UPDATE with `.select().single()` fails with PGRST116
 *   ("Cannot coerce the result to a single JSON object");
 * - an INSERT the WITH CHECK refuses fails with 42501 ("new row violates
 *   row-level security policy for table \"vessels\"").
 *
 * Each becomes a `VesselWriteRefusedError` with one sentence that says who
 * may do it. Any other failure is normalised (`normaliseError`), never shown
 * raw.
 */
import { normaliseError } from '@/shared/lib/notify';

export type VesselWriteKind = 'remove' | 'change' | 'create';

export const VESSEL_WRITE_REFUSED_MESSAGES: Readonly<Record<VesselWriteKind, string>> = {
  remove: "You can't remove this vessel. Only a vessel administrator can do this.",
  change: "You can't change this vessel. Only a vessel administrator can do this.",
  create: "You can't add a vessel. Only a vessel administrator can do this.",
};

/** A vessel write that row level security refused, or that matched no row. */
export class VesselWriteRefusedError extends Error {
  readonly kind: VesselWriteKind;

  constructor(kind: VesselWriteKind) {
    super(VESSEL_WRITE_REFUSED_MESSAGES[kind]);
    this.name = 'VesselWriteRefusedError';
    this.kind = kind;
  }
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/**
 * True when the error means the write was refused for this caller: 42501
 * (row level security or a missing grant), PGRST116 (`.single()` found no
 * row: the policy hid it), or a message naming row-level security.
 */
export function isVesselRefusal(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (typeof error === 'string') return /row-level security/i.test(error);
  if (typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = text(e.code);
  if (code === '42501' || code === 'PGRST116') return true;
  const message = text(e.message);
  return message !== undefined && /row-level security/i.test(message);
}

/**
 * The error a vessel write throws: a refusal for `kind`, or the normalised
 * sentence for anything else. The thrown message is what the toast shows.
 */
export function vesselWriteError(error: unknown, kind: VesselWriteKind): Error {
  if (error instanceof VesselWriteRefusedError) return error;
  if (isVesselRefusal(error)) return new VesselWriteRefusedError(kind);
  return new Error(normaliseError(error).message);
}
