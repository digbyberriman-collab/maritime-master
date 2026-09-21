# Audit configuration (Section 0)

```
PLATFORM_NAME:        STORM (fleet management SaaS; package.json name: vite_react_shadcn_ts)
REPO_PATH:            /home/user/maritime-master (github.com/digbyberriman-collab/maritime-master)
TECH_STACK:           React 18 + Vite 5 + TypeScript 5.8 (strict: false) + Tailwind/shadcn + TanStack
                       Query 5 + Zustand 5 + React Router 6, Supabase (Postgres 17.6, Lovable Cloud
                       managed), deployed via Lovable's own pipeline (not a VPS/Docker deploy for
                       this repo, per supabase/config.toml and the absence of any Dockerfile)
AUTH_MODEL:           Supabase Auth. Four overlapping RBAC systems coexist: profiles.role (6 values:
                       master, chief_engineer, chief_officer, crew, dpa, shore_management — corrected
                       by Phase 2 docs-consistency findings from an earlier "7 values" assumption),
                       user_roles/app_role enum (14 values: superadmin, dpa, fleet_master, captain,
                       purser, chief_officer, chief_engineer, hod, officer, crew, auditor_flag,
                       auditor_class, travel_agent, employer_api), roles/role_permissions, and
                       modules/user_permission_overrides. This overlap is itself a known finding
                       (H-level in the prior audit) — Phase 2.1/2.7 should re-verify, not assume fixed.
DESIGN_SYSTEM:        Verified NOT established in code: tailwind.config.ts uses only generic shadcn
                       HSL CSS-variable tokens (--background, --primary, --success, --warning,
                       --critical, etc.), with no Abyss/Deep/Slate/Drift/Signal tokens anywhere in
                       tailwind.config.ts or src/index.css. Prior mentions of those names in the
                       codebase (recruitment.ts, onboarding.ts, LogbookWorkspace.tsx, etc.) are
                       coincidental word matches, not the design system. Per the protocol's own
                       instruction ("If DESIGN_SYSTEM is undefined, Phase 2.9 should establish one"),
                       Phase 2.9 treats this as undefined and flags/establishes the token system
                       rather than auditing consistency against a system that isn't there yet.
PRIMARY_USER_ROLES:   Operational roles crew hold (profiles.role / app_role): master, chief_officer,
                       chief_engineer, crew, dpa, shore_management, captain, purser, hod, officer,
                       auditor_flag, auditor_class, travel_agent, employer_api, superadmin,
                       fleet_master. What each should see/do is not written down anywhere as a single
                       source of truth — reconstructing and validating that matrix against actual
                       enforcement (UI + RLS) is itself Phase 2.7's job, not an input to it.
KNOWN_PAIN_POINTS:    From docs/SYSTEM-AUDIT-2026-09-19.md (2026-09-19, prior full audit) and PR #31
                       (Phase 2 remediation, in flight): fabricated/mock data on several pages,
                       localStorage-only admin surfaces, three RBAC systems overlapping, strict:false
                       plus ~342 `as any` casts, four unimplemented New Build edge functions
                       (detect-rooms, extract-yard-metadata, index-regulation, index-yard-standard),
                       no monitoring/error reporting configured, sms_* tables now dead/duplicate of
                       form_* tables. Treat all of these as "reported, not necessarily still true" —
                       re-verify rather than copy forward.
OUT_OF_SCOPE:         Do not touch supabase/migrations/* to fix Phase 2 findings directly during
                       Phase 1-4 (discovery/reporting only, per protocol). Do not merge or deploy
                       PR #31 as part of this audit. Do not attempt to fix the ~2925 pre-existing
                       TypeScript errors in src/modules/health/** (Health & Wellness module, merged
                       from main, authored by a different agent/session) as part of this pass — log
                       them as findings only; fixing them is out of scope until the user decides how.
```
