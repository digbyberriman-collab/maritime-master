-- Supabase stub for the local DB harness (Phase 2 spec §D.3).
--
-- Loaded once, as the superuser `postgres`, into a fresh database before the
-- legacy replay. It reproduces the parts of a Supabase project that the
-- migrations, policies and functions in this repo rely on, closely enough
-- that a migration behaves here as it would live:
--   * the Supabase roles (service_role bypasses RLS);
--   * auth.users / sessions / refresh_tokens / identities with Supabase's
--     columns, and auth.uid() / role() / email() / jwt() exactly as Supabase
--     defines them (they read request.jwt.claims and request.jwt.claim.*);
--   * storage.buckets / objects (RLS on) with foldername / filename /
--     extension;
--   * the extensions schema (pgcrypto, pg_trgm, citext, uuid-ossp) on the
--     database search_path, a cron schema with cron.schedule() so legacy cron
--     registrations replay, an empty realtime schema and the
--     supabase_realtime publication;
--   * Supabase's default privileges: ALL on new public tables and sequences
--     and EXECUTE on new public functions granted DIRECTLY to anon,
--     authenticated and service_role. A migration that forgets a REVOKE
--     therefore leaves the same hole here as live, and the ACL tests catch it.
--
-- It is not a Supabase install: no GoTrue, PostgREST or storage API. The
-- harness drives roles and claims itself (supabase/tests/harness/testlib.sql).
-- Idempotent (safe to load twice).

SET client_min_messages = warning;

-- ---------------------------------------------------------------- roles
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('anon',                    'NOLOGIN NOINHERIT'),
      ('authenticated',           'NOLOGIN NOINHERIT'),
      ('service_role',            'NOLOGIN NOINHERIT BYPASSRLS'),
      ('authenticator',           'NOLOGIN NOINHERIT'),
      ('supabase_admin',          'NOLOGIN CREATEROLE CREATEDB REPLICATION BYPASSRLS'),
      ('supabase_auth_admin',     'NOLOGIN NOINHERIT CREATEROLE'),
      ('supabase_storage_admin',  'NOLOGIN NOINHERIT CREATEROLE'),
      ('supabase_realtime_admin', 'NOLOGIN NOINHERIT'),
      ('sandbox_exec',            'NOLOGIN')
    ) AS v(name, attrs)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name) THEN
      EXECUTE format('CREATE ROLE %I %s', r.name, r.attrs);
    END IF;
  END LOOP;
END $$;

GRANT anon, authenticated, service_role TO authenticator;

-- ---------------------------------------------------------------- schemas
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS cron;

-- Supabase puts extensions in their own schema and makes it visible through
-- the database search_path.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path = "$user", public, extensions', current_database());
END $$;
SET search_path = "$user", public, extensions;

-- ---------------------------------------------------------------- extensions
DO $$
DECLARE
  ext text;
BEGIN
  FOREACH ext IN ARRAY ARRAY['pgcrypto', 'pg_trgm', 'citext', 'uuid-ossp'] LOOP
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = ext) THEN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA extensions', ext);
    ELSE
      RAISE WARNING 'extension % is not available on this server; skipped', ext;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------- auth
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid NULL,
  id uuid NOT NULL,
  aud varchar(255) NULL,
  role varchar(255) NULL,
  email varchar(255) NULL,
  encrypted_password varchar(255) NULL,
  email_confirmed_at timestamptz NULL,
  invited_at timestamptz NULL,
  confirmation_token varchar(255) NULL,
  confirmation_sent_at timestamptz NULL,
  recovery_token varchar(255) NULL,
  recovery_sent_at timestamptz NULL,
  email_change_token_new varchar(255) NULL,
  email_change varchar(255) NULL,
  email_change_sent_at timestamptz NULL,
  last_sign_in_at timestamptz NULL,
  raw_app_meta_data jsonb NULL,
  raw_user_meta_data jsonb NULL,
  is_super_admin boolean NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  phone text NULL DEFAULT NULL,
  phone_confirmed_at timestamptz NULL,
  phone_change text NULL DEFAULT '',
  phone_change_token varchar(255) NULL DEFAULT '',
  phone_change_sent_at timestamptz NULL,
  confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  email_change_token_current varchar(255) NULL DEFAULT '',
  email_change_confirm_status smallint NULL DEFAULT 0,
  banned_until timestamptz NULL,
  reauthentication_token varchar(255) NULL DEFAULT '',
  reauthentication_sent_at timestamptz NULL,
  is_sso_user boolean NOT NULL DEFAULT false,
  deleted_at timestamptz NULL,
  is_anonymous boolean NOT NULL DEFAULT false,
  CONSTRAINT users_pkey PRIMARY KEY (id),
  CONSTRAINT users_phone_key UNIQUE (phone),
  CONSTRAINT users_email_change_confirm_status_check CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2)
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_partial_key ON auth.users (email) WHERE (is_sso_user = false);
CREATE INDEX IF NOT EXISTS users_instance_id_idx ON auth.users (instance_id);
COMMENT ON TABLE auth.users IS 'Harness stub of Supabase auth.users (same columns; no GoTrue behind it).';

CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id text NOT NULL,
  user_id uuid NOT NULL,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  last_sign_in_at timestamptz NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  email text GENERATED ALWAYS AS (lower(identity_data ->> 'email')) STORED,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT identities_pkey PRIMARY KEY (id),
  CONSTRAINT identities_provider_id_provider_unique UNIQUE (provider_id, provider),
  CONSTRAINT identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  factor_id uuid NULL,
  aal text NULL,
  not_after timestamptz NULL,
  refreshed_at timestamp NULL,
  user_agent text NULL,
  ip inet NULL,
  tag text NULL,
  CONSTRAINT sessions_pkey PRIMARY KEY (id),
  CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON auth.sessions (user_id);

-- Supabase keeps refresh_tokens.user_id as varchar(255), not uuid.
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  instance_id uuid NULL,
  id bigserial NOT NULL,
  token varchar(255) NULL,
  user_id varchar(255) NULL,
  revoked boolean NULL,
  created_at timestamptz NULL,
  updated_at timestamptz NULL,
  parent varchar(255) NULL,
  session_id uuid NULL,
  CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT refresh_tokens_token_unique UNIQUE (token),
  CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES auth.sessions (id) ON DELETE CASCADE
);

-- The JWT helpers, as Supabase defines them: PostgREST sets
-- request.jwt.claims (and older versions request.jwt.claim.<name>).
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

-- ---------------------------------------------------------------- storage
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text NOT NULL,
  name text NOT NULL,
  owner uuid NULL,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  public boolean NULL DEFAULT false,
  avif_autodetection boolean NULL DEFAULT false,
  file_size_limit bigint NULL,
  allowed_mime_types text[] NULL,
  owner_id text NULL,
  CONSTRAINT buckets_pkey PRIMARY KEY (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bname ON storage.buckets (name);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bucket_id text NULL,
  name text NULL,
  owner uuid NULL,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  last_accessed_at timestamptz NULL DEFAULT now(),
  metadata jsonb NULL,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text NULL,
  owner_id text NULL,
  user_metadata jsonb NULL,
  CONSTRAINT objects_pkey PRIMARY KEY (id),
  CONSTRAINT "objects_bucketId_fkey" FOREIGN KEY (bucket_id) REFERENCES storage.buckets (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bucketid_objname ON storage.objects (bucket_id, name);

ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1:array_length(_parts, 1) - 1];
END
$$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END
$$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  _parts text[];
  _filename text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _filename;
  RETURN reverse(split_part(reverse(_filename), '.', 1));
END
$$;

-- ---------------------------------------------------------------- cron
-- pg_cron is not installed (pg_extension has no row, as on a project without
-- it), but the schema and cron.schedule() exist so a migration that calls it
-- unguarded still replays. Jobs are recorded, never run.
CREATE TABLE IF NOT EXISTS cron.job (
  jobid bigserial NOT NULL,
  schedule text NOT NULL,
  command text NOT NULL,
  nodename text NOT NULL DEFAULT 'localhost',
  nodeport integer NOT NULL DEFAULT 5432,
  database text NOT NULL DEFAULT current_database(),
  username text NOT NULL DEFAULT current_user,
  active boolean NOT NULL DEFAULT true,
  jobname text NULL,
  CONSTRAINT job_pkey PRIMARY KEY (jobid),
  CONSTRAINT jobname_username_uniq UNIQUE (jobname, username)
);

CREATE OR REPLACE FUNCTION cron.schedule(job_name text, schedule text, command text)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES (job_name, schedule, command)
  ON CONFLICT (jobname, username) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END
$$;

CREATE OR REPLACE FUNCTION cron.schedule(schedule text, command text)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO cron.job (schedule, command) VALUES (schedule, command) RETURNING jobid
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_name text)
RETURNS boolean
LANGUAGE sql
AS $$
  WITH d AS (DELETE FROM cron.job WHERE jobname = job_name RETURNING 1) SELECT count(*) > 0 FROM d
$$;

CREATE OR REPLACE FUNCTION cron.unschedule(job_id bigint)
RETURNS boolean
LANGUAGE sql
AS $$
  WITH d AS (DELETE FROM cron.job WHERE jobid = job_id RETURNING 1) SELECT count(*) > 0 FROM d
$$;

-- ---------------------------------------------------------------- realtime
DO $$
BEGIN
  CREATE PUBLICATION supabase_realtime;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ---------------------------------------------------------------- privileges
-- Schema usage as on a Supabase project.
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;

-- Supabase's default privileges: every table, sequence and function that
-- postgres creates in public is granted DIRECTLY to the API roles. RLS (and a
-- REVOKE in the migration) are what keep anon and authenticated out.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Storage tables are reachable by the API roles, subject to RLS.
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT ON storage.buckets TO anon, authenticated;
GRANT ALL ON storage.buckets, storage.objects TO service_role;

-- The JWT helpers are callable by everyone (PUBLIC keeps EXECUTE on them).
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role(), auth.email(), auth.jwt() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text), storage.extension(text) TO anon, authenticated, service_role;
