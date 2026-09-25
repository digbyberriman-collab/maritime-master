-- The numbering triggers (trg_audits_set_number, trg_drills_set_number,
-- trg_audit_findings_set_number) overwrite these unconditionally, so the
-- defaults are never visible. They exist so the generated insert types
-- treat the numbers as optional, matching how the app saves records.
ALTER TABLE public.audits ALTER COLUMN audit_number SET DEFAULT '';
ALTER TABLE public.drills ALTER COLUMN drill_number SET DEFAULT '';
ALTER TABLE public.audit_findings ALTER COLUMN finding_number SET DEFAULT '';