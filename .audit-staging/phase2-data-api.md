# Phase 2 — Data/API Layer Audit (TanStack Query, hooks, mutations)

Scope: client-side data layer only (query config, query keys/invalidation, N+1 patterns,
mutation error handling, pagination, and direct writes bypassing an available safer RPC).
Read-only pass; nothing on disk was changed except this report.

Not re-reported here (already logged in Phase 1): the dead `next_reference` RPC, the
`rf_*` refit missing-tables issue, and the health-module `types.ts` gap.

---

### [DATA-API] — Certificate renewal is three unguarded writes, not a transaction
Severity: High
Location: src/modules/certificates/hooks/useCertificates.ts:236-285 (`renewCertificate` mutationFn)
Description: Renewing a certificate does three sequential Supabase calls against the same table: (1) `update({status:'Superseded'}).eq('id', oldId)`, (2) `insert(...)` the new certificate, (3) `update({superseded_by: newCert.id}).eq('id', oldId)`, then a fourth insert for the new alert schedule. Steps 1 and 3 discard the `{error}` result entirely (not even assigned to a variable), so if either fails the function does not throw and keeps going. There is no DB transaction or SECURITY DEFINER function wrapping the sequence (contrast with the `next_reference_value`/trigger pattern already used elsewhere in this codebase for atomic numbering).
Impact: A failure between steps 1-3 (RLS denial, network blip, constraint violation) leaves the certificate register in an inconsistent state that nothing detects: e.g. step 1 fails silently → both the old and new certificate show as active for the same statutory requirement (a real compliance problem for a maritime certificate tracker), or step 2 fails after step 1 succeeded → the vessel/crew member is left with zero active certificate of that type and no error was ever surfaced to the user (`onSuccess` still fires the "Certificate renewed" toast in the surrounding hook because the caller never sees the swallowed error from steps 1/3).
Suggested fix: Wrap the whole renewal (mark old superseded, insert new, link `superseded_by`, seed alerts) in one SECURITY DEFINER Postgres function (mirroring `form_sign_submission` / the `next_reference_value` trigger pattern) so it either fully succeeds or fully rolls back, and check the `error` on every one of the current four calls in the meantime.

