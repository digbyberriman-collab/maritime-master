/**
 * Which seeded engine notification types STORM can actually send (D-238).
 *
 * 20261123030000_platform_notification_outbox.sql seeds every engine type
 * (category 'Records') so the catalogue is complete (D-164), but some have
 * no writer yet. Non-negotiable 9 (no fake controls): the preferences page
 * and Notification Management show those as "Not available yet" instead of
 * a working switch or subscription. src/test/notifications/
 * notificationEmitters.test.tsx pins both lists against the seed, so a new
 * seeded type cannot go unwired silently.
 *
 * Legacy notification types (anything not in either list) keep working as
 * before: only the deferred engine types are unavailable.
 */

/** Seeded engine types with no emitter yet, each with its future emitter (D-238). */
export const DEFERRED_NOTIFICATION_TYPES = [
  // The SIG Remind action.
  'signature_reminder',
  // record_set_section_digests, when it makes a required signature stale.
  'signatures_stale',
  // The TH5 daily job (requested update due today).
  'status_request_due',
  // The TH5 daily job (requested update past its due date).
  'status_request_overdue',
  // A definer on the accept path, with invited_by as the must-act user.
  'invitation_accepted',
  // The C3 dispatcher bounce feed.
  'invitation_bounced',
] as const;

/** Seeded engine types that a live SQL emitter produces today. */
export const LIVE_ENGINE_NOTIFICATION_TYPES = [
  'signature_requested',
  'record_submitted_to_company',
  'record_acknowledged',
  'record_decision',
  'record_returned',
  'record_closed',
  'record_reopened',
  'record_voided',
  'record_update_posted',
  'status_request_posted',
  'export_ready',
  'export_failed',
  'personal_data_exported',
] as const;

export type DeferredNotificationType = (typeof DEFERRED_NOTIFICATION_TYPES)[number];
export type LiveEngineNotificationType = (typeof LIVE_ENGINE_NOTIFICATION_TYPES)[number];

const DEFERRED: ReadonlySet<string> = new Set(DEFERRED_NOTIFICATION_TYPES);

/** False only for a deferred engine type; live engine and legacy types are available. */
export function isNotificationTypeAvailable(key: string): boolean {
  return !DEFERRED.has(key);
}

/** The pill shown in place of a switch or subscription for a deferred type. */
export const NOT_AVAILABLE_COPY = 'Not available yet';

/** Accessible description of the pill. */
export const NOT_AVAILABLE_DESCRIPTION = 'STORM does not send this notification yet';
