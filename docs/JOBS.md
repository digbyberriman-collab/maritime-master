# Scheduled jobs

Every recurring job STORM relies on, who owns it and what the owner has to do to run it (gap/00 F3; D-232, D-239; platform-prep PP4). The rule for every job: it runs from the server (a service-role function or a database schedule), it reports what it did as counts, and a job whose function is not in the database yet reports `not applied` rather than pretending it ran (D-01).

## The daily sweeper: `hr-daily-sweeper`

`supabase/functions/hr-daily-sweeper/index.ts` calls each sweep below, in this order, once per invocation. Each is a service-role RPC with only defaulted arguments (`p_today date DEFAULT current_date` for the stream sweeps), so the sweeper calls it with none.

The answer is JSON: `{ ok, ran_at, results, failed? }`. Each `results` entry is the sweep's count, its JSON object of counts, `not applied` (the function is not in the database yet: PostgREST `PGRST202`, or a `42883` that names that very function) or `error: …`. Any error (including a `42883` raised inside an existing body, D-239, or an answer that is neither a count nor a JSON object) makes `ok` false and the status 500, so the scheduler sees the failure; the sweeps after it still run. `not applied` is not a failure.

| Order | Sweep | Owner file | What it does | Returns |
|---|---|---|---|---|
| 1 | `crew_assignments_end_stale` | `supabase/migrations/20261123010300_platform_crew_assignment_guard.sql` | Ends crew assignments whose leave or end date has passed (`is_current = false`), so legacy readers stop granting reach (D-227). | count |
| 2 | `expire_invitations` | `supabase/migrations/20261123010200_platform_user_invitations.sql` | Live invitations past `expires_at` become expired; access an unaccepted invitation opened is withdrawn (D-228). | count |
| 3 | `hr_expire_overrun_contracts` | `supabase/migrations/20260917190000_hris_review_fixes.sql` (body), first `20260917113000_hris_phase1_followups.sql` | Contracts past their end date move to expired. | count |
| 4 | `hr_expire_disciplinary_records` | `supabase/migrations/20260917190000_hris_review_fixes.sql` (body), first `20260917130000_hris_phase3_performance.sql` | Lapsed disciplinary warnings expire. | count |
| 5 | `hr_archive_due_records` | `supabase/migrations/20260917190000_hris_review_fixes.sql` (body), first `20260917150000_hris_phase5_retention.sql` | Archives HR records past their retention date (auto-archive policies). | count |
| 6 | `hr_generate_alerts` | `supabase/migrations/20260919150000_fix_hr_generate_alerts_uuid.sql` (body), first `20260917140000_hris_phase4_recruitment_onboarding_rtw.sql` | Raises, refreshes and dismisses HR alerts (contracts, probation, passports, visas, medicals, certificates, work authorisations, reviews, objectives). | count |
| 7 | `crew_document_expiry_sweep` | X1 Crew, slice X1-05 (`supabase/migrations/2026112406…_crew_document_verification.sql`) | Crew document notices at window entry, 30 days, 7 days and the expiry day; one digest per recipient per day; muted rows and ended assignments skipped. | counts (jsonb) |
| 8 | `work_rest_send_due_reminders` | X1 Crew, slice X1-08 (`2026112406…`) | Automatic hours of rest reminders: the 1st of the month for last month, the sign-off day, N days before cut-off. | counts |
| 9 | `frp_periods_extend_open` | X1 Crew, slice X1-09 (`2026112406…`) | Extends end-unknown planner periods day by day (materialised through today + 30). | count |
| 10 | `crew_transfers_complete_due` | X1 Crew, slice X1-11 (`2026112406…`) | Completes scheduled transfers on their sign-on date and stamps compliance on the destination. | counts |
| 11 | `fleet_ops_daily_sweep` | X5 Fleet operations, slice X5-09 (`supabase/migrations/20261124040800_fleet_daily_sweep.sql`) | Fleet document acknowledgements (due in three days, overdue, the Monday digest) and, on Mondays, training applications waiting more than seven days. Dedupes per day, so a second run sends nothing new. | `{documents_due_soon, documents_overdue, digests, training_stale, skipped}` |

Rows 7 to 11 read `not applied` until their stream file is applied; adding one needs no change to the sweeper (it already lists them). A new sweep is added here and in `SWEEPS` in the same change, with its row in `supabase/functions/hr-daily-sweeper/index.test.ts`.

### Owner action: schedule the sweeper daily

The sweeper runs only when something calls it. Until the owner schedules it, none of the sweeps above happen (expiry notices, reminders, transfer completion and invitation expiry included).

1. Set the secret `HR_SWEEPER_SECRET` on the project (Edge Functions secrets) to a long random value, or use the service-role key.
2. Schedule a daily `POST` to `https://<project-ref>.functions.supabase.co/hr-daily-sweeper` with `Authorization: Bearer <HR_SWEEPER_SECRET>`, once a day in the early morning UTC (for example 03:00, after midnight in most fleet time zones): Supabase scheduled functions, a GitHub Actions `schedule`, or any uptime monitor that can send a header. `verify_jwt` is off for this function (`supabase/config.toml`); it checks the bearer itself, in constant time.
3. Alert on a non-200 answer. The body names each failed sweep (`failed`) and its error.

## Other schedules

| Job | Owner file | Schedule | Owner action |
|---|---|---|---|
| `hr-expire-contracts`, `hr-expire-disciplinary`, `hr-archive-due-records`, `hr-generate-alerts` (pg_cron) | the HRIS files above | registered only where `pg_cron` is installed (00:15, 00:20, 00:40, 05:30 UTC) | None when the daily sweeper runs: the sweeper calls the same functions. Running both is harmless (each is idempotent). |
| `legal-generate-alerts` (pg_cron) | `supabase/migrations/20260919120000_legal_module.sql` | hourly at :15 where `pg_cron` is installed | Install `pg_cron` or call `legal_generate_alerts()` from a scheduler. |
| `process_notification_outbox(integer)` | `supabase/migrations/20261123030000_platform_notification_outbox.sql` | not scheduled (each event fans out inline; this retries rows whose fan-out failed) | Optional: schedule it every few minutes with the service role once notifications matter (gap/03 C3). |
| Export builder (`export_job_transition`) | `supabase/migrations/20261123020400_platform_export_jobs.sql` | none yet | None: no server export builder exists, so a requested server export stays `requested` and the UI says "Queued" (no fake completion). |
