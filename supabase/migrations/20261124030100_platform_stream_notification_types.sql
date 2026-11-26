-- =================================================================
-- PLATFORM PREP PP4: the Phase 3 wave 1 notification types (X1 PR-X1-E,
-- X5 PR-08; gap/03 catalogue; D-238, D-249; platform-prep plan §3 PP4
-- item 4)
-- Seeds: notification_types rows for the Crew (11), Documents (5) and
--   Training (3) types the two streams' definers emit
-- TS mirror: the owning manifests declare each type with its status and
--   emitter (src/modules/crew/module.ts, src/modules/documents/module.ts,
--   src/modules/development/module.ts, `notificationTypes`), folded into
--   src/modules/notifications-admin/lib/notificationEmitters.ts
-- =================================================================
--
-- notification_types is a platform table, so the streams' types are seeded
-- here, once, before the streams fork. No emitter exists yet: every type is
-- declared 'deferred' in its manifest and reads "Not available yet" until
-- the slice that lands its emitter flips it to 'live' and proves the
-- emitter in its own SQL test (D-238). emit_notification_event refuses an
-- unknown type, and the streams call it inside an exception block (D-128),
-- so applying this file before or after the stream files is safe either way.
--
-- One key is adopted, not new: crew_document_expiring is already seeded,
-- and live, by the HRIS phase 1 file (20260917110000, its Lovable copy
-- 20260917175040; category Crew, weekly, "Passport, visa or medical
-- certificate expiring within 90 days"). The INSERT below leaves that row
-- as it is (ON CONFLICT DO NOTHING); X1's expiry sweep becomes its emitter.
-- Nothing emits it today (HR expiry alerts go to the alerts table), so the
-- client now shows it as a deferred engine type instead of a legacy
-- subscription; rows already saved in notification_subscriptions stay, and
-- nothing emails them (EMAIL_DELIVERY_LIVE is false, D-249).
--
-- In-app only (D-249): these are engine types. The emitter picks the
-- audience; nothing reads notification_subscriptions for them and no email
-- is sent, so no copy here mentions email. Rows are never overwritten
-- (ON CONFLICT DO NOTHING): an owner's later wording edit stays.
--
-- Links are per event (emit_notification_event's p_link_scope and a
-- relative p_link_path, D-170). The link each emitter is to use:
--   crew_document_review_needed   vessel   crew/people/<profile_id>/documents
--   crew_document_decided         personal documents
--   crew_document_expiring        personal documents (the crew member); vessel crew/compliance (HoD, approvers)
--   hor_reminder                  personal hours-of-rest
--   hor_serious_breach            vessel   crew/hours-of-rest
--   hor_breach_report             vessel   crew/hours-of-rest/report
--   hor_correction_requested      personal hours-of-rest
--   familiarisation_assigned      vessel   crew/familiarisation
--   crew_transfer_submitted       fleet    planner
--   crew_transfer_completed       vessel   crew/list
--   crew_employment_ended         vessel   crew/people/<profile_id>
--   fleet_document_published      vessel   safety/fleet-documents?doc=<document_id>
--   fleet_document_ack_reminder   vessel   safety/fleet-documents?doc=<document_id>
--   fleet_document_ack_due_soon   vessel   safety/fleet-documents?doc=<document_id>
--   fleet_document_ack_overdue    vessel   safety/fleet-documents?doc=<document_id>
--   fleet_document_ack_digest     fleet    documents?tab=acknowledgements
--   training_application_action_needed  vessel crew/training (HoD, Captain, Purser); fleet training/applications (training admins)
--   training_application_updated  personal training
--   training_applications_stale   fleet    training/overview
--
-- Idempotent (D-12).

-- ---------------------------------------------------------------- prerequisites (rule 14)
DO $$
BEGIN
  IF to_regclass('public.notification_types') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124030100_platform_stream_notification_types needs notification_types (legacy 20260522163528)';
  END IF;
  IF to_regprocedure('public.emit_notification_event(text,uuid,text,text,uuid,text,text,text,text,text,uuid,text,uuid,uuid[],text[],jsonb,text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = '20261124030100_platform_stream_notification_types needs the notification engine: apply 20261123030000_platform_notification_outbox.sql first';
  END IF;
END
$$;

-- ---------------------------------------------------------------- the wave 1 stream types

INSERT INTO public.notification_types (key, name, category, cadence, description, default_enabled, sort_order) VALUES
  ('crew_document_review_needed', 'Crew document to verify', 'Crew', 'realtime', 'A crew document is waiting for you to check and verify it', true, 400),
  ('crew_document_decided', 'Crew document checked', 'Crew', 'realtime', 'A document you added was verified, or sent back with a note', true, 401),
  ('crew_document_expiring', 'Crew documents expiring', 'Crew', 'daily', 'Crew documents are due for renewal or have expired', true, 402),
  ('hor_reminder', 'Hours of rest due', 'Crew', 'daily', 'Your hours of rest for a month are waiting to be entered or submitted', true, 403),
  ('hor_serious_breach', 'Serious hours of rest breach', 'Crew', 'realtime', 'A serious hours of rest breach was recorded on your vessel', true, 404),
  ('hor_breach_report', 'Hours of rest breach report', 'Crew', 'realtime', 'A breach report was shared with you in STORM', true, 405),
  ('hor_correction_requested', 'Hours of rest correction requested', 'Crew', 'realtime', 'Your hours of rest for a month were sent back for a correction', true, 406),
  ('familiarisation_assigned', 'Familiarisation to complete', 'Crew', 'realtime', 'A familiarisation checklist was opened for you', true, 407),
  ('crew_transfer_submitted', 'Crew transfer to approve', 'Crew', 'realtime', 'A crew transfer between vessels is waiting for approval', true, 408),
  ('crew_transfer_completed', 'Crew transfer completed', 'Crew', 'realtime', 'A crew member moved to another vessel', true, 409),
  ('crew_employment_ended', 'Crew employment ended', 'Crew', 'realtime', 'The employment of a crew member on a vessel ended', true, 410),
  ('fleet_document_published', 'Fleet document published', 'Documents', 'realtime', 'The company published a document for your vessel', true, 420),
  ('fleet_document_ack_reminder', 'Fleet document to acknowledge', 'Documents', 'realtime', 'A reminder to read and acknowledge a fleet document', true, 421),
  ('fleet_document_ack_due_soon', 'Acknowledgement due soon', 'Documents', 'daily', 'A fleet document you must acknowledge is due in three days', true, 422),
  ('fleet_document_ack_overdue', 'Acknowledgement overdue', 'Documents', 'daily', 'A fleet document acknowledgement is past its due date', true, 423),
  ('fleet_document_ack_digest', 'Overdue acknowledgements this week', 'Documents', 'weekly', 'A weekly summary of overdue fleet document acknowledgements by vessel', true, 424),
  ('training_application_action_needed', 'Training application to review', 'Training', 'realtime', 'A training application is waiting for your decision', true, 430),
  ('training_application_updated', 'Training application updated', 'Training', 'realtime', 'A training application you made moved on, or was changed', true, 431),
  ('training_applications_stale', 'Training applications waiting', 'Training', 'weekly', 'Training applications that have waited more than seven days at one stage', true, 432)
ON CONFLICT (key) DO NOTHING;
