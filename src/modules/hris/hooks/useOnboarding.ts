import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { Json, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useHrAccess } from '@/modules/auth/hooks/useHrAccess';
import { usePayrollAccess } from '@/modules/auth/hooks/usePayrollAccess';
import { useToast } from '@/shared/hooks/use-toast';
import { removeCrewDocument, uploadCrewDocument } from '@/lib/storage/crewDocuments';
import { useHrCrewDirectory } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { expiryLabel, expiryTone, formatDate } from '@/modules/hris/lib/format';
import {
  DEFAULT_JOINER_WINDOW,
  groupItemsBySection,
  mergeJoinerSources,
  nextSortOrder,
  serialiseTemplateSections,
  type ItemSectionGroup,
  type JoinerRow,
  type JoinerWindow,
  type OnboardingItemRow,
  type OnboardingOwner,
  type OnboardingRecordRow,
  type OnboardingStatus,
  type OnboardingTemplateRow,
  type ReadinessCheck,
  type TemplateSection,
} from '@/modules/hris/lib/onboarding';

export const ONBOARDING_KEY = ['hris', 'onboarding'] as const;
export const ONBOARDING_TEMPLATES_KEY = [...ONBOARDING_KEY, 'templates'] as const;
export const ONBOARDING_RECORDS_KEY = [...ONBOARDING_KEY, 'records'] as const;
export const ONBOARDING_RECORD_KEY = [...ONBOARDING_KEY, 'record'] as const;
export const ONBOARDING_READINESS_KEY = [...ONBOARDING_KEY, 'readiness'] as const;
export const ONBOARDING_JOINERS_KEY = [...ONBOARDING_KEY, 'joiners'] as const;

const isoDay = (d: Date) => format(d, 'yyyy-MM-dd');

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export interface TemplatePayload {
  name: string;
  vessel_id: string | null;
  applicable_departments: string[];
  sections: TemplateSection[];
  is_default: boolean;
}

export function useOnboardingTemplates(options: { includeInactive?: boolean } = {}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...ONBOARDING_TEMPLATES_KEY, companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<OnboardingTemplateRow[]> => {
      const { data, error } = await supabase
        .from('onboarding_templates')
        .select('*')
        .eq('company_id', companyId as string)
        .order('is_default', { ascending: false })
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const templates = useMemo(() => {
    const all = query.data ?? [];
    return options.includeInactive ? all : all.filter((t) => t.is_active);
  }, [query.data, options.includeInactive]);
  return { ...query, templates, all: query.data ?? [] };
}

export function useOnboardingTemplateMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ONBOARDING_TEMPLATES_KEY });
  }, [queryClient]);
  const fail = useCallback(
    (title: string) => (error: unknown) => toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
    [toast],
  );

  const toRow = (payload: TemplatePayload): TablesUpdate<'onboarding_templates'> => ({
    name: payload.name.trim(),
    vessel_id: payload.vessel_id,
    applicable_departments: payload.applicable_departments,
    sections: serialiseTemplateSections(payload.sections),
    is_default: payload.is_default,
  });

  /** Only one default per company: clear the flag on the others. */
  const clearOtherDefaults = async (keepId: string) => {
    const { error } = await supabase.from('onboarding_templates').update({ is_default: false }).eq('company_id', companyId as string).neq('id', keepId);
    if (error) throw error;
  };

  const create = useMutation({
    mutationFn: async (payload: TemplatePayload): Promise<OnboardingTemplateRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const insert: TablesInsert<'onboarding_templates'> = { ...toRow(payload), name: payload.name.trim(), company_id: companyId, created_by: user?.id ?? null };
      const { data, error } = await supabase.from('onboarding_templates').insert(insert).select('*').single();
      if (error) throw error;
      if (payload.is_default) await clearOtherDefaults(data.id);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template created' });
    },
    onError: fail('Could not create template'),
  });

  const update = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: TemplatePayload }): Promise<OnboardingTemplateRow> => {
      const { data, error } = await supabase.from('onboarding_templates').update(toRow(payload)).eq('id', id).select('*').single();
      if (error) throw error;
      if (payload.is_default) await clearOtherDefaults(id);
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Template saved' });
    },
    onError: fail('Could not save template'),
  });

  const setDefault = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('onboarding_templates').update({ is_default: true, is_active: true }).eq('id', id);
      if (error) throw error;
      await clearOtherDefaults(id);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Default template updated' });
    },
    onError: fail('Could not set default template'),
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }): Promise<void> => {
      const { error } = await supabase.from('onboarding_templates').update({ is_active: active, ...(active ? {} : { is_default: false }) }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast({ title: vars.active ? 'Template reactivated' : 'Template deactivated' });
    },
    onError: fail('Could not update template'),
  });

  return { create, update, setDefault, setActive };
}

