/**
 * The fleet document lifecycle (gap/02 W1, FD4; X5 spec §2 X5-04A,
 * D-X5-03, D-X5-04): the states × actions table the server's definers
 * enforce (`20261124040300_fleet_documents_library.sql`), the publish
 * guards in the server's order, version supersession, the major / minor
 * acknowledgement effect, the taxonomy delete rules, and the sentence for
 * every refusal the definers raise.
 *
 * Pure: no React, no Supabase. The UI uses it to offer only the actions a
 * document's state allows and to word a refusal; the server stays the
 * authority (it re-checks every rule). The SQL test
 * (supabase/tests/sql/fleet/documents_library.test.sql) copies
 * FLEET_DOCUMENT_MACHINE between its machine-table markers, and
 * src/test/documents/fleetDocumentMachine.test.ts pins that copy.
 */

export const FLEET_DOCUMENT_STATUSES = ['draft', 'published', 'withdrawn'] as const;
export type FleetDocumentStatus = (typeof FLEET_DOCUMENT_STATUSES)[number];

export const FLEET_DOCUMENT_VERSION_STATES = ['draft', 'published', 'superseded'] as const;
export type FleetDocumentVersionState = (typeof FLEET_DOCUMENT_VERSION_STATES)[number];

export type FleetDocumentVersionKind = 'major' | 'minor';
export type FleetDocumentTargetMode = 'all_including_future' | 'selected';

/** What a library editor can do to a document (one definer each). */
export const FLEET_DOCUMENT_ACTIONS = ['edit_details', 'add_version', 'set_targets', 'publish', 'withdraw', 'delete_draft'] as const;
export type FleetDocumentAction = (typeof FLEET_DOCUMENT_ACTIONS)[number];

/** The definer behind each action. */
export const FLEET_DOCUMENT_ACTION_RPC: Readonly<Record<FleetDocumentAction, string>> = {
  edit_details: 'fleet_document_update',
  add_version: 'fleet_document_add_version',
  set_targets: 'fleet_document_set_targets',
  publish: 'fleet_document_publish',
  withdraw: 'fleet_document_withdraw',
  delete_draft: 'fleet_document_delete_draft',
};

/** Refusals that depend only on the document's state. */
export type FleetDocumentStateRefusal = 'not_published' | 'already_withdrawn' | 'document_withdrawn' | 'document_published';

/** Where an action leaves the document: a state, or gone (a deleted draft). */
export type FleetDocumentOutcome =
  | { ok: true; to: FleetDocumentStatus | 'deleted' }
  | { ok: false; refusal: FleetDocumentStateRefusal };

const to = (state: FleetDocumentStatus | 'deleted'): FleetDocumentOutcome => ({ ok: true, to: state });
const refused = (refusal: FleetDocumentStateRefusal): FleetDocumentOutcome => ({ ok: false, refusal });

/**
 * The states × actions table (W1). A draft is edited, versioned, targeted,
 * published or deleted; a published document is edited, versioned,
 * retargeted, republished with a new version or withdrawn, never deleted;
 * a withdrawn document is final.
 */
export const FLEET_DOCUMENT_MACHINE: Readonly<Record<FleetDocumentStatus, Readonly<Record<FleetDocumentAction, FleetDocumentOutcome>>>> = {
  draft: {
    edit_details: to('draft'),
    add_version: to('draft'),
    set_targets: to('draft'),
    publish: to('published'),
    withdraw: refused('not_published'),
    delete_draft: to('deleted'),
  },
  published: {
    edit_details: to('published'),
    add_version: to('published'),
    set_targets: to('published'),
    publish: to('published'),
    withdraw: to('withdrawn'),
    delete_draft: refused('document_published'),
  },
  withdrawn: {
    edit_details: refused('document_withdrawn'),
    add_version: refused('document_withdrawn'),
    set_targets: refused('document_withdrawn'),
    publish: refused('document_withdrawn'),
    withdraw: refused('already_withdrawn'),
    delete_draft: refused('document_withdrawn'),
  },
};

export const isFleetDocumentStatus = (value: unknown): value is FleetDocumentStatus =>
  typeof value === 'string' && (FLEET_DOCUMENT_STATUSES as readonly string[]).includes(value);

