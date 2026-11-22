# STORM blueprint build-out

These documents hold the specification, decisions and work queue for rebuilding STORM. The target is the two-level fleet/vessel operating model analysed in the blueprint, delivered with STORM's own Abyss design system.

| File | What it is |
|---|---|
| [`MASTER-PROMPT.md`](MASTER-PROMPT.md) | The continuous build loop. Point a Claude Code session at it to keep building. |
| [`BUILD-PLAN.md`](BUILD-PLAN.md) | Phased work queue, file ownership per lane and stream, and the progress tracker. |
| [`DECISIONS.md`](DECISIONS.md) | Binding decisions. These override the gap docs wherever they disagree. |
| [`gap/00`](gap/00-storm-architecture-and-conventions.md) | Architecture, conventions, migration and type rules, merge-conflict hotspots. |
| [`gap/01`](gap/01-foundations-tenancy-roles.md) | Tenancy, Fleet/Vessel scopes, roles and permissions. |
| [`gap/02`](gap/02-fleet-view-operations.md) | Fleet view operations: dashboard, tracker, reports, calendar, documents, forms, training, medical, visits, employment. |
| [`gap/03`](gap/03-fleet-view-administration.md) | Fleet view administration: users & access, notifications, support, FAQs, add-ons, vessel settings, GDPR, account, security. |
| [`gap/04`](gap/04-vessel-crew.md) | Vessel Crew. |
| [`gap/05`](gap/05-vessel-safety-sms.md) | Vessel Safety / SMS. |
| [`gap/06`](gap/06-vessel-certificates-technical.md) | Vessel Certificates and Technical. |
| [`gap/07`](gap/07-vessel-voyage-charter-calendar-reports.md) | Vessel voyage, charter, calendar and reports. |
| [`gap/08`](gap/08-cross-cutting-engines.md) | Cross-cutting engines (records, signatures, sign-off, threads, uploads, exports, notifications, calendar). |
| [`gap/09`](gap/09-support-ticket-pain-points-and-known-gaps.md) | Support-ticket pain points and known gaps. |
| [`gap/10`](gap/10-design-system-and-ia.md) | The Abyss design system and the target information architecture. |
| [`gap/99`](gap/99-critic-review.md) | Completeness critic review of the series. |

Each gap doc follows the same structure: Scope, Target IA, Feature inventory, Workflows & state machines, Data model, Improvements over the reference, Implementation notes and Open questions. Blueprint sections are cited as `§n.n` and support tickets as `T-n`. The source material stays outside the repo.
