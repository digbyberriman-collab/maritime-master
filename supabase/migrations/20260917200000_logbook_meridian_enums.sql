-- ── Logbook catalogue: the 17 Meridian book types join the original eight ──
-- Enum values are added in their own migration so the next migration can
-- reference them (new enum values cannot be used in the transaction that
-- creates them).
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'official_log';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'ihm_record';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'orders_book';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'garbage_record_book_2';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'oil_record_book_2';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'cargo_record_book';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'ods_record';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'fuel_record';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'nox_record';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'sewage_record';
ALTER TYPE public.logbook_type ADD VALUE IF NOT EXISTS 'biofouling_record';

-- A record the Master has reviewed (individually or by signing its page).
ALTER TYPE public.logbook_entry_status ADD VALUE IF NOT EXISTS 'verified';
