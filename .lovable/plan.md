# Fix the two monitoring findings

## 1. Google sign-in (done)

The Google sign-in provider was set up with incomplete credentials, which is why
the login attempt was rejected before it ever reached Google. It has now been
switched to Lovable's managed Google credentials, so "Continue with Google"
starts the real Google flow.

Sign in with your **ink.fish** Google account — a Gmail account would create a
brand-new empty account with no access.

## 2. Health & Wellness has no data behind it (confirmed, needs approval)

Verified: the live database contains **no** Health & Wellness tables at all. The
full design for them exists in the project as five prepared setup files that were
never applied, which is why Medical Patients, Athlete Roster, Spa, Nutrition and
Physio pages error or stay permanently empty.

### What I would do

Apply the five prepared setup files in order, exactly as written, one at a time:

1. Foundation — people, practitioners, measurements, settings, referrals, access log
2. Medical — clinical records, consultations, medication, fitness, medical stores
3. Wellness — spa treatments, bookings, nutrition
4. Training — personal training and physiotherapy programmes
5. Views, alerts and starter reference data

### Why this needs your approval

It is a large change (around 3,600 lines): it creates the whole clinical area,
its access rules, and automatically creates one health record per existing crew
profile so the pages have people in them straight away. Nothing existing is
deleted, and only one existing area is touched — crew profiles gain a link so a
person's health record stays in step with their crew record.

Access rules are already built into the design: clinical detail is limited to
medical staff and the person it concerns; captains and HR see only fitness-to-work
status; spa, gym and galley staff see names and safety flags, never medical
history.

### Technical notes

- Applies `supabase/migrations/20260919100000_health_phase1_foundation.sql`
  through `...140000_health_phase5_views_alerts_seeds.sql` verbatim.
- All helper functions they depend on (`rbac_company_permission`,
  `user_belongs_to_company`, `my_profile_id`, `hr_can_view`, `hr_can_admin`,
  `legacy_profile_role`, `has_any_role`, `update_updated_at_column`) already
  exist in the database, so the files should apply cleanly in order.
- Every table is created with RLS enabled plus explicit grants; no `anon` access.
- After they apply, the generated database types will include the `hw_*`,
  `med_*` and wellness tables, clearing the health module's type errors.
- Verification: confirm the tables exist, then open Medical Patients, Athlete
  Roster and Spa signed in and check they load with crew listed and no errors.
