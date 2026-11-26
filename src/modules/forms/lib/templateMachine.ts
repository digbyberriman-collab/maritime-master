/**
 * The form template lifecycle (gap/02 W2, FC3–FC5; X5 spec §2 X5-06A,
 * D-X5-13, D-X5-23): the states × actions table the server's definers
 * enforce (`20261124040500_fleet_form_templates.sql`), the delete and
 * new-version rules in the server's order, the Customise code, version
 * numbers and labels, and the sentence for every refusal the definers and
 * the guard raise.
 *
 * Pure: no React, no Supabase. The UI uses it to offer only the actions a
 * template's status allows and to word a refusal; the server stays the
 * authority (it re-checks every rule). The SQL test
 * (supabase/tests/sql/fleet/form_templates.test.sql) copies
 * FORM_TEMPLATE_MACHINE between its machine-table markers, and
 * src/test/forms/templateMachine.test.ts pins that copy.
 */
import type { FormTemplateStatus } from '../types/db.pending';

export type { FormTemplateStatus } from '../types/db.pending';

export const FORM_TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'] as const satisfies readonly FormTemplateStatus[];

/** What a fleet checklist admin (or, for set_visibility, a vessel manager) can do to a template; one definer each. */
export const FORM_TEMPLATE_ACTIONS = ['publish', 'new_version', 'customise', 'archive', 'delete_draft', 'move_area', 'set_visibility'] as const;
export type FormTemplateAction = (typeof FORM_TEMPLATE_ACTIONS)[number];

/** The definer behind each action. */
export const FORM_TEMPLATE_ACTION_RPC: Readonly<Record<FormTemplateAction, string>> = {
  publish: 'form_template_publish',
  new_version: 'form_template_new_version',
  customise: 'form_template_customise',
  archive: 'form_template_archive',
  delete_draft: 'form_template_delete_draft',
  move_area: 'form_template_move_area',
  set_visibility: 'form_template_set_visibility',
};

/** Refusals that depend only on the template's status. */
export type FormTemplateStateRefusal =
  | 'already_published'
  | 'template_superseded'
  | 'template_archived'
  | 'template_draft'
  | 'already_archived'
  | 'template_published'
  | 'template_not_published';

/**
 * Where an action leaves the template: a status (the same one for
 * new_version and customise, which leave it as it is and add a draft), or
 * gone (a deleted draft).
 */
export type FormTemplateOutcome =
  | { ok: true; to: FormTemplateStatus | 'deleted'; adds?: 'draft' | 'copy' }
  | { ok: false; refusal: FormTemplateStateRefusal };

const to = (status: FormTemplateStatus | 'deleted', adds?: 'draft' | 'copy'): FormTemplateOutcome => (adds ? { ok: true, to: status, adds } : { ok: true, to: status });
const refused = (refusal: FormTemplateStateRefusal): FormTemplateOutcome => ({ ok: false, refusal });

/**
 * The states × actions table (W2). A draft is published, archived,
 * deleted (when never published and without runs) or moved; a published
 * template gets a new draft version or a Customise copy, is archived,
 * moved or shown / hidden on a vessel, never deleted; a superseded version
 * is history (it can still be copied or archived); an archived one starts
 * again as a new draft version or a copy.
 */
export const FORM_TEMPLATE_MACHINE: Readonly<Record<FormTemplateStatus, Readonly<Record<FormTemplateAction, FormTemplateOutcome>>>> = {
  DRAFT: {
    publish: to('PUBLISHED'),
    new_version: refused('template_draft'),
    customise: refused('template_draft'),
    archive: to('ARCHIVED'),
    delete_draft: to('deleted'),
    move_area: to('DRAFT'),
    set_visibility: refused('template_not_published'),
  },
  PUBLISHED: {
    publish: refused('already_published'),
    new_version: to('PUBLISHED', 'draft'),
    customise: to('PUBLISHED', 'copy'),
    archive: to('ARCHIVED'),
    delete_draft: refused('template_published'),
    move_area: to('PUBLISHED'),
    set_visibility: to('PUBLISHED'),
  },
  SUPERSEDED: {
    publish: refused('template_superseded'),
    new_version: refused('template_superseded'),
    customise: to('SUPERSEDED', 'copy'),
    archive: to('ARCHIVED'),
    delete_draft: refused('template_published'),
    move_area: refused('template_superseded'),
    set_visibility: refused('template_not_published'),
  },
  ARCHIVED: {
    publish: refused('template_archived'),
    new_version: to('ARCHIVED', 'draft'),
    customise: to('ARCHIVED', 'copy'),
    archive: refused('already_archived'),
    delete_draft: refused('template_archived'),
    move_area: refused('template_archived'),
    set_visibility: refused('template_not_published'),
  },
};

export const isFormTemplateStatus = (value: unknown): value is FormTemplateStatus =>
  typeof value === 'string' && (FORM_TEMPLATE_STATUSES as readonly string[]).includes(value);

/** A stored status read case-insensitively (the live column is upper case); null for anything else. */
export function normaliseFormTemplateStatus(value: unknown): FormTemplateStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  return isFormTemplateStatus(upper) ? upper : null;
}

/** The outcome of `action` on a template in `status`. */
export function formTemplateTransition(status: FormTemplateStatus, action: FormTemplateAction): FormTemplateOutcome {
  return FORM_TEMPLATE_MACHINE[status][action];
}

/** The actions a template in `status` allows, in table order. */
export function formTemplateActions(status: FormTemplateStatus): FormTemplateAction[] {
  return FORM_TEMPLATE_ACTIONS.filter((action) => FORM_TEMPLATE_MACHINE[status][action].ok);
}