// ---------------------------------------------------------------------------
// Records (company overview)
// ---------------------------------------------------------------------------

export interface OnboardingRecordWithCrew extends OnboardingRecordRow {
  crew_name: string;
  crew_user_id: string | null;
  vessel_name: string | null;
  buddy_name: string | null;
}

export interface OnboardingRecordFilters {
  status?: OnboardingStatus | 'all';
  vesselId?: string | 'all';
  /** Only records whose start date falls within this many days (past or future). */
  upcomingWithinDays?: number | null;
}

type ProfileJoin = { user_id: string | null; first_name: string; last_name: string; preferred_name: string | null } | null;
type VesselJoin = { name: string } | null;

const crewName = (p: ProfileJoin) => (p ? `${p.preferred_name || p.first_name} ${p.last_name}`.trim() : 'Unknown crew');

/** All onboarding records of the company with crew, vessel and buddy joined in. */
export function useOnboardingRecords(filters: OnboardingRecordFilters = {}) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: [...ONBOARDING_RECORDS_KEY, companyId],
    enabled: Boolean(companyId) && !access.loading,
    queryFn: async (): Promise<OnboardingRecordWithCrew[]> => {
      const { data, error } = await supabase
        .from('onboarding_records')
        .select(
          '*, vessels(name), profiles!onboarding_records_profile_id_fkey(user_id, first_name, last_name, preferred_name), buddy:profiles!onboarding_records_buddy_profile_id_fkey(user_id, first_name, last_name, preferred_name)',
        )
        .eq('company_id', companyId as string)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const { vessels, profiles, buddy, ...rest } = raw as unknown as OnboardingRecordRow & { vessels: VesselJoin; profiles: ProfileJoin; buddy: ProfileJoin };
        return {
          ...rest,
          crew_name: crewName(profiles),
          crew_user_id: profiles?.user_id ?? null,
          vessel_name: vessels?.name ?? null,
          buddy_name: buddy ? crewName(buddy) : null,
        };
      });
    },
  });

  const all = useMemo(() => query.data ?? [], [query.data]);
  const records = useMemo(() => {
    const today = new Date();
    return all.filter((r) => {
      if (filters.status && filters.status !== 'all' && r.status !== filters.status) return false;
      if (filters.vesselId && filters.vesselId !== 'all' && r.vessel_id !== filters.vesselId) return false;
      if (filters.upcomingWithinDays) {
        const start = new Date(r.start_date);
        const diff = Math.abs((start.getTime() - today.getTime()) / 86_400_000);
        if (diff > filters.upcomingWithinDays) return false;
      }
      return true;
    });
  }, [all, filters.status, filters.vesselId, filters.upcomingWithinDays]);

  return { ...query, all, records };
}

/** Open onboarding items across the company, for overdue KPIs. */
export function useOpenOnboardingItems() {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, 'open-items', companyId],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async (): Promise<Pick<OnboardingItemRow, 'id' | 'record_id' | 'completed' | 'due_date' | 'owner' | 'title' | 'section'>[]> => {
      const { data, error } = await supabase
        .from('onboarding_items')
        .select('id, record_id, completed, due_date, owner, title, section')
        .eq('company_id', companyId as string)
        .eq('completed', false);
      if (error) throw error;
      return data ?? [];
    },
  });
  return { ...query, items: query.data ?? [] };
}

