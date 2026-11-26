/**
 * The crew forms of fleet document acknowledgements (gap/02 FD6, FD7,
 * FD8, W1; X5 spec X5-05B): React Hook Form + zod, checked before any
 * request with the definers' own limits (20261124040400).
 *
 * - `witnessSchema`: the document and the person, and the witness's
 *   confirmation that the person read the version on this device.
 * - `remindSchema`: who to remind (the person, the vessel's crew, or every
 *   vessel's).
 * - `signerRuleSchema`: who can sign on a vessel, for every document type
 *   or one: the default (no rule), everyone with a login, heads of
 *   department and above, chosen positions (1-100, each up to 80
 *   characters) or chosen people (1-500). `toSignerRuleArgs` builds the
 *   definer's arguments (a NULL rule removes the rule).
 *
 * No React and no requests.
 */
import { z } from 'zod';
import type { FleetDocumentSignerRuleKind } from '../types/db.pending';

// ─── Witnessed acknowledgement ──────────────────────────────────────────

export const WITNESS_DOCUMENT_REQUIRED = 'Choose the document';
export const WITNESS_PERSON_REQUIRED = 'Choose the person';
export const WITNESS_CONFIRM_REQUIRED = 'Confirm that you watched them read and acknowledge it';

export const witnessSchema = z.object({
  documentId: z.string().trim().min(1, WITNESS_DOCUMENT_REQUIRED),
  profileId: z.string().trim().min(1, WITNESS_PERSON_REQUIRED),
  confirmed: z.boolean().refine((v) => v, WITNESS_CONFIRM_REQUIRED),
});
export type WitnessFormValues = z.infer<typeof witnessSchema>;

// ─── Reminders ──────────────────────────────────────────────────────────

export const remindSchema = z.object({
  scope: z.enum(['person', 'vessel', 'all']),
});
export type RemindFormValues = z.infer<typeof remindSchema>;

// ─── Who can sign ───────────────────────────────────────────────────────

/** Every document type (the vessel's all-types rule). */
export const ALL_TYPES = 'all';
/** No rule: the default (everyone with a login). */
export const DEFAULT_RULE = 'default';

export const POSITIONS_MAX = 100;
export const POSITION_MAX = 80;
export const PEOPLE_MAX = 500;

export const POSITIONS_REQUIRED = 'Choose at least one position';
export const PEOPLE_REQUIRED = 'Choose at least one person';

const SIGNER_RULE_VALUES = [DEFAULT_RULE, 'all_crew_with_login', 'hod_and_above', 'positions', 'named_people'] as const;
export type SignerRuleChoice = (typeof SIGNER_RULE_VALUES)[number];

export const signerRuleSchema = z
  .object({
    /** ALL_TYPES or a document type id. */
    typeId: z.string().trim().min(1),
    rule: z.enum(SIGNER_RULE_VALUES),
    positions: z.array(z.string()),
    profileIds: z.array(z.string()),
  })
  .superRefine((values, ctx) => {
    const positions = cleanPositions(values.positions);
    if (values.rule === 'positions') {
      if (positions.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['positions'], message: POSITIONS_REQUIRED });
      else if (positions.length > POSITIONS_MAX) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['positions'], message: `Choose up to ${POSITIONS_MAX} positions` });
      else if (positions.some((p) => p.length > POSITION_MAX)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['positions'], message: `Position names can be up to ${POSITION_MAX} characters` });
      }
    }
    if (values.rule === 'named_people') {
      const people = cleanIds(values.profileIds);
      if (people.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileIds'], message: PEOPLE_REQUIRED });
      else if (people.length > PEOPLE_MAX) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['profileIds'], message: `Choose up to ${PEOPLE_MAX} people` });
    }
  });
export type SignerRuleFormValues = z.infer<typeof signerRuleSchema>;

/** Trimmed, blank-free, de-duplicated (case-insensitive, first spelling kept) position names. */
export function cleanPositions(values: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const p = v.trim();
    if (p && !seen.has(p.toLowerCase())) seen.set(p.toLowerCase(), p);
  }
  return [...seen.values()];
}

const cleanIds = (values: readonly string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

export interface SignerRuleArgs {
  p_vessel_id: string;
  p_type_id: string | null;
  p_rule: FleetDocumentSignerRuleKind | null;
  p_positions: string[] | null;
  p_profile_ids: string[] | null;
}

/** The definer's arguments: lists only for their own rule; the default removes the rule (NULL). */
export function toSignerRuleArgs(values: SignerRuleFormValues, vesselId: string): SignerRuleArgs {
  const rule = values.rule === DEFAULT_RULE ? null : values.rule;
  return {
    p_vessel_id: vesselId,
    p_type_id: values.typeId === ALL_TYPES ? null : values.typeId,
    p_rule: rule,
    p_positions: rule === 'positions' ? cleanPositions(values.positions) : null,
    p_profile_ids: rule === 'named_people' ? cleanIds(values.profileIds) : null,
  };
}
