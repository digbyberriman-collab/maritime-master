/**
 * Which seeded engine notification types STORM can actually send (D-238), and
 * whether any notification is emailed yet (D-249).
 *
 * 20261123030000_platform_notification_outbox.sql seeds every engine type
 * (category 'Records') so the catalogue is complete (D-164), but some have
 * no writer yet. Non-negotiable 9 (no fake controls): the preferences page
 * and Notification Management show those as "Not available yet" instead of
 * a working switch or subscription. src/test/notifications/
 * notificationEmitters.test.tsx pins both lists against the seed, so a new
 * seeded type cannot go unwired silently.
 *
 * Engine types (live and deferred) are in-app only (D-249): the engine picks
 * the audience itself and fans out to the inbox through
 * user_notification_preferences, never through notification_subscriptions.
 * Notification Management therefore shows every engine type as a plain row
 * that takes no email subscription. Live engine types keep their personal
 * in-app switch on the preferences page.
 *
 * Legacy notification types (anything not in either list) keep their
 * recipient subscriptions, but no code path emails them yet:
 * EMAIL_DELIVERY_LIVE stays false until the gap/03 C3 dispatcher lands.
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

/**
 * Whether STORM emails notification subscribers (D-249). Nothing reads
 * notification_subscriptions yet; this flips to true in the change that
 * lands the gap/03 C3 dispatcher (D-249).
 */
export const EMAIL_DELIVERY_LIVE = false;

const ENGINE: ReadonlySet<string> = new Set([...LIVE_ENGINE_NOTIFICATION_TYPES, ...DEFERRED_NOTIFICATION_TYPES]);

/** True for any seeded engine type, live or deferred (D-238, D-249). */
export function isEngineNotificationType(key: string): boolean {
  return ENGINE.has(key);
}

/**
 * Whether Notification Management offers recipient subscriptions for a type
 * (D-249): engine types are in-app only, so only legacy types take them.
 */
export function takesSubscriptions(key: string): boolean {
  return !isEngineNotificationType(key);
}

/** The pill shown on a live engine type in Notification Management (D-249). */
export const IN_APP_ONLY_COPY = 'In-app only';

/** Accessible description of the "In-app only" pill. */
export const IN_APP_ONLY_DESCRIPTION =
  'STORM decides who receives this and shows it in the app. Email is not available yet.';

/** Page notice title while EMAIL_DELIVERY_LIVE is false (D-249). */
export const EMAIL_NOT_LIVE_TITLE = 'Email delivery is not live yet';

/** Page notice body while EMAIL_DELIVERY_LIVE is false (D-249). */
export const EMAIL_NOT_LIVE_DESCRIPTION = 'Recipients you save here are kept. STORM does not email them yet.';
