
-- Parallel import tables for crew + vessel data sourced from Airtable export.
-- Named *_import to avoid collision with the existing production `vessels`,
-- `profiles`, and `crew_assignments` tables that the rest of the app uses.

create table if not exists public.vessels_import (
  id           uuid primary key default gen_random_uuid(),
  airtable_id  text unique not null,
  name         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists vessels_import_name_idx on public.vessels_import (name);

create table if not exists public.crew_import (
  id                       uuid primary key default gen_random_uuid(),
  airtable_id              text unique not null,
  crew_id                  integer,
  vessel_airtable_id       text references public.vessels_import(airtable_id) on delete set null,
  vessel                   text,
  first_name               text,
  middle_name              text,
  last_name                text,
  casual_name              text,
  full_legal_name          text,
  preferred_name           text,
  personal_email           text,
  krakenfleet_email        text,
  work_email               text,
  cellular_phone           text,
  whatsapp_signal          text,
  secondary_phone          text,
  date_of_birth            date,
  nationality              text,
  nationality_secondary    text,
  home_city                text,
  home_airport             text,
  repatriation             text,
  role                     text,
  department               text,
  department_secondary     text,
  rotational_position      text,
  crew_type                text,
  is_temporary             boolean default false,
  status                   text,
  is_archived              boolean default false,
  rotational_partner       text,
  couple                   text,
  next_of_kin_name         text,
  next_of_kin_phone        text,
  photo_url                text,
  created                  timestamptz,
  last_modified            timestamptz,
  imported_at              timestamptz not null default now()
);

create index if not exists crew_import_vessel_idx        on public.crew_import (vessel);
create index if not exists crew_import_department_idx    on public.crew_import (department);
create index if not exists crew_import_role_idx          on public.crew_import (role);
create index if not exists crew_import_is_archived_idx   on public.crew_import (is_archived);
create index if not exists crew_import_email_idx         on public.crew_import (krakenfleet_email);

-- Active-only convenience view
create or replace view public.crew_import_active as
  select * from public.crew_import where is_archived = false;

alter table public.vessels_import enable row level security;
alter table public.crew_import enable row level security;

drop policy if exists "vessels_import_read_authenticated" on public.vessels_import;
create policy "vessels_import_read_authenticated"
  on public.vessels_import for select
  to authenticated
  using (true);

drop policy if exists "crew_import_read_authenticated" on public.crew_import;
create policy "crew_import_read_authenticated"
  on public.crew_import for select
  to authenticated
  using (true);
