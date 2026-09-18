# Electronic Logbooks module

The Logbooks page is the Meridian electronic-logbook demonstrator rebuilt inside
Maritime Master: the same 17 templated books, sections, fields, flag profiles
and signing rules, running on Supabase with real authentication instead of the
demo identity picker. Two operational books from the original module (Bell Book,
Visitor & Guest Log) are carried over as single-section templates, so the
workspace holds 19 books.

**Status: prototype. No class, MCA or Cayman approval is held. Attestations are
reviewed statements by authenticated users, not advanced electronic signatures.**

## Where things live

| Path | Purpose |
|---|---|
| `src/modules/logbooks/lib/templates.ts` | 17 books · 103 sections · 604 fields, flag profiles, source references, cover fields, flag differences (ported from Meridian `templates.mjs`) |
| `src/modules/logbooks/lib/catalog.ts` | Book metadata (code, slug, `logbook_type`, icon, author roles, sensor), Bell/Visitor books, approval routes |
| `src/modules/logbooks/lib/formRules.ts` | Field validation, completion, signature policies, countersign / attest / verify / acknowledge rules |
| `src/modules/logbooks/lib/lineLayouts.ts` | Field-to-column mapping for the ruled sheet (`bookColumns`), value normalisation, captured-time retention |
| `src/modules/logbooks/lib/registryRules.ts` | Registry → cover population, particulars prefill, reading freshness, flag → profile default |
| `src/modules/logbooks/lib/roles.ts` | Platform role → logbook capacity mapping (strict onboard) |
| `src/modules/logbooks/lib/telemetry.ts` | Simulated navigation / machinery samples and the restricted RMC parser |
| `src/modules/logbooks/lib/logbookApi.ts` | The only file that talks to Supabase (data-service boundary) |
| `src/modules/logbooks/hooks/` | Actor/capacity, workspace queries and mutations, registry, samples, session-storage working copies, preferences |
| `src/modules/logbooks/components/` | Book strip, masthead, toolbar + Book settings, section tabs, ruled sheet, line rows, signature cell, page review, volume dialogs, print view |
| `src/modules/logbooks/pages/` | Workspace, Vessel registry, Review & sign-off, Records & exports, Connections, Assurance |
| `supabase/migrations/20260917200000_logbook_meridian_enums.sql` | New `logbook_type` values and the `verified` entry status |
| `supabase/migrations/20260917200100_logbook_meridian_books.sql` | Volumes, signatures, pages, registries, samples, entry extensions, guards and RPCs |

Vessel-specific readings sheets (`lib/vesselSheets.ts`, `lib/dagonEngineLog.ts`,
`components/SheetEntryCard.tsx`): the M/Y DAGON engine-room daily log is added
to the Engine book template as an extra section when a volume is opened for a
vessel whose name contains "DAGON". Each sheet is one entry whose cells are
stored under `${sectionId}.${rowKey}.${columnKey}` keys, exactly as the original
form saved them, so it rides the same drafts, signatures, page review, audit
trail and PDF export as every other line. Running-hour differences and present
ROB are calculated on screen and in the printed sheet.

Routes: `/vessel/logbooks` (workspace, defaults to the last opened book),
`/vessel/logbooks/:slug`, `/registry`, `/review`, `/records`, `/connections`,
`/assurance`. `/vessel/logbooks/list` redirects to the workspace.

## Applying the database migration

Both migration files must be applied in order (Lovable → Supabase migrations, or
`supabase db push`). The enum migration is separate because Postgres cannot use a
new enum value in the transaction that adds it. The migration was verified end to
end against a local Postgres 16 with stubbed platform functions: capacity
resolution, RLS, draft validation, signing gates, immutability, countersignature
policies, Master verification, page sealing, correction supersession, volume
closure, continuation, telemetry evidence and override reasons.

Nothing in the existing `logbooks`, `logbook_entries`, `logbook_attachments` or
`logbook_entry_audit` tables is dropped. Entries recorded before volumes existed
stay readable under an "Earlier records" tab in their book.

## Role mapping (strict onboard)

| Capacity | RBAC roles (`user_roles`) | Legacy `profiles.role` |
|---|---|---|
| master | captain | master |
| officer | chief_officer, officer | chief_officer |
| engineer | chief_engineer | chief_engineer |
| steward (crew witness) | crew, purser, hod | crew |
| none (read / export only) | superadmin, dpa, fleet_master, auditors | dpa, shore_management |

Only the Master opens, continues and closes volumes, maintains the registry,
verifies records, seals pages and attests external witnesses (mother, surveyor,
port official) by recording the witness's name against the paper signature.
The same mapping is enforced in `public.logbook_capacity()` server-side.

## What the database enforces

* A volume pins its template snapshot, flag profile, cover and registry
  revision. Covers cannot be updated; continuations copy the predecessor's
  template edition.
* Every entry stores the section schema it was written against; unknown keys,
  out-of-range numbers, bad options and future event times are rejected on
  insert/update. Line numbers are assigned per volume and section.
* Signed content is immutable. Only the RPCs (`logbook_sign_entry`,
  `logbook_seal_page`, `logbook_close_volume`) can change status or linkage, and
  they check role capacity, optimistic versions, completeness (including
  conditional requirements) and signature policies.
* Digests are SHA-256 over the canonical entry content, computed in Postgres at
  signing; page digests fix the ordered list of entry digests.
* A correction only supersedes its original once all required signatures are
  present, so the last signed record is never hidden by an unsigned correction.
* Captured samples must be fresh (≤ 2 min, ≤ 5 s clock lead) when attached,
  stay attached, and changed captured values require an explanation.

## What is simulated or not implemented

* **Connections** captures simulated or pasted NMEA samples. There is no live
  AMCS/NMEA gateway, onboard service or offline synchronisation queue. Unsaved
  row copies are kept per user in session storage for tab recovery only.
* Attestations are not advanced electronic signatures; there is no external
  anchor for digests. Retention, backups and restore drills are platform
  concerns outside this module.
* Print output uses browser pagination; page numbers identify fixed groups of
  signed records, not publisher pages.
* Exact current publisher facsimiles and amended statutory schedules remain
  release requirements — see the Assurance page for the sourced gap list.

## Checks run

`npm run lint`, `npm run typecheck` (12 pre-existing duplicate-identifier
errors in the generated Supabase types are unrelated), `npm test` (lib and
component tests for the module), `vite build`, and the SQL workflow test
against a local Postgres 16.
