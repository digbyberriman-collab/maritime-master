-- Add `medical_officer` to the app_role enum.
--
-- ALTER TYPE ... ADD VALUE must be committed before the new value can be used
-- in any subsequent DDL/DML in the same transaction. Keeping the enum change in
-- its own migration file guarantees that, regardless of how the migration
-- runner wraps statements.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'medical_officer';
