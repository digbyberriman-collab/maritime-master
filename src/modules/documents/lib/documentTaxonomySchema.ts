/**
 * The settings drawer's forms (gap/02 FD10; X5 spec X5-04A): a section
 * name, and a document type with its acknowledgement and version
 * defaults. React Hook Form + zod with the shared form helpers, checked
 * before any request with the server's own rules
 * (`fleet_document_sections_name_check`, `fleet_document_types_*_check`:
 * names 1-80 characters, acknowledgement due 1-365 days, major | minor).
 *
 * The number field holds the input's text; `toSaveTypeInput` returns the
 * definer's input once the resolver has passed.
 */
import { z } from 'zod';
import { positiveInt, requiredText } from '@/shared/lib/form';
import { ACK_DUE_DAYS_MAX, NAME_MAX, type SaveTypeInput } from '../hooks/useFleetDocumentMutations';
import type { FleetDocumentVersionKind } from './fleetDocumentMachine';

/** The server's limits (the definers' checks; one source with the mutation wrappers). */
export const TAXONOMY_NAME_MAX = NAME_MAX;
export { ACK_DUE_DAYS_MAX };
export const ACK_DUE_DAYS_DEFAULT = 14;

export const NAME_REQUIRED = 'Enter a name';
export const DAYS_REQUIRED = 'Enter the number of days';

export const sectionSchema = z.object({
  name: requiredText(NAME_REQUIRED, TAXONOMY_NAME_MAX),
});

export interface SectionFormValues {
  name: string;
}

export const documentTypeSchema = z.object({
  name: requiredText(NAME_REQUIRED, TAXONOMY_NAME_MAX),
  ackRequiredDefault: z.boolean(),
  ackDueDaysDefault: positiveInt(DAYS_REQUIRED, ACK_DUE_DAYS_MAX),
  versionKindDefault: z.enum(['major', 'minor']),
  hideWhenEmpty: z.boolean(),
});

export interface DocumentTypeFormValues {
  name: string;
  ackRequiredDefault: boolean;
  /** The input's text. */
  ackDueDaysDefault: string;
  versionKindDefault: FleetDocumentVersionKind;
  hideWhenEmpty: boolean;
}

/** A new type's starting values: acknowledgement required within 14 days, major versions, shown while empty (the server's defaults). */
export function documentTypeFormDefaults(type?: {
  name: string;
  ack_required_default: boolean;
  ack_due_days_default: number;
  version_kind_default: FleetDocumentVersionKind;
  hide_when_empty: boolean;
}): DocumentTypeFormValues {
  return {
    name: type?.name ?? '',
    ackRequiredDefault: type?.ack_required_default ?? true,
    ackDueDaysDefault: String(type?.ack_due_days_default ?? ACK_DUE_DAYS_DEFAULT),
    versionKindDefault: type?.version_kind_default ?? 'major',
    hideWhenEmpty: type?.hide_when_empty ?? false,
  };
}

/** The definer's input for the form, or null when the form does not hold a valid type. */
export function toSaveTypeInput(values: DocumentTypeFormValues, ids: { id: string | null; sectionId: string }): SaveTypeInput | null {
  const parsed = documentTypeSchema.safeParse(values);
  if (!parsed.success) return null;
  return {
    id: ids.id,
    sectionId: ids.sectionId,
    name: parsed.data.name,
    ackRequiredDefault: parsed.data.ackRequiredDefault,
    ackDueDaysDefault: parsed.data.ackDueDaysDefault,
    versionKindDefault: parsed.data.versionKindDefault,
    hideWhenEmpty: parsed.data.hideWhenEmpty,
  };
}

/** A section name that passes the schema (trimmed), or null. */
export function toSectionName(values: SectionFormValues): string | null {
  const parsed = sectionSchema.safeParse(values);
  return parsed.success ? parsed.data.name : null;
}

/** Moves `id` one place up or down in `ids` (keyboard and buttons); the same list when it cannot move. */
export function moveInOrder(ids: readonly string[], id: string, direction: 'up' | 'down'): string[] {
  const from = ids.indexOf(id);
  const to = direction === 'up' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