### [DATA-API] — Documents module still generates document numbers client-side via count+1 (the exact anti-pattern already fixed elsewhere)
Severity: High
Location: src/modules/documents/hooks/useDocuments.ts:161-172 (`generateDocumentNumber`, called from `uploadDocument` at line 181)
Description: `generateDocumentNumber()` runs `SELECT count(*) FROM documents WHERE company_id = ...` then formats `STORM-DOC-<year>-<count+1 padded>`. This is the same "count-based, browser-side sequential number" pattern that migration `20260919220000_reference_numbers.sql` documents as finding H5 and explicitly fixed for `audits`, `drills`, and `audit_findings` by moving numbering into a `next_reference_value(scope)` SECURITY DEFINER function called from a BEFORE INSERT trigger (serialized on a `reference_counters` row so concurrent inserts can't collide). No equivalent trigger exists for `documents`, so the old race survives in this one module: two users uploading a document in the same company at the same moment can both compute the same `count`, producing two documents with the identical `document_number` (no unique constraint was found on `documents.document_number` in the migrations either, so the collision would not even be rejected by the DB).
Impact: Duplicate/non-unique document numbers in the ISM/SMS master document index — the same failure mode the H5 fix was written to eliminate for audits/drills, left in place for Documents.
Suggested fix: Add a `documents_set_number()` BEFORE INSERT trigger calling `next_reference_value('documents:' || company_id || ':' || year)`, following the exact pattern of `audits_set_number()` in `20260919220000_reference_numbers.sql`, and delete the client-side `generateDocumentNumber()`.

### [DATA-API] — Drag-to-reschedule on the itinerary Planning Grid fails completely silently
Severity: Medium
Location: src/modules/itinerary/components/PlanningGrid.tsx:243-245 (`handleDateChange`) and src/modules/itinerary/hooks/useItinerary.ts:96-218 (`useCreateEntry`, `useUpdateEntry`, `useUpdateEntryVessels`, `useDeleteEntry`)
Description: None of the four mutations in `useItinerary.ts` define an `onError` handler (0 of 4, versus every other sampled hooks file having onError on all-but-trivial mutations). Most call sites compensate by wrapping `mutateAsync` in their own try/catch with a toast (`CreateEntryModal.tsx`, `EntryDetailPanel.tsx`), but `PlanningGrid.tsx:244` calls `updateEntry.mutate({ id: entryId, start_date: newStart, end_date: newEnd })` — fire-and-forget, no `await`, no `.catch`, no `isError` check anywhere nearby.
Impact: When a user drags an itinerary entry to a new date and the write fails (RLS, network, validation), nothing tells them it failed — no toast, no console surfaced to the user, no rollback of the drag position's visual state beyond whatever the next background refetch happens to show. The schedule silently diverges from what the crew/office believes was saved.
Suggested fix: Add a shared `onError` to the hooks in `useItinerary.ts` (toast + log), and change `PlanningGrid.tsx`'s `handleDateChange` to use `mutateAsync` with a catch (or revert the optimistic position) so a failed reschedule is visible.

### [DATA-API] — Document detail cache is never invalidated by the workflow mutations that change it
Severity: Medium
Location: src/modules/documents/hooks/useDocuments.ts:132-154 (`useDocument`, key `['document', documentId]`) vs. src/modules/documents/hooks/useDocumentWorkflow.ts:136-282 (`submitForReview`, `approveDocument`, `rejectDocument`, `approveImmediately` — all invalidate only `['documents']` and `['pending-reviews']`) and useDocuments.ts:227-269 (`uploadDocument`/`updateDocument`, same).
Description: TanStack Query key matching is prefix/hierarchical: invalidating `['documents']` correctly refreshes every query keyed `['documents', ...]` (the list view), but it does **not** touch a differently-rooted key `['document', documentId]` (singular). `ReviewQueue.tsx:49` calls `useDocument(selectedDocumentId)` to drive its preview panel while approving/rejecting a document, but none of the four workflow mutations (nor `updateDocument`) ever invalidate `['document', ...]`.
Impact: After approving or rejecting a document from the Review Queue, the preview panel keeps showing the pre-approval status/content for up to the default 30s staleTime (or indefinitely if the component stays mounted and nothing else triggers a refetch) — the reviewer sees a document that looks unapproved/unrejected immediately after acting on it.
Suggested fix: Have the four workflow mutations (and `updateDocument`) also invalidate `['document', documentId]` for the specific id involved, the same way `useLegalRequests.ts`'s `invalidate(id)` helper does it for both the list and detail keys.

### [DATA-API] — No pagination on tables that will grow without bound; combined with polling on one of them
Severity: Medium
Location: src/modules/crew/hooks/useCrew.ts:198-238 (main crew list query), src/modules/incidents/hooks/useIncidents.ts:120-160 (main incidents list query), src/modules/notifications/hooks/useNotificationCenter.ts:44-90 (`alerts`/`maintenance_tasks` queries)
Description: None of these three list queries use `.range()` or `.limit()` — each fetches every row matching the company/vessel filter in one request, ordered client-side-friendly but with no server-side cap. `useNotificationCenter` additionally sets `refetchInterval: 30_000`, so the unbounded alerts+tasks query set re-runs every 30 seconds for every active session.
Impact: As a fleet's incident log, crew roster, or open-alerts backlog grows over the life of the SaaS product, these views degrade from "fetch everything" to "fetch everything, repeatedly, every 30 seconds" for the notification center — increasing response time, payload size, and DB load on every page view/poll tick, worst on a ship's slow satellite link.
Suggested fix: Add `.range(offset, offset + pageSize - 1)` (or cursor pagination) to the incidents and crew list queries with a UI pager/virtualized list, and cap the notification center's queries with `.limit(n)` plus narrower `.select()` fields, especially given its 30s polling cadence.

### [DATA-API] — Sequential single-row inserts in import/bulk-save loops (client-side N+1 writes) with a misleading success count
Severity: Medium
Location: src/modules/crew/pages/admin/DocumentUploadPage.tsx:176-197 (`saveDocuments`); same pattern in src/modules/new-build/pages/Import.tsx:158-175 and src/modules/new-build/pages/Requirements.tsx:198-214; and src/modules/health/hooks/usePhysio.ts:427-448 (`syncItems`, per-row `.update()` in a `for` loop)
Description: `saveDocuments()` loops `for (const file of successfulFiles) { await supabase.from('crew_travel_documents').insert({...}) }` — one round-trip per row instead of a single `.insert([...])` array call, and each row's error is caught individually with only `console.error`. After the loop, it unconditionally toasts `` `${successfulFiles.length} document(s) saved successfully` `` using the count of files that reached the "extracted" client-side state, not the count that actually inserted without error.
Impact: N inserts take N round trips instead of 1 (slow on the same satellite links this fleet-management product runs over), and if some rows fail mid-loop the user is told all of them succeeded — failed travel-document uploads disappear with no record and no accurate feedback.
Suggested fix: Replace the loops with a single batched `.insert(rows)` (Supabase/PostgREST accepts an array) and derive the success toast from the actual returned/error-checked result count, not the pre-loop candidate count.

### [DATA-API] — Document approval workflow re-implements ISM-forms-style status transitions entirely client-side, with no equivalent server-side guard
Severity: Medium
Location: src/modules/documents/hooks/useDocumentWorkflow.ts:153-209 (`approveDocument`)
Description: `approveDocument` fetches `reviewer_id`/`approver_id`, computes in JavaScript whether the current user is the final approver (`isFinalApprover = isApprover || (isReviewer && !doc.approver_id)`), and then does a direct `.update({status:'Approved', approved_date, issue_date})` if so, or silently no-ops the DB (`return {action:'forwarded'}` — no write at all) otherwise. This is the same shape of problem the `sign-submission` PIN check and `form_sign_submission` migration were written to solve for ISM forms: who-may-transact-which-transition logic living in the browser instead of in a SECURITY DEFINER function, so it can be replayed with a forged/adjusted client without whatever server-side check (or lack thereof) actually gates it. There is no `document_approve`/`document_review_action`-style RPC in the current function inventory for this module to have used instead — it was simply never built the way `form_sign_submission` was for forms.
Impact: Any RLS gap on `documents` UPDATE (not itself re-checked here, that's the auth-security lens) is the only thing standing between "logged-in user" and "approve any document," because the reviewer/approver eligibility check is advisory JS, not enforced by the write path itself.
Suggested fix: Introduce a `document_workflow_transition(document_id, action)`-style SECURITY DEFINER RPC that re-derives reviewer/approver eligibility from the row itself (as `form_sign_submission` does for forms) and performs the status write, replacing the four direct `.update()` calls in this file.

### [DATA-API] — `acknowledgeAlert` mutation has no error handling
Severity: Low
Location: src/modules/certificates/hooks/useCertificates.ts:334-355
Description: Unlike every other mutation in the same file (`addCertificate`, `updateCertificate`, `renewCertificate`, `deleteCertificate` all have matching `onError` toasts), `acknowledgeAlert` defines only `onSuccess`.
Impact: If acknowledging a certificate-expiry alert fails (RLS, network), the user sees no toast and no indication the click did nothing — the alert stays in the unacknowledged list with no explanation, and nothing here is compensated by a caller-side try/catch (component simply calls `.mutate(alertId)`).
Suggested fix: Add the same `onError` pattern used by the file's other four mutations.

### [DATA-API] — `staleTime` overrides are tuned ad hoc per hook rather than through shared tiers
Severity: Cosmetic
Location: src/App.tsx:16-26 (global default `staleTime: 30_000`, `retry: 1`, mutation `retry: 0`) vs. 90+ per-hook overrides scattered from 5s to 5 minutes, e.g. src/modules/health/hooks/usePtPrograms.ts:255,433,613,635 (30s/15s/5s/5s in one file) and src/modules/hris/hooks/useHrDashboard.ts (nine different overrides, mostly 60s, one 30s, one 5min, in one file)
Description: The global default itself is reasonable and well-reasoned (comment in App.tsx explains the 30s/retry:1 choice). No hook overrides `gcTime`/`cacheTime` or `refetchOnWindowFocus`, and no mutation overrides `retry` upward — so there's no risk of retried non-idempotent writes. The only inconsistency is `staleTime`, freely re-picked per query (sometimes per query within the same file) with no shared naming (`REALTIME_STALE = 5_000`, `SLOW_STALE = 5*60_000`, etc.) to anchor the choice.
Impact: Low on its own, but it makes it hard to tell, by reading a given hook, whether a short staleTime (e.g. 5s in `usePtPrograms.ts`'s live workout logger) was a deliberate choice for a fast-changing view or an arbitrary pick copied from a neighboring hook — increasing the chance a future edit picks an inappropriate value for a given query's actual volatility.
Suggested fix: Extract 2-3 named staleTime tiers (e.g. `STALE_LIVE`, `STALE_DEFAULT`, `STALE_REFERENCE`) in a shared constants file and have hooks reference them instead of literal millisecond values, so intent is visible at the call site.
