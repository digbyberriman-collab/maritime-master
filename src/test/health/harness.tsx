/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { createSupabaseMock, type Fixtures, type SupabaseMockOptions } from '@/test/hris/supabaseMock';
import { authState, setCurrentSupabase, supabaseProxy } from '@/test/hris/state';

export { authState, supabaseProxy };
export type { Fixtures };

/**
 * Shared harness for Health & Wellness page render tests.
 *
 * Test files must mock these modules themselves, because `vi.mock` is
 * hoisted and has to live in the test file:
 *
 *   vi.mock('@/integrations/supabase/client', async () => {
 *     const s = await import('@/test/hris/state');
 *     return { supabase: s.supabaseProxy };
 *   });
 *   vi.mock('@/modules/auth/contexts/AuthContext', async () => {
 *     const s = await import('@/test/hris/state');
 *     return { useAuth: () => s.authState.value, AuthProvider: ({ children }: any) => children };
 *   });
 *   vi.mock('@/modules/vessels/contexts/VesselContext', () => ({
 *     useVessel: () => ({ vessels: [], selectedVessel: null, selectedVesselId: null }),
 *     VesselProvider: ({ children }: any) => children,
 *   }));
 */

// jsdom lacks these; Radix primitives, cmdk and recharts expect them.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as any).ResizeObserver = RO;
}
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (typeof window !== 'undefined' && !(window as any).PointerEvent) {
  (window as any).PointerEvent = MouseEvent;
}
if (typeof window !== 'undefined' && !window.matchMedia) {
  (window as any).matchMedia = () => ({
    matches: false,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

export const COMPANY_ID = 'co-1';
export const MEDIC_USER = { id: 'u-medic', email: 'medic@example.com' };
export const CREW_USER = { id: 'u-crew', email: 'crew@example.com' };

/**
 * Who is signed in.
 *
 * `medic` is the interesting one: crew rank, clinical access earned from the
 * practitioner roster, which is the rule the whole section turns on.
 */
export type HealthRole = 'dpa' | 'medic' | 'trainer' | 'captain' | 'crew';

const LEGACY_ROLE: Record<HealthRole, string> = {
  dpa: 'dpa',
  medic: 'crew',
  trainer: 'crew',
  captain: 'master',
  crew: 'crew',
};

const RBAC_ROLE: Record<HealthRole, string | null> = {
  dpa: 'dpa',
  medic: 'crew',
  trainer: 'crew',
  captain: 'captain',
  crew: 'crew',
};

const DISCIPLINES: Record<HealthRole, string[]> = {
  dpa: [],
  medic: ['medical'],
  trainer: ['pt'],
  captain: [],
  crew: [],
};

const PROFILE: Record<HealthRole, any> = {
  dpa: { id: 'p-dpa', user_id: MEDIC_USER.id, email: 'dpa@example.com', first_name: 'Dee', last_name: 'Dpa', company_id: COMPANY_ID },
  medic: { id: 'p-medic', user_id: MEDIC_USER.id, email: MEDIC_USER.email, first_name: 'Mia', last_name: 'Medic', company_id: COMPANY_ID },
  trainer: { id: 'p-trainer', user_id: MEDIC_USER.id, email: 'trainer@example.com', first_name: 'Tom', last_name: 'Trainer', company_id: COMPANY_ID },
  captain: { id: 'p-captain', user_id: MEDIC_USER.id, email: 'captain@example.com', first_name: 'Cal', last_name: 'Captain', company_id: COMPANY_ID },
  crew: { id: 'p-crew', user_id: CREW_USER.id, email: CREW_USER.email, first_name: 'Dan', last_name: 'Deck', company_id: COMPANY_ID },
};

const makeAuth = (role: HealthRole) => ({
  user: role === 'crew' ? CREW_USER : MEDIC_USER,
  session: null,
  profile: { ...PROFILE[role], role: LEGACY_ROLE[role] },
  loading: false,
  userRole: LEGACY_ROLE[role],
  practitionerDisciplines: DISCIPLINES[role],
  practitionerDisciplinesLoaded: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => undefined,
  resetPassword: async () => ({ error: null }),
  hasPermission: () => true,
  canAccessModule: () => true,
});

authState.value = makeAuth('medic');

export function setupSupabase(fixtures: Fixtures, options: SupabaseMockOptions = {}) {
  const mock = createSupabaseMock(fixtures, options);
  setCurrentSupabase(mock.supabase);
  return mock;
}

export function setupHealthAccess(role: HealthRole) {
  const rbacRole = RBAC_ROLE[role];
  usePermissionsStore.getState().reset();
  usePermissionsStore.setState({
    isInitialized: true,
    isLoading: false,
    userRoles: rbacRole
      ? ([{ role_name: rbacRole, role_display_name: rbacRole, is_fleet_wide: role === 'dpa' }] as any)
      : [],
    permissions:
      role === 'crew' || role === 'medic' || role === 'trainer'
        ? ([
            { module_key: 'medical', module_name: 'Medical', can_view: true, can_edit: false, can_admin: false, scope: 'self', restrictions: {} },
            { module_key: 'wellness', module_name: 'Wellness', can_view: true, can_edit: false, can_admin: false, scope: 'self', restrictions: {} },
          ] as any)
        : [],
  });
  authState.value = makeAuth(role);
}

export interface RenderPageOptions {
  /** Initial URL, e.g. '/health/medical/patients?person=hp1'. */
  route: string;
  /** Route pattern to mount the page on. Defaults to the pathname of `route`. */
  path?: string;
}

export function renderHealthPage(
  Page: React.ComponentType,
  options: RenderPageOptions,
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  const path = options.path ?? options.route.split('?')[0];
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options.route]}>
        <Routes>
          <Route path={path} element={<Page />} />
          <Route path="*" element={<div data-testid="elsewhere" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return Object.assign(result, { queryClient });
}

/**
 * An empty company. Every health table resolves to no rows, which is what a
 * vessel looks like on the day the section is switched on, and the state most
 * likely to crash a page that assumes a first row exists.
 */
export function emptyFixtures(): Fixtures {
  return {
    profiles: [PROFILE.medic, PROFILE.crew],
    vessels: [],
    hw_people: [],
    hw_practitioners: [],
    hw_practitioner_qualifications: [],
    hw_measurements: [],
    hw_settings: [],
    hw_referrals: [],
    hw_expiry_items: [],
    hw_fitness_status: [],
    med_patient_records: [],
    med_allergies: [],
    med_conditions: [],
    med_medications: [],
    med_vaccinations: [],
    med_fitness_assessments: [],
    med_consultations: [],
    med_supply_locations: [],
    med_supply_items: [],
    med_supply_transactions: [],
    med_equipment: [],
    med_first_aid_kits: [],
    med_kit_checks: [],
    med_protocols: [],
    med_protocol_acknowledgements: [],
    med_log_entries: [],
    med_screening_templates: [],
    med_screening_questions: [],
    med_screening_records: [],
    med_screening_answers: [],
    spa_treatments: [],
    spa_rooms: [],
    spa_bookings: [],
    spa_inventory_items: [],
    spa_inventory_transactions: [],
    nut_profiles: [],
    nut_foods: [],
    nut_food_log_entries: [],
    nut_meal_plans: [],
    nut_goals: [],
    physio_assessments: [],
    physio_assessment_items: [],
    physio_treatment_plans: [],
    physio_sessions: [],
    pt_exercise_sources: [],
    pt_exercises: [],
    pt_videos: [],
    pt_program_templates: [],
    pt_template_days: [],
    pt_template_items: [],
    pt_programs: [],
    pt_program_sessions: [],
    pt_session_items: [],
    pt_set_logs: [],
    pt_appointments: [],
    crew_certificates: [],
    crew_next_of_kin: [],
    crew_assignments: [],
    alerts: [],
  };
}

export const PERSON_ID = 'hp-dan';

/** A company with one crew subject and one row in most tables. */
export function populatedFixtures(): Fixtures {
  const base = emptyFixtures();
  const person = {
    id: PERSON_ID,
    company_id: COMPANY_ID,
    profile_id: PROFILE.crew.id,
    person_type: 'crew',
    first_name: 'Dan',
    last_name: 'Deck',
    preferred_name: null,
    date_of_birth: '1990-01-01',
    gender: 'male',
    nationality: 'British',
    email: 'crew@example.com',
    phone: null,
    vessel_id: 'v1',
    cabin: 'C1',
    language: null,
    department: 'Deck',
    rank: 'Deckhand',
    emergency_contact_name: 'Kim Deck',
    emergency_contact_phone: '+44 7',
    consent_share_safety_flags: true,
    arrived_on: null,
    departed_on: null,
    is_active: true,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    vessels: { name: 'M/Y Draak' },
    profiles: { user_id: CREW_USER.id },
  };
  const practitioner = {
    id: 'pr1',
    company_id: COMPANY_ID,
    profile_id: PROFILE.medic.id,
    discipline: 'medical',
    full_name: 'Mia Medic',
    role_title: "Ship's medic",
    seniority: 'lead',
    rank_code: 'MED 2',
    vessel_id: 'v1',
    email: MEDIC_USER.email,
    phone: null,
    specialisms: ['Emergency care'],
    bio: null,
    license_number: 'NMC-1',
    license_authority: 'NMC',
    license_expiry: '2027-06-01',
    started_on: '2025-01-01',
    ended_on: null,
    is_active: true,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    vessels: { name: 'M/Y Draak' },
    hw_practitioner_qualifications: [],
  };

  return {
    ...base,
    vessels: [{ id: 'v1', name: 'M/Y Draak', company_id: COMPANY_ID }],
    hw_people: [person],
    hw_practitioners: [practitioner],
    hw_fitness_status: [
      {
        person_id: PERSON_ID,
        company_id: COMPANY_ID,
        profile_id: PROFILE.crew.id,
        person_name: 'Dan Deck',
        vessel_id: 'v1',
        department: 'Deck',
        rank: 'Deckhand',
        assessment_id: 'f1',
        assessment_type: 'eng1',
        status: 'fit',
        issued_on: '2026-01-01',
        expires_on: '2027-01-01',
        restrictions: null,
        days_remaining: 300,
        fitness_state: 'valid',
      },
    ],
    med_fitness_assessments: [
      {
        id: 'f1',
        company_id: COMPANY_ID,
        person_id: PERSON_ID,
        profile_id: PROFILE.crew.id,
        assessment_type: 'eng1',
        status: 'fit',
        issued_on: '2026-01-01',
        expires_on: '2027-01-01',
        examiner_name: 'Dr Salt',
        examiner_reference: 'ENG1-1',
        issuing_country: 'GB',
        restrictions: null,
        restriction_review_on: null,
        certificate_id: null,
        document_path: null,
        document_name: null,
        notes: null,
        created_by: null,
        updated_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    med_allergies: [
      {
        id: 'al1',
        company_id: COMPANY_ID,
        person_id: PERSON_ID,
        allergen: 'Peanuts',
        allergy_type: 'food',
        severity: 'anaphylaxis',
        reaction: 'Airway swelling',
        treatment: 'Adrenaline',
        carries_autoinjector: true,
        diagnosed_on: '2015-01-01',
        is_active: true,
        notes: null,
        created_by: null,
        updated_by: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    med_consultations: [
      {
        id: 'c1',
        company_id: COMPANY_ID,
        person_id: PERSON_ID,
        vessel_id: 'v1',
        consultation_number: 'MC-2026-0001',
        parent_consultation_id: null,
        occurred_at: '2026-09-01T09:00:00Z',
        location: "Ship's hospital",
        consultation_type: 'walk_in',
        presenting_complaint: 'Headache',
        history: null,
        observations: null,
        temperature_c: 36.8,
        pulse_bpm: 68,
        respiratory_rate: null,
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        oxygen_saturation: 98,
        pain_score: 3,
        assessment: 'Tension headache',
        treatment_given: 'Paracetamol',
        medication_given: 'Paracetamol 1g',
        outcome: 'resolved',
        fit_for_duty: 'fit',
        days_off_work: 0,
        follow_up_on: null,
        telemedicine_used: false,
        telemedicine_provider: null,
        telemedicine_case_ref: null,
        attended_by_practitioner_id: 'pr1',
        incident_id: null,
        is_work_related: false,
        is_confidential: false,
        notes: null,
        created_by: null,
        updated_by: null,
        created_at: '2026-09-01T09:00:00Z',
        updated_at: '2026-09-01T09:00:00Z',
        hw_people: { first_name: 'Dan', last_name: 'Deck', preferred_name: null },
        hw_practitioners: { full_name: 'Mia Medic' },
        vessels: { name: 'M/Y Draak' },
      },
    ],
  };
}