export const isFleetDocumentVersionState = (value: unknown): value is FleetDocumentVersionState =>
  typeof value === 'string' && (FLEET_DOCUMENT_VERSION_STATES as readonly string[]).includes(value);

/** The outcome of `action` on a document in `status`. */
export function fleetDocumentTransition(status: FleetDocumentStatus, action: FleetDocumentAction): FleetDocumentOutcome {
  return FLEET_DOCUMENT_MACHINE[status][action];
}

/** The actions a document in `status` allows, in table order. */
export function fleetDocumentActions(status: FleetDocumentStatus): FleetDocumentAction[] {
  return FLEET_DOCUMENT_ACTIONS.filter((action) => FLEET_DOCUMENT_MACHINE[status][action].ok);
}

// ─── Publish ─────────────────────────────────────────────────────────────

/** Everything fleet_document_publish() checks, as the client last read it. */
export interface PublishCheck {
  status: FleetDocumentStatus;
  /** The document's updated_at the publisher saw (null = none sent). */
  expectedUpdatedAt: string | null;
  /** The document's updated_at now. */
  currentUpdatedAt: string;
  /** The version to publish (null: not one of this document's versions). */
  version: { state: FleetDocumentVersionState; fileLive: boolean } | null;
  targetMode: FleetDocumentTargetMode;
  /** Target vessels that are not archived. */
  liveTargetCount: number;
}

export type PublishRefusal =
  | 'document_withdrawn'
  | 'expected_updated_at_required'
  | 'stale_document'
  | 'version_not_found'
  | 'version_already_published'
  | 'version_superseded'
  | 'file_missing'
  | 'targets_required';

/** The first rule a publish breaks, in the server's order; null when it may go ahead. */
export function publishRefusal(check: PublishCheck): PublishRefusal | null {
  const state = fleetDocumentTransition(check.status, 'publish');
  if (!state.ok) return 'document_withdrawn';
  if (!check.expectedUpdatedAt) return 'expected_updated_at_required';
  if (Date.parse(check.expectedUpdatedAt) !== Date.parse(check.currentUpdatedAt)) return 'stale_document';
  if (!check.version) return 'version_not_found';
  if (check.version.state === 'published') return 'version_already_published';
  if (check.version.state === 'superseded') return 'version_superseded';
  if (!check.version.fileLive) return 'file_missing';
  if (check.targetMode === 'selected' && check.liveTargetCount < 1) return 'targets_required';
  return null;
}

/**
 * What a publish does to acknowledgements (D-X5-04; recorded in the
 * server's event payload, applied by X5-05A): nothing when the document
 * needs none, fresh rows for its first version, carried forward for a
 * minor version, everyone again for a major one.
 */
export type AckEffect = 'none' | 'fresh' | 'carry_forward' | 'reset';

export function publishAckEffect(input: { ackRequired: boolean; hasPreviousVersion: boolean; versionKind: FleetDocumentVersionKind }): AckEffect {
  if (!input.ackRequired) return 'none';
  if (!input.hasPreviousVersion) return 'fresh';
  return input.versionKind === 'minor' ? 'carry_forward' : 'reset';
}

export interface VersionLike {
  id: string;
  state: FleetDocumentVersionState;
}

/**
 * The versions after publishing `versionId`: it becomes the published one
 * and the version published before it is superseded; the rest keep their
 * state. Throws when the version is not a draft of the list (the caller
 * checks publishRefusal first).
 */
export function supersede<V extends VersionLike>(versions: readonly V[], versionId: string): { versions: V[]; supersededId: string | null } {
  const target = versions.find((v) => v.id === versionId);
  if (!target || target.state !== 'draft') throw new Error('Only a draft version of this document can be published.');
  let supersededId: string | null = null;
  const next = versions.map((v) => {
    if (v.id === versionId) return { ...v, state: 'published' as const };
    if (v.state === 'published') {
      supersededId = v.id;
      return { ...v, state: 'superseded' as const };
    }
    return v;
  });
  return { versions: next, supersededId };
}

/** The label a version gets when the publisher leaves it blank (the server's rule). */
export const autoVersionLabel = (versionNo: number): string => `v${versionNo}`;