/** Crew starting within the window from contracts, assignments and onboarding records. */
export function useUpcomingJoiners(window: JoinerWindow = DEFAULT_JOINER_WINDOW) {
  const { profile } = useAuth();
  const access = useHrAccess();
  const companyId = profile?.company_id ?? null;
  const directory = useHrCrewDirectory({ includeInactive: true });
  const { vesselName } = useCompanyVessels();
  const records = useOnboardingRecords();

  const from = isoDay(subDays(new Date(), window.pastDays));
  const to = isoDay(addDays(new Date(), window.futureDays));

  const sources = useQuery({
    queryKey: [...ONBOARDING_JOINERS_KEY, companyId, from, to],
    enabled: Boolean(companyId) && !access.loading && access.canView,
    queryFn: async () => {
      const [contracts, assignments] = await Promise.all([
        supabase.from('crew_contracts').select('profile_id, start_date, status, vessel_id').eq('company_id', companyId as string).gte('start_date', from).lte('start_date', to),
        supabase.from('crew_assignments').select('user_id, join_date, vessel_id').gte('join_date', from).lte('join_date', to),
      ]);
      if (contracts.error) throw contracts.error;
      if (assignments.error) throw assignments.error;
      return { contracts: contracts.data ?? [], assignments: assignments.data ?? [] };
    },
  });

  const joiners: JoinerRow[] = useMemo(
    () =>
      mergeJoinerSources({
        records: records.all,
        contracts: sources.data?.contracts ?? [],
        assignments: sources.data?.assignments ?? [],
        directory: directory.all,
        vesselName,
        window,
      }),
    [records.all, sources.data, directory.all, vesselName, window],
  );

  return {
    joiners,
    isLoading: sources.isLoading || records.isLoading || directory.isLoading,
    isError: sources.isError || records.isError,
    error: sources.error ?? records.error,
  };
}

