-- Drift patch: the seed company row that 20260428170829 assumes.
--
-- Before: 20260428170829_00553f3f-cc1f-4c05-8442-a3a3cf7fce9c.sql
-- Live state reproduced: a row in public.companies with
--   id = 11111111-1111-1111-1111-111111111111.
-- Evidence: 20260428170829 is a Lovable UUID-named copy (Lovable ran it, so it
--   applied live: MIGRATIONS-LEDGER.md, "Lovable's UUID-named copies ... ran").
--   Its INSERT INTO public.vessels (company_id ...) uses that id, and
--   vessels.company_id is NOT NULL REFERENCES companies(id) (20260125143210),
--   so the company existed live. No migration creates it (it was made in the
--   app), and types.ts does not show rows. Without it the whole file rolls
--   back, and with it profiles.airtable_id / imported_vessel_id, which
--   20260428171011, 20260917173040 and the health phase files depend on.
-- Schema state only: one row, a neutral name (the live name is not known and
-- is not needed). Idempotent.
INSERT INTO public.companies (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Legacy seed company')
ON CONFLICT (id) DO NOTHING;