/** The number of the next version: one more than the highest so far (the server numbers; this mirrors it for display). */
export const nextVersionNo = (versions: ReadonlyArray<{ version_no: number }>): number =>
  versions.reduce((max, v) => Math.max(max, v.version_no), 0) + 1;

// ─── Taxonomy delete rules (W1) ──────────────────────────────────────────

/** A section can be deleted only while none of its types holds a document (any state). */
export function sectionDeleteRefusal(documentsInSection: number): 'section_in_use' | null {
  return documentsInSection > 0 ? 'section_in_use' : null;
}

/** A type can be deleted only while it holds no document (any state). */
export function typeDeleteRefusal(documentsOfType: number): 'type_in_use' | null {
  return documentsOfType > 0 ? 'type_in_use' : null;
}

// ─── Refusal sentences ───────────────────────────────────────────────────

const REFUSALS: Readonly<Record<string, string>> = {
  not_permitted: 'You do not have permission to change fleet documents.',
  // taxonomy
  name_required: 'Enter a name.',
  name_too_long: 'Names can be up to 80 characters.',
  section_name_taken: 'There is already a section with this name.',
  section_not_found: 'That section no longer exists. Refresh to see the current sections.',
  section_required: 'Choose a section for the document type.',
  reorder_mismatch: 'The sections changed while you were moving them. Refresh and try again.',
  section_in_use: 'This section cannot be deleted while any of its document types holds a document.',
  type_name_taken: 'This section already has a document type with this name.',
  type_not_found: 'That document type no longer exists. Refresh to see the current types.',
  type_in_use: 'This document type cannot be deleted while it holds a document.',
  invalid_ack_due_days: 'Enter a number of days from 1 to 365.',
  invalid_version_kind: 'Choose major or minor.',
  // documents
  title_required: 'Enter a title.',
  title_too_long: 'Titles can be up to 160 characters.',
  description_too_long: 'Descriptions can be up to 2,000 characters.',
  document_not_found: 'That document no longer exists. Refresh to see the current library.',
  document_withdrawn: 'This document has been withdrawn and can no longer be changed.',
  document_published: 'A published document cannot be deleted. Withdraw it instead.',
  not_published: 'Only a published document can be withdrawn. Delete the draft instead.',
  already_withdrawn: 'This document has already been withdrawn.',
  expected_updated_at_required: 'Refresh the document and try again.',
  stale_document: 'Someone changed this document after you opened it. Refresh and check it before you try again.',
  reason_required: 'Enter the reason for withdrawing this document.',
  reason_too_long: 'The reason can be up to 500 characters.',
  // versions and files
  version_not_found: 'That version no longer exists. Refresh to see the current versions.',
  version_already_published: 'This version is already published.',
  version_superseded: 'A superseded version cannot be published again.',
  version_label_too_long: 'Version labels can be up to 40 characters.',
  version_label_taken: 'This document already has a version with this label.',
  change_summary_too_long: 'The change summary can be up to 1,000 characters.',
  file_missing: 'The file of this version has been removed. Upload it again.',
  file_not_found: 'The uploaded file could not be found. Upload it again.',
  file_removed: 'That file has been removed. Upload it again.',
  file_not_for_document: 'That file was uploaded for another document.',
  file_in_use: 'That file is already used by another version.',
  // targets
  invalid_target_mode: 'Choose all vessels or selected vessels.',
  vessels_not_expected: 'Clear the vessel list to publish to all vessels.',
  targets_required: 'Choose at least one vessel.',
  vessel_out_of_reach: 'One of the vessels is not part of your fleet.',
  vessel_archived: 'One of the vessels is archived. Remove it and try again.',
};

/** Every refusal code the definers raise. */
export const FLEET_DOCUMENT_REFUSAL_CODES: readonly string[] = Object.keys(REFUSALS);

/** The sentence for a definer's refusal message, or null for an unknown one. */
export function fleetDocumentRefusal(message: string | null | undefined): string | null {
  if (!message) return null;
  return Object.prototype.hasOwnProperty.call(REFUSALS, message) ? REFUSALS[message] : null;
}
