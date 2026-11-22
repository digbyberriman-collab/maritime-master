# Blueprint build-out: decisions register

> **Status:** binding. This register resolves every contradiction, coverage gap and open question raised by the gap series (`gap/00`–`gap/10`) and the critic review (`gap/99`).
>
> **Precedence:** where this register and a gap doc disagree, **this register wins**. Where a gap doc and the code disagree on a *fact*, the code wins and the gap doc is corrected. Product decisions marked **(PO)** are defaults chosen so the build can proceed. The product owner can overturn any of them by editing the row; the build agent then follows the edit.
>
> **IDs:** `C`, `R`, `G` and `S` items come from `gap/99`. `D-*` items are new decisions.

---

## 1. Design system anchors (overrides `gap/10` §A.1)

The Abyss / Deep / Slate / Drift / Signal vocabulary already exists in the product family. Its anchor values are set by the sibling app's `src/styles.css`, as recorded in `docs/permissions/addenda/landlord-ledger.md`. `gap/10` invented its own anchors (Signal `#2ed4ea`, Abyss `#080e16`). **Those are replaced.** `gap/10`'s structure stays: semantic mapping, type scale, elevation, focus, motion, density, status pills and the restyle plan. Every step is rebuilt around these anchors:

| Family | Anchor (dark theme role) | Hex | HSL | Notes |
|---|---|---|---|---|
| **Abyss** | page background, top bar | `#0A0E14` | `216 33% 6%` | `abyss-900`; sidebar `abyss-950` ≈ `216 35% 4%` |
| **Deep** | cards, tables, panels | `#111722` | `219 33% 10%` | `deep-900`; popovers/dialogs one step lighter |
| **Slate** | raised surfaces, borders, inputs | `#1C2533` | `217 29% 15%` | `slate-800`; Tailwind key `slate-ui` (avoid clashing with Tailwind's `slate`) |
| **Drift** | secondary text, muted UI | `#8A94A6` | `219 14% 60%` | `drift-400` = `muted-foreground`; 6.3:1 on Abyss, 5.9:1 on Deep |
| **Signal** | primary accent, focus, active nav | `#00AFE6` | `194 100% 45%` | `signal-500` = `primary` on dark (7.6:1 on Abyss). **Text on a Signal fill is Abyss, never white** (white is 2.5:1). Light theme primary is `signal-700` ≈ `197 100% 28%` (`#00648F`, 6.5:1 on white, white text passes) |

Rules:

- **D-DS1. Dark is the default theme.** Light ("Daylight") is optional, per user. The sidebar stays dark in both themes (resolves `gap/10` open question 2).
- **D-DS2. Status hues are separate from Signal.** Keep `gap/10`'s Ok, Warn, Danger and Info families. Re-check AA for each against the new Deep anchor.
- **D-DS3. Fonts.** Inter for UI, Barlow Semi Condensed for display (page titles, KPI values, vessel names in the scope control) and JetBrains Mono for references and coordinates. Load them from Google Fonts with `preconnect` and `display=swap`. Do not add `@fontsource` packages yet: Lovable installs with bun and CI with npm, and a dependency change has to update both lockfiles. Revisit this when offline/VSAT hardening starts (D-14).
- **D-DS4. Tenant brand colour never replaces Signal.** It is used only for the logo plate edge and PDF accents (`gap/10` open question 1).
- **D-DS5. Inkfish branding stays only where it is today:** the footer and watermark components. Their text becomes tenant-driven later (S1). Inkfish document palettes do not apply to STORM UI.

## 2. Data model contradictions (C1–C22)

| ID | Decision |
|---|---|
| C1 | **One non-crew person directory**, `external_people`, owned by `gap/02`. It has its own capability-based RLS. `person_identity_documents` holds passport and ID data, which is T3. `guest_stays` and `vessel_visits` FK to `external_people`. `hw_people` gains a nullable `external_person_id` for clinical use only. `gap/07` drops its `hw_people` extension. |
| C2 | **Vessel flags (owned by `gap/01`):** `lifecycle_status ∈ {active, inactive, archived}`, `is_counted bool`, and `vessel_purpose ∈ {operational, demo, training}`. `is_demo`, `is_training` and `is_counted_in_fleet` are not created. |
| C3 | **Feature flags** use `gap/09`'s shape: `feature_flags(key PK, state)` plus `account_feature_flags(company_id, flag_key, …)`. |
| C4 | **Client errors** use `client_error_groups` and `client_error_occurrences` (`gap/09`), in-house. No third-party monitoring sub-processor for now (`gap/00` open question 5). |
| C5 | **Expiry buckets.** `expiry_bucket()` is owned by `gap/02`. Buckets are window-relative: `expired`, `expiring_soon` (≤ 30 days), `expiring` (inside the type's window), `valid` and `no_expiry`. Windows live only in `expiry_window_rules`, keyed by item type or `certificate_type_id`. `certificate_types.expiring_windows` is not created. UI labels: "Expired", "≤ 30 d", "Due ≤ window", "Valid". |
| C6 | `form_templates.area` is the module area enum. A new `form_kind ∈ {form, checklist, register, passage_plan, permit, …}` carries `gap/06`'s meaning. The company step is `company_step ∈ {none, acknowledge, sign_off}` everywhere. `company_signoff` is not used. |
| C7 | **Attachments.** New domains use `file_objects` and `record_attachments` (`gap/08`) from day one. Domain-specific columns go on the link row or a thin side table. Path: `<company>/<vessel or fleet>/<module>/<entity_type>/<entity_id>/<file>`. Per-domain buckets stay. |
| C8 | `record_events`, `record_attachments` and a generic `record_links` replace the safety-specific copies. `safety_record_notifications` stays as a safety-only table on the envelope. `gap/06` `job_activity` becomes thread entries plus `record_events`. |
| C9 | **Signatures.** Voyage reports wait for `gap/08` signature slots. There is no `voyage_report_signatures` table. Hours-of-rest signatures move to `record_signatures` behind a compatibility view (SIG18). |
| C10 | **Exports:** `export_jobs` and `export_downloads` (`gap/08`) only. GDPR exports and report exports are `kind` values. |
| C11 | The calendar feed is `calendar_feed()`. The column is `time_zone`. |
| C12 | There is one report registry, `src/modules/reports/registry.ts`, with a `scope: 'fleet' \| 'vessel'` flag. |
| C13 | Enablement, labels and "on from" dates live only in `vessel_module_settings`. Typed configuration lives in `vessel_<module>_settings` tables, not jsonb. `smm_visible` is not created. |
| C14 | Keep the live `companies.client_display_name`, `client_logo_url` and `brand_color`. Add `client_logo_dark_file_id` and `footer_tagline`. Logos and seals are `file_objects` FKs. Uploads use `gap/08`'s allow-list, plus SVG for tenant logos only. |
| C15 | There is one entitlement helper, `has_vessel_entitlement(vessel, entitlement_key)`. `gap/03` owns it and `has_capability` calls it. |
| C16 | `gap/01` defines both `user_vessel_reach(user) → setof uuid` and `user_can_reach_vessel(user, vessel) → bool`. RLS uses the boolean. |
| C17 | External viewer tokens come from `user_invitations` plus `account_memberships(kind='external')`. `technical_viewers` holds scope only. |
| C18 | Medical cases use `gap/05` `medical_cases`. The patient FK follows C1. |
| C19 | **DPA is a flag** (`is_dpa`) on the membership, not a job role. Seed 11 job roles. |
| C20 | **Vessel codes** are stored upper case (`^[A-Z]{3}$`), used lower case in URLs and resolved case-insensitively. Until the `vessels.code` column is live, the client derives codes deterministically (see D-03). |
| C21 | **Reference format:** `TYPE-VSL-YYYY-NNN`, e.g. `PTW-DRA-2026-061`. Voyages keep `VSL-YYYYMMDD-NNN`. Fleet-level records with no vessel use `TYPE-YYYY-NNN`. `format_reference()` is owned by `gap/01`. All examples in the docs and the command palette follow this format. |
| C22 | **Positions seed:** a STORM-authored list that maps each position to a department, a rank tier and a default Access Set. `gap/04` owns it. It is not copied from the reference. |

## 3. Routes and IA (R1–R9)

| ID | Decision |
|---|---|
| R1 | **`gap/10` is canonical for nav grouping.** Fleet sidebar groups: OVERVIEW, COMPLIANCE, PEOPLE, WORKSPACES, ADMINISTRATION, CONFIGURATION. Domain docs keep their route tables only. |
| R2 | `/fleet/planner?tab=crew\|season` is one page. `gap/04` owns the shell and the crew tab, and `gap/07` owns the season tab. |
| R3 | The feedback inbox is retired into Support. `/admin/feedback` redirects to `/fleet/admin/support?source=quick`. |
| R4 | The Legal workspace stays at `/departments/legal/*`. `/legal/*` remains the public policy pages. |
| R5 | External viewer routes live under `/viewer/...` (`gap/06`). |
| R6 | There is one register: `/fleet/people/:personId`, with tabs for visits and guest stays. |
| R7 | Vessel counterparts use `/v/:vc/...` only. |
| R8 | The legacy redirect target is defined per module doc. `/crew/work-rest` redirects to `/me/hours-of-rest`. |
| R9 | Module docs win on sub-paths. Ticket citations use `T-n`. |

## 4. Coverage gaps (G1–G7)

| ID | Decision |
|---|---|
| G1/G2 | **(PO) Finance is hidden in this programme.** The Finance tab, finance KPI tile and finance flags stay as `status: 'planned'` slots, hidden by default. Expenses, supplier invoices and payroll runs are out of scope. Vacancy steps 2–3 and the candidate form are added to `gap/02` Employment when that stream runs. |
| G3 | Each `vessel_module_settings` key gates exactly one thing: its tab or leaf in the nav, plus its capabilities. `mlc2006` gates the MLC compliance tiles and the HoR MLC rule set. `voice` is not built (D-15). |
| G4 | Add-on seed: Deck Plans (gates `vessel.technical.deck_plans.*`), Recruitment (gates `fleet.employment.recruitment.*`) and Finance (hidden, G1). The Recruitment pages check the entitlement. |
| G5 | The **Departments** and **Finance** vessel tabs are slots with no owner. They are hidden until a page is live. **Logbooks** moves under the vessel tab row with its existing pages; it is a route move only. |
| G6 | See C22. |
| G7 | `gap/08` owns a record-kind table listing key, owning module, whether it is enveloped, company step and slot template. A domain stream registers its kinds there, and status changes go through `record_transition` or a wrapper around it. |

## 5. Status corrections (S1–S3)

- **S1.** The footer is **partial**. It hard-codes the vendor's tagline, support address and copyright. The tenant tagline arrives with C14.
- **S2.** Leave allowance is **partial**. The default is 60 days and 5 per month, and there is no on:off ratio. `gap/04` adds `leave_method` and the ratio columns.
- **S3.** HoR rules are **complete except exceptions**. There is no STCW exception model yet; it is a `gap/04` item.
- **General rule:** any "complete" row whose Gap column is not "—" counts as **partial**.

## 6. Programme decisions (D-*)

| ID | Decision | Resolves |
|---|---|---|
| D-01 | **Lovable stays the publish and DB-apply path.** Repo code goes branch → PR → `main`. Hand-written migrations are idempotent, listed in `supabase/MIGRATIONS-LEDGER.md` and applied by the owner through Lovable or the Supabase SQL editor. **The build never assumes a repo migration is live.** Client code for pending tables uses the typed pending shim (`gap/00` D2) and degrades gracefully when the table is missing (error → `ModuleOff`/`PageEmpty` state, never a crash or mock data). | `gap/00` OQ1, OQ2 |
| D-02 | **URL scope cut-over in one release, with redirects.** `/fleet/*`, `/v/:vesselCode/*`, `/me/*` and the workspaces go live together. Existing page components are mounted under the new paths unchanged. `VesselScopeRoute` sets the selected vessel from the URL, so legacy pages that read `VesselContext` keep working. Old URLs redirect for one release through `legacyRedirects.ts`. | `gap/00` OQ3 |
| D-03 | **Vessel codes before the column exists.** `getVesselCode(vessel)` returns `vessel.code` when present. Otherwise it derives one deterministically: strip the M/Y, S/Y, MY, SY, R/V or RV prefix, take the first three letters and upper-case them. On a collision, ordered by `created_at` then `id`, it falls back to first letter + next two consonants, then first two letters + a digit. The derivation is unit-tested, and the same function seeds the `vessels.code` migration so live codes match. | C20 |
| D-04 | **Ship against the interim `useCan(key)` adaptor.** It maps PMS keys to today's module/level checks. The PMS v1 runtime (`docs/permissions/MASTER-PROMPT.md`) replaces it later without changing call sites. Gates fail closed. | `gap/00` OQ4 |
| D-05 | **Toasts:** `sonner`, behind a `notify` wrapper. The shadcn toast stays mounted until its 150 call sites migrate, which happens module by module and never blocks a stream. | `gap/00` OQ6 |
| D-06 | **Coming Soon leaves are hidden.** Leaves get `status: 'planned' \| 'beta' \| 'live'`. Planned leaves are hidden unless an owner or admin turns on "Show roadmap". Their routes stay, so bookmarks still resolve. | `gap/10` IA10 |
| D-07 | **No reference-product material in the repo.** That covers the blueprint, screenshots, ticket export, brand name, hostname and UI copy. Gap docs cite blueprint sections by `§n.n` and tickets by `T-n`. Seed data and UI copy are written fresh (see the copy items in `gap/99` §3). | — |
| D-08 | **No personal data** from tickets or the blueprint, in code, seeds, tests or docs. Use roles ("Master", "Chief Stew"). Vessel names are tenant identifiers and are allowed in internal docs and test fixtures. | — |
| D-09 | **Workspaces stay.** HRIS, Health & Wellness, Yard (Refit, New Build), Legal and Shoreside keep their trees and shells. They are reached from the Apps menu and the fleet sidebar's WORKSPACES group. | `gap/10` |
| D-10 | **Quality gates per merge:** `npm run lint` with 0 errors and the warning count not above the baseline (ratchet); `npm run typecheck`; `npm test`; `npm run build`. New code adds no `any`. Palette ratchet: hard-coded colour counts may only go down. | `gap/00` I2–I5 |
| D-11 | **Typecheck concurrency.** `tsc` needs an 8 GB heap and the build box has 15 GB, so at most one typecheck runs at a time. Agents wrap it as `flock /tmp/storm-tsc.lock npm run typecheck`. | — |
| D-12 | **Migration blocks** follow `gap/00` §3: platform `00`–`03`, then `04`–`13` per stream. The first build-out day is `20261123`. Every file is idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `ON CONFLICT DO NOTHING`). | `gap/00` §3 |
| D-13 | **Shell remounts.** `DashboardLayout` becomes idempotent through `ShellContext`, so legacy pages can move under layout routes without edits. | `gap/00` B2 |
| D-14 | **Offline at sea** is not in the first release. Keep 30 s staleness and avoid N+1 queries. | `gap/00` OQ7 |
| D-15 | **Voice input** is not built. | `gap/10` OQ8 |
| D-16 | **Lockfiles:** keep both. A dependency change updates `package-lock.json` (npm) and `bun.lock` (bun is installed) in the same commit. | `gap/00` OQ8 |
| D-17 | **Shoreside** becomes one landing page of service cards instead of 8 Coming Soon leaves. | `gap/10` OQ5 |
| D-18 | **Build order** follows `BUILD-PLAN.md`. Phase 0 is serial. After that, streams own disjoint files and never edit the hotspot files listed in `gap/00` §2 outside the platform stream. | `gap/00` §6 |
| D-19 | **Theme on a new device.** The device's `storm-theme` choice always wins once set. With nothing stored, only an explicit `dark` or `light` in `user_preferences.theme` is adopted. Stored `system` rows are ignored, because `system` was the old form's default, not a choice, and adopting it would break D-DS1. Density is stored on the device only (`storm-density`) until `user_preferences.density` exists (Phase 2), and Appearance says so. | Phase 0 A2, A4 |
| D-20 | **Type scale class names are `type-*`** (`type-display`, `type-kpi`, `type-mono`, …), not `text-*`. Stock `tailwind-merge` treats an unknown `text-display` as a colour and drops it next to a real text colour. Renaming to `text-*` needs the twMerge font-size group extended first. | `gap/10` DS7 |
| D-21 | **Status registry calls.** `statusTone()` lives at `src/shared/components/status/statusTone.ts` (the BUILD-PLAN path; `gap/10` named `src/shared/design/`). Envelope `info_requested` is tone `info` (waiting on the vessel, matching whose-move), not purple. Legacy stored `Expiring_Soon` (certificates, training, crew documents; the 90-day alert window) maps to warn "Expiring soon". C5's ≤ 30 d tier applies only to the `expiry` domain and `<ExpiryPill>`. | `gap/10` A.8; C5 |
| D-22 | **Maps.** Basemaps are CARTO `dark_all` (Abyss) and `light_all` (Daylight). Seamarks are an optional overlay; GEBCO bathymetry is not built yet. Vessel marks use one Signal colour and show navigation state by shape (arrow under way, circle moored, ringed circle at anchor); stale fixes are hollow Drift; alerts are a dot on the marker's shoulder. Port kinds use chart-2/3/4; heat levels use success, warning and info. | `gap/10` §A.11 |
| D-23 | **Palette ratchet scope.** It scans `.ts` as well as `.tsx` (colour maps live in `constants.ts` files) and counts `dark:` variants as well as palette classes and hex values. The PDF/email generators and spreadsheet exporters are allow-listed. `DataTable` sorts empty values last in both directions. | D-10; non-negotiable 7 |
| D-24 | **Repeated path segments renamed** (B1): `/yard/refit/compliance/compliance` → `/yard/refit/compliance/overview` and `/yard/new-build/equipment/equipment` → `/yard/new-build/equipment/register`. The old URLs redirect (`Navigate replace`). The New Build equipment leaf id changes with it, so a saved sidebar order for that one leaf falls back to the default. | `gap/00` B7 |
| D-25 | **Vessel code format (amends C20).** D-03's digit fallback can produce codes such as `DR1`, so the P1 column check is `^[A-Z][A-Z0-9]{2}$`, not `^[A-Z]{3}$`. In the consonant step `Y` counts as a vowel (`HYDRA` → `HYD`, then `HDR`). The P1 migration must use exactly the derivation in `src/modules/vessels/lib/vesselCode.ts`, and P1 lands before P3 tightens vessel RLS, because until the column is live every user derives codes over the whole company fleet. | C20, D-03 |
| D-26 | **Fleet reach until memberships exist:** legacy `dpa`/`shore_management`, any `is_fleet_wide` RBAC role, or RBAC `superadmin`/`dpa`/`fleet_master` (`src/app/router/reach.ts`). P2's `account_memberships` replaces it. | `gap/01` F11 |
| D-27 | **Legacy redirects are conditional** (B6). A fleet target applies only with fleet reach. A vessel target needs a vessel, so a fleet user in "All vessels" mode keeps the old page. Nobody loses a page they could open before. `/crew` redirects to the vessel roster (it always rendered the roster). Pages that still hold sample data (permits to work, observations, maintenance critical/defects/spares, company details, integrations) and pages whose target is a tab of an unbuilt page (incidents, CAPA, non-conformities, investigations, audits, meetings, certificate alerts, leave calculator, crew my-dashboard) keep their old URLs until their stream rebuilds them. | D-02; `gap/01` legacy list |
| D-28 | **R3 is deferred.** `/admin/feedback` stays until `/fleet/admin/support` exists (X6), then redirects as R3 says. | R3 |
| D-29 | **Show roadmap** (D-06) is a sidebar-footer switch for owners and admins, stored on the device (`storm-show-roadmap`) until `user_preferences.show_roadmap` exists. | D-06 |

## 7. Copy items to rewrite (from `gap/99` §3)

These are fixed in the gap docs as part of this register:

- `gap/03` FAQ category seed list → STORM's own categories (see the edited doc).
- `gap/05` SMS Forms default template-group names → STORM's own defaults.
- `gap/01` position seed line → points to C22.