/** Open onboarding records where the current user is the buddy (self-service view). */
export function useBuddyRecords() {
  const { profile } = useAuth();
  const myProfileId = profile?.id ?? null;
  const query = useQuery({
    queryKey: [...ONBOARDING_KEY, 'buddy', myProfileId],
    enabled: Boolean(myProfileId),
    queryFn: async (): Promise<{ record: OnboardingRecordRow; crew_name: string; profile_id: string }[]> => {
      const { data, error } = await supabase
        .from('onboarding_records')
        .select('*, profiles!onboarding_records_profile_id_fkey(user_id, first_name, last_name, preferred_name)')
        .eq('buddy_profile_id', myProfileId as string)
        .in('status', ['not_started', 'in_progress'])
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((raw) => {
        const { profiles, ...rest } = raw as unknown as OnboardingRecordRow & { profiles: ProfileJoin };
        return { record: rest, crew_name: crewName(profiles), profile_id: rest.profile_id };
      });
    },
  });
  return { ...query, records: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Single crew member
// ---------------------------------------------------------------------------

export interface OnboardingRecordDetail {
  record: OnboardingRecordRow | null;
  items: OnboardingItemRow[];
  sections: ItemSectionGroup[];
  history: OnboardingRecordRow[];
}

/** Latest onboarding record for a crew member plus its items grouped by section. */
export function useOnboardingRecord(profileId: string | null) {
  const query = useQuery({
    queryKey: [...ONBOARDING_RECORD_KEY, profileId],
    enabled: Boolean(profileId),
    queryFn: async (): Promise<OnboardingRecordDetail> => {
      const { data: records, error } = await supabase
        .from('onboarding_records')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('start_date', { ascending: false });
      if (error) throw error;
      const history = records ?? [];
      // Prefer an open record over the most recent closed one.
      const record = history.find((r) => r.status === 'in_progress' || r.status === 'not_started') ?? history[0] ?? null;
      if (!record) return { record: null, items: [], sections: [], history };
      const { data: items, error: iErr } = await supabase.from('onboarding_items').select('*').eq('record_id', record.id).order('sort_order');
      if (iErr) throw iErr;
      return { record, items: items ?? [], sections: groupItemsBySection(items ?? []), history };
    },
  });
  return { ...query, record: query.data?.record ?? null, items: query.data?.items ?? [], sections: query.data?.sections ?? [], history: query.data?.history ?? [] };
}

/**
 * Read-only "is this joiner ready" checks stitched from the existing HR and
 * crew tables. Sources the user cannot read are reported as unknown rather
 * than failing the whole list.
 */
export function useJoinerReadiness(profileId: string | null) {
  const payroll = usePayrollAccess();
  const query = useQuery({
    queryKey: [...ONBOARDING_READINESS_KEY, profileId, payroll.canView],
    enabled: Boolean(profileId) && !payroll.loading,
    queryFn: async (): Promise<ReadinessCheck[]> => {
      const pid = profileId as string;
      const link = (path: string) => `${path}?crew=${pid}&module=hris`;
      const { data: p, error } = await supabase
        .from('profiles')
        .select('id, user_id, email, account_status, is_imported, invited_at, last_invited_at, last_login_at, passport_number, passport_expiry, visa_status, visa_expiry, medical_expiry')
        .eq('id', pid)
        .single();
      if (error) throw error;

      const safe = async <T,>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T | null | undefined> => {
        try {
          const res = await fn();
          if (res.error) return undefined;
          return res.data;
        } catch {
          return undefined;
        }
      };

      const [contracts, nok, comp, bank, preDep, fam] = await Promise.all([
        safe(() => supabase.from('crew_contracts').select('id, status, signed_by_crew_at, signed_by_company_at, start_date').eq('profile_id', pid).in('status', ['active', 'draft']).order('start_date', { ascending: false })),
        safe(() => supabase.from('crew_next_of_kin').select('id, is_primary').eq('profile_id', pid)),
        payroll.canView ? safe(() => supabase.from('crew_compensation').select('id').eq('profile_id', pid).eq('status', 'active').limit(1)) : Promise.resolve(undefined),
        safe(() => supabase.from('crew_bank_details').select('id, verified_at').eq('profile_id', pid).limit(1)),
        p.user_id
          ? safe(() =>
              supabase
                .from('pre_departure_checklists')
                .select('id, checklist_status, passport_valid, visa_obtained, flight_ticket_received, medical_fit_to_travel, updated_at')
                .eq('crew_member_id', p.user_id as string)
                .order('updated_at', { ascending: false })
                .limit(1),
            )
          : Promise.resolve(null),
        p.user_id
          ? safe(() => supabase.from('familiarization_records').select('id, status, completion_percentage, target_completion_date').eq('user_id', p.user_id as string).order('created_at', { ascending: false }).limit(1))
          : Promise.resolve(null),
      ]);

      const checks: ReadinessCheck[] = [];

      // Login account
      const accountOk = Boolean(p.user_id) && (p.account_status === 'active' || Boolean(p.last_login_at));
      checks.push({
        key: 'account',
        label: 'Login account',
        ok: accountOk,
        detail: accountOk
          ? p.last_login_at
            ? `Active · last login ${formatDate(p.last_login_at)}`
            : 'Active'
          : p.account_status === 'invited' || p.invited_at
            ? `Invited ${formatDate(p.last_invited_at ?? p.invited_at)} · not yet accepted`
            : p.account_status === 'disabled'
              ? 'Account disabled'
              : 'Not invited yet',
        action: accountOk || p.account_status === 'disabled' ? undefined : 'send_invitation',
      });

      // Contract
      const active = contracts?.find((c) => c.status === 'active') ?? null;
      const draft = contracts?.find((c) => c.status === 'draft') ?? null;
      const signed = active ? Boolean(active.signed_by_crew_at && active.signed_by_company_at) : false;
      checks.push({
        key: 'contract',
        label: 'Employment contract / SEA',
        ok: Boolean(active),
        unknown: contracts === undefined,
        detail:
          contracts === undefined
            ? 'Not visible with your access'
            : active
              ? signed
                ? `Active · signed ${formatDate(active.signed_by_crew_at)}`
                : 'Active · signatures outstanding'
              : draft
                ? `Draft contract from ${formatDate(draft.start_date)} not yet activated`
                : 'No active contract',
        link: link(HRIS_PATHS.contracts),
      });

      // Identity documents
      const passportTone = expiryTone(p.passport_expiry);
      checks.push({
        key: 'passport',
        label: 'Passport',
        ok: Boolean(p.passport_number) && (passportTone === 'ok' || passportTone === 'warning'),
        detail: !p.passport_number ? 'No passport number recorded' : !p.passport_expiry ? 'Expiry date missing' : expiryLabel(p.passport_expiry),
        link: link(HRIS_PATHS.rightToWork),
      });
      const medicalTone = expiryTone(p.medical_expiry);
      checks.push({
        key: 'medical',
        label: 'Medical certificate',
        ok: medicalTone === 'ok' || medicalTone === 'warning',
        detail: p.medical_expiry ? expiryLabel(p.medical_expiry) : 'No medical expiry recorded',
        link: link(HRIS_PATHS.rightToWork),
      });
      if (p.visa_expiry || p.visa_status) {
        const visaTone = expiryTone(p.visa_expiry);
        checks.push({
          key: 'visa',
          label: 'Visa',
          ok: visaTone === 'ok' || visaTone === 'warning',
          detail: `${p.visa_status ? `${p.visa_status} · ` : ''}${p.visa_expiry ? expiryLabel(p.visa_expiry) : 'no expiry recorded'}`,
          link: link(HRIS_PATHS.rightToWork),
        });
      }

      // Next of kin
      checks.push({
        key: 'next_of_kin',
        label: 'Next of kin',
        ok: Boolean(nok && nok.length > 0),
        unknown: nok === undefined,
        detail: nok === undefined ? 'Not visible with your access' : nok.length ? `${nok.length} contact${nok.length === 1 ? '' : 's'} recorded${nok.some((n) => n.is_primary) ? '' : ' · no primary'}` : 'No emergency contact recorded',
        link: link(HRIS_PATHS.nextOfKin),
      });

      // Compensation (yes/no only)
      checks.push({
        key: 'compensation',
        label: 'Compensation set',
        ok: Boolean(comp && comp.length > 0),
        unknown: comp === undefined,
        detail: comp === undefined ? 'Requires payroll access' : comp.length ? 'Active compensation on file' : 'No active compensation record',
        link: link(HRIS_PATHS.salaries),
      });

      // Bank details
      checks.push({
        key: 'bank',
        label: 'Bank details',
        ok: Boolean(bank && bank.length > 0),
        unknown: bank === undefined,
        detail: bank === undefined ? 'Not visible with your access' : bank.length ? (bank[0].verified_at ? 'Received and verified' : 'Received · not verified') : 'No bank details received',
        link: link(HRIS_PATHS.salaries),
      });

      // Pre-departure checklist (crew travel module)
      if (p.user_id) {
        const pd = preDep?.[0] ?? null;
        const pdStatus = (pd?.checklist_status ?? '').toLowerCase();
        const pdDone = pd ? pdStatus === 'approved' || pdStatus === 'completed' || pdStatus === 'complete' : false;
        const flags = pd ? [pd.passport_valid, pd.visa_obtained, pd.flight_ticket_received, pd.medical_fit_to_travel] : [];
        const flagsDone = flags.filter(Boolean).length;
        checks.push({
          key: 'pre_departure',
          label: 'Pre-departure checklist',
          ok: pdDone || (flags.length > 0 && flagsDone === flags.length),
          unknown: preDep === undefined,
          detail: preDep === undefined ? 'Not visible with your access' : pd ? `${pd.checklist_status ?? 'In progress'} · ${flagsDone}/${flags.length} travel checks` : 'No pre-departure checklist started',
          link: '/crew/admin/pre-departure',
        });

        const f = fam?.[0] ?? null;
        checks.push({
          key: 'familiarisation',
          label: 'ISM familiarisation',
          ok: f?.status === 'completed',
          unknown: fam === undefined,
          detail: fam === undefined ? 'Not visible with your access' : f ? `${f.status.replace(/_/g, ' ')} · ${f.completion_percentage}% · target ${formatDate(f.target_completion_date)}` : 'Not started',
        });
      } else {
        checks.push({ key: 'pre_departure', label: 'Pre-departure checklist', ok: false, detail: 'Needs a login account first' });
        checks.push({ key: 'familiarisation', label: 'ISM familiarisation', ok: false, detail: 'Needs a login account first' });
      }

      return checks;
    },
  });
  return { ...query, checks: query.data ?? [] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export interface StartOnboardingArgs {
  profileId: string;
  vesselId: string | null;
  startDate: string;
  templateId: string | null;
  buddyProfileId: string | null;
  notes?: string | null;
}

export interface AddAdHocItemArgs {
  record: OnboardingRecordRow;
  existing: readonly OnboardingItemRow[];
  section: string;
  title: string;
  owner: OnboardingOwner;
  dueDate: string | null;
  required: boolean;
}

type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

const recordSnapshot = (r: OnboardingRecordRow): Json => ({
  status: r.status,
  start_date: r.start_date,
  vessel_id: r.vessel_id,
  buddy_profile_id: r.buddy_profile_id,
  completion_pct: r.completion_pct,
  notes: r.notes,
});

const itemSnapshot = (i: OnboardingItemRow): Json => ({
  section: i.section,
  title: i.title,
  owner: i.owner,
  due_date: i.due_date,
  required: i.required,
  completed: i.completed,
  notes: i.notes,
  evidence_path: i.evidence_path,
});

export function useOnboardingMutations() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const companyId = profile?.company_id ?? null;

  const audit = useCallback(
    async (entityType: 'onboarding_record' | 'onboarding_item', action: AuditAction, entityId: string, oldValues: Json | null, newValues: Json | null) => {
      const { error } = await supabase.from('audit_logs').insert({
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_user_id: user?.id ?? null,
        actor_email: user?.email ?? null,
        actor_role: profile?.role ?? null,
        old_values: oldValues,
        new_values: newValues,
      });
      if (error) console.warn(`${entityType} audit log failed`, error);
    },
    [profile?.role, user?.email, user?.id],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ONBOARDING_KEY });
  }, [queryClient]);

  const fail = useCallback(
    (title: string) => (error: unknown) => toast({ title, description: error instanceof Error ? error.message : 'Unexpected error', variant: 'destructive' }),
    [toast],
  );

  const start = useMutation({
    mutationFn: async (args: StartOnboardingArgs): Promise<string> => {
      const { data, error } = await supabase.rpc('onboarding_start', {
        p_profile_id: args.profileId,
        p_vessel_id: args.vesselId,
        p_start_date: args.startDate,
        p_template_id: args.templateId,
      });
      if (error) throw error;
      if (!data) throw new Error('No active onboarding template found for this company. Create one first.');
      if (args.buddyProfileId || args.notes) {
        const { error: uErr } = await supabase.from('onboarding_records').update({ buddy_profile_id: args.buddyProfileId, notes: args.notes ?? null }).eq('id', data);
        if (uErr) throw uErr;
      }
      await audit('onboarding_record', 'CREATE', data, null, { profile_id: args.profileId, vessel_id: args.vesselId, start_date: args.startDate, template_id: args.templateId, buddy_profile_id: args.buddyProfileId });
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Onboarding started', description: 'The checklist has been created from the template.' });
    },
    onError: fail('Could not start onboarding'),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ item, completed }: { item: OnboardingItemRow; completed: boolean }): Promise<OnboardingItemRow> => {
      const patch: TablesUpdate<'onboarding_items'> = {
        completed,
        completed_at: completed ? new Date().toISOString() : null,
        completed_by: completed ? user?.id ?? null : null,
      };
      const { data, error } = await supabase.from('onboarding_items').update(patch).eq('id', item.id).select('*').single();
      if (error) throw error;
      await audit('onboarding_item', 'UPDATE', item.id, itemSnapshot(item), itemSnapshot(data));
      return data;
    },
    onSuccess: invalidate,
    onError: fail('Could not update item'),
  });

  const updateItem = useMutation({
    mutationFn: async ({ item, patch }: { item: OnboardingItemRow; patch: Pick<TablesUpdate<'onboarding_items'>, 'notes' | 'due_date' | 'title' | 'owner' | 'required'> }): Promise<OnboardingItemRow> => {
      const { data, error } = await supabase.from('onboarding_items').update(patch).eq('id', item.id).select('*').single();
      if (error) throw error;
      await audit('onboarding_item', 'UPDATE', item.id, itemSnapshot(item), itemSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item updated' });
    },
    onError: fail('Could not update item'),
  });

  const uploadEvidence = useMutation({
    mutationFn: async ({ item, file, crewUserId }: { item: OnboardingItemRow; file: File; crewUserId: string }): Promise<OnboardingItemRow> => {
      if (!companyId) throw new Error('No company on the current profile');
      const uploaded = await uploadCrewDocument({ file, companyId, crewUserId, kind: 'onboarding' });
      const { data, error } = await supabase.from('onboarding_items').update({ evidence_path: uploaded.path }).eq('id', item.id).select('*').single();
      if (error) throw error;
      if (item.evidence_path && item.evidence_path !== uploaded.path) {
        await removeCrewDocument(item.evidence_path).catch((err: unknown) => console.warn('old evidence not removed', err));
      }
      await audit('onboarding_item', 'UPDATE', item.id, itemSnapshot(item), itemSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Evidence attached' });
    },
    onError: fail('Could not upload evidence'),
  });

  const addAdHocItem = useMutation({
    mutationFn: async (args: AddAdHocItemArgs): Promise<OnboardingItemRow> => {
      const insert: TablesInsert<'onboarding_items'> = {
        record_id: args.record.id,
        company_id: args.record.company_id,
        section: args.section.trim() || 'Ad hoc',
        title: args.title.trim(),
        owner: args.owner,
        due_date: args.dueDate,
        required: args.required,
        sort_order: nextSortOrder(args.existing),
      };
      const { data, error } = await supabase.from('onboarding_items').insert(insert).select('*').single();
      if (error) throw error;
      await audit('onboarding_item', 'CREATE', data.id, null, itemSnapshot(data));
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item added' });
    },
    onError: fail('Could not add item'),
  });

  const removeItem = useMutation({
    mutationFn: async (item: OnboardingItemRow): Promise<void> => {
      const { error } = await supabase.from('onboarding_items').delete().eq('id', item.id);
      if (error) throw error;
      if (item.evidence_path) await removeCrewDocument(item.evidence_path).catch((err: unknown) => console.warn('evidence not removed', err));
      await audit('onboarding_item', 'DELETE', item.id, itemSnapshot(item), null);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Item removed' });
    },
    onError: fail('Could not remove item'),
  });

  const updateRecord = useCallback(
    async (record: OnboardingRecordRow, patch: TablesUpdate<'onboarding_records'>): Promise<OnboardingRecordRow> => {
      const { data, error } = await supabase.from('onboarding_records').update(patch).eq('id', record.id).select('*').single();
      if (error) throw error;
      await audit('onboarding_record', 'UPDATE', record.id, recordSnapshot(record), recordSnapshot(data));
      return data;
    },
    [audit],
  );

  const setBuddy = useMutation({
    mutationFn: ({ record, buddyProfileId }: { record: OnboardingRecordRow; buddyProfileId: string | null }) => updateRecord(record, { buddy_profile_id: buddyProfileId }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Buddy updated' });
    },
    onError: fail('Could not set buddy'),
  });

  const updateNotes = useMutation({
    mutationFn: ({ record, notes }: { record: OnboardingRecordRow; notes: string | null }) => updateRecord(record, { notes }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Notes saved' });
    },
    onError: fail('Could not save notes'),
  });

  const cancel = useMutation({
    mutationFn: (record: OnboardingRecordRow) => updateRecord(record, { status: 'cancelled', completed_at: null }),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Onboarding cancelled' });
    },
    onError: fail('Could not cancel onboarding'),
  });

  const reopen = useMutation({
    mutationFn: async (record: OnboardingRecordRow) => {
      const data = await updateRecord(record, { status: 'in_progress' });
      const { error } = await supabase.rpc('onboarding_recompute', { p_record_id: record.id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Onboarding reopened' });
    },
    onError: fail('Could not reopen onboarding'),
  });

  const sendInvitation = useMutation({
    mutationFn: async ({ profileId, email }: { profileId: string; email?: string | null }): Promise<string | null> => {
      const { data, error } = await supabase.functions.invoke<{ error?: string }>('send-invitation', {
        body: { profileId, redirectTo: `${window.location.origin}/auth/accept-invitation` },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return email ?? null;
    },
    onSuccess: (email) => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['hris', 'crew-directory'] });
      toast({ title: 'Invitation sent', description: email ? `Verification email sent to ${email}.` : 'Verification email sent.' });
    },
    onError: fail('Could not send invitation'),
  });

  return { start, toggleItem, updateItem, uploadEvidence, addAdHocItem, removeItem, setBuddy, updateNotes, cancel, reopen, sendInvitation };
}