// ─── Rules beyond the status (the server's order) ─────────────────────────

export type DeleteRefusal = 'template_archived' | 'template_published' | 'template_has_runs';

/**
 * Why a template cannot be deleted, as form_template_delete_draft checks:
 * archived; published once (any status but a draft, or a draft with a
 * publish date); then any run. Null: it may be deleted.
 */
export function deleteRefusal(input: { status: FormTemplateStatus; publishedAt: string | null | undefined; runCount: number }): DeleteRefusal | null {
  if (input.status === 'ARCHIVED') return 'template_archived';
  if (input.status !== 'DRAFT' || input.publishedAt) return 'template_published';
  if (input.runCount > 0) return 'template_has_runs';
  return null;
}

export type NewVersionRefusal = 'template_draft' | 'template_superseded' | 'platform_template_customise' | 'draft_exists';

/** Why a new version cannot be started, as form_template_new_version checks. Null: it may. */
export function newVersionRefusal(input: { status: FormTemplateStatus; origin: string | null | undefined; familyHasDraft: boolean }): NewVersionRefusal | null {
  if (input.status === 'DRAFT') return 'template_draft';
  if (input.status === 'SUPERSEDED') return 'template_superseded';
  if (input.origin === 'platform') return 'platform_template_customise';
  if (input.familyHasDraft) return 'draft_exists';
  return null;
}

/** The version number a new version gets: one more than the highest of the family. */
export const nextVersionNumber = (family: ReadonlyArray<{ version: number | null }>): number =>
  family.reduce((max, t) => Math.max(max, t.version ?? 0), 0) + 1;

/** How a version is shown: its typed label, else `v<number>`. */
export function versionDisplay(template: { version: number | null; version_label?: string | null }): string {
  const label = template.version_label?.trim();
  return label ? label : `v${template.version ?? 1}`;
}

export const VERSION_LABEL_MAX = 40;
export const ARCHIVE_REASON_MAX = 500;
export const HIDE_REASON_MAX = 300;
export const TEMPLATE_CODE_MAX = 50;

/**
 * The code of a Customise copy (form_template_customise):
 * `<code>_CUSTOM<n>` for the first n not used in the company, the base
 * shortened so the code keeps to 50 characters.
 */
export function customiseCode(sourceCode: string, usedCodes: Iterable<string>): string {
  const used = new Set(usedCodes);
  for (let n = 1; ; n += 1) {
    const suffix = `_CUSTOM${n}`;
    const code = sourceCode.slice(0, TEMPLATE_CODE_MAX - suffix.length) + suffix;
    if (!used.has(code)) return code;
  }
}

// ─── Refusal sentences ─────────────────────────────────────────────────────

/**
 * The sentence for every refusal the definers and the guard raise (the
 * message is the code). src/test/forms/templateMachine.test.ts checks the
 * migration raises no code missing here.
 */
export const FORM_TEMPLATE_REFUSALS: Readonly<Record<string, string>> = {
  // status
  template_not_found: 'This template no longer exists. Refresh the list.',
  already_published: 'This version is already published.',
  template_superseded: 'This is an older version. Work from the current published version instead.',
  template_archived: 'This template is archived. Start a new version from it to use it again.',
  template_draft: 'This template is still a draft. Edit or publish the draft instead.',
  already_archived: 'This template is already archived.',
  template_published: 'This template has been published, so it is kept for its history. Archive it instead.',
  template_has_runs: 'Crews have already filled in this template, so it is kept. Archive it instead.',
  template_not_published: 'Only a published template can be shown or hidden on a vessel.',
  draft_exists: 'A draft of the next version already exists. Open that draft to change it.',
  platform_template_customise: 'This is a standard template. Customise it to make your own copy.',
  // publish checks
  name_required: 'Give the template a name before publishing it.',
  no_section: 'Add at least one item before publishing.',
  empty_section: 'A section has no items. Add an item to it or remove the section.',
  unlabelled_section: 'Every section needs a title.',
  unlabelled_item: 'Every item needs a label.',
  targets_required: 'Choose at least one vessel, or apply the template to all vessels.',
  invalid_targets: 'One of the chosen vessels is not one of your fleet. Choose the vessels again.',
  version_label_too_long: 'A version number can be up to 40 characters.',
  version_label_taken: 'Another version of this template already uses that version number.',
  stale_template: 'Someone changed this template since you opened it. Reload it and try again.',
  // the other definers
  reason_too_long: 'That reason is too long. Shorten it and try again.',
  invalid_area: 'Choose one of the areas in the list.',
  invalid_visibility: 'Choose whether the template is shown or hidden on the vessel.',
  vessel_not_targeted: 'This template is not used on that vessel.',
  reorder_mismatch: 'The list changed while you were ordering it. Reload it and try again.',
  // access
  not_permitted: 'You do not have permission to change templates here.',
  vessel_out_of_reach: 'That vessel is not one you can manage.',
  // the guard (a direct write the server refused)
  form_templates_guarded: 'The server refused this change: a published template is changed by publishing a new version.',
  form_template_vessel_settings_guarded: 'The server refused this change to the vessel settings.',
  form_template_events_guarded: 'Template history cannot be changed.',
};

export const FORM_TEMPLATE_REFUSAL_CODES = Object.keys(FORM_TEMPLATE_REFUSALS);

/** The sentence for a refusal code (the error message the server raised); null for anything else. */
export function formTemplateRefusal(code: string | null | undefined): string | null {
  if (!code) return null;
  return Object.prototype.hasOwnProperty.call(FORM_TEMPLATE_REFUSALS, code) ? FORM_TEMPLATE_REFUSALS[code] : null;
}
