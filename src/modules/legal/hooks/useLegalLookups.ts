import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { makeNameLookup, personDisplayName, type PersonLite } from '@/modules/legal/lib/people';
import { errorMessage } from '@/modules/legal/lib/storage';

export const LEGAL_PEOPLE_KEY = ['legal-people'] as const;
export const LEGAL_TEAM_KEY = ['legal-team'] as const;
export const LEGAL_VESSELS_KEY = ['legal-vessels'] as const;
export const LEGAL_INCIDENTS_KEY = ['legal-incidents'] as const;

export interface LegalPerson extends PersonLite {
  /** profiles.id */
  id: string;
  user_id: string | null;
  department: string | null;
  displayName: string;
}

/**
 * Everyone in the company, for resolving submitted_by / assigned_to /
 * author ids to names and for the crew reference field. Profiles in the
 * same company are readable by every signed-in user.
 */
export function useLegalPeople() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...LEGAL_PEOPLE_KEY, companyId],
    enabled: Boolean(user) && Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LegalPerson[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, first_name, last_name, preferred_name, email, avatar_url, rank, position, department, account_status')
        .eq('company_id', companyId as string)
        .order('last_name')
        .order('first_name');
      if (error) throw error;
      return (data ?? [])
        .filter((p) => p.account_status !== 'deactivated')
        .map((p) => ({ ...p, displayName: personDisplayName(p) }));
    },
  });
  const people = useMemo(() => query.data ?? [], [query.data]);
  const nameFor = useMemo(() => makeNameLookup(people), [people]);
  const byUserId = useMemo(() => new Map(people.filter((p) => p.user_id).map((p) => [p.user_id as string, p])), [people]);
  const personFor = useCallback((userId: string | null | undefined) => (userId ? byUserId.get(userId) ?? null : null), [byUserId]);
  return { ...query, people, nameFor, personFor };
}

export interface LegalTeamMember extends PersonLite {
  user_id: string;
  profile_id: string;
  level: 'admin' | 'edit';
  displayName: string;
}

/** Members of the legal team (server-resolved), for the assignment picker. */
export function useLegalTeam() {
  const { user, profile } = useAuth();
  const query = useQuery({
    queryKey: [...LEGAL_TEAM_KEY, profile?.company_id ?? null],
    enabled: Boolean(user) && Boolean(profile?.company_id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LegalTeamMember[]> => {
      const { data, error } = await supabase.rpc('legal_team_directory');
      if (error) throw error;
      return (data ?? []).map(({ job_position, ...m }) => ({
        ...m,
        position: job_position,
        level: (m.level === 'admin' ? 'admin' : 'edit') as 'admin' | 'edit',
        displayName: personDisplayName(m),
      }));
    },
  });
  return { ...query, members: query.data ?? [] };
}

export interface LegalVessel {
  id: string;
  name: string;
}

export function useLegalVessels() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...LEGAL_VESSELS_KEY, companyId],
    enabled: Boolean(user) && Boolean(companyId),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LegalVessel[]> => {
      const { data, error } = await supabase.from('vessels').select('id, name').eq('company_id', companyId as string).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((v) => [v.id, v.name])), [query.data]);
  const vesselName = useCallback((id: string | null | undefined) => (id ? byId.get(id) ?? '' : ''), [byId]);
  return { ...query, vessels: query.data ?? [], vesselName };
}

export interface LegalIncident {
  id: string;
  incident_number: string;
  incident_type: string;
  incident_date: string;
  location: string;
  vessel_id: string;
}

export function useLegalIncidents(enabled = true) {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const query = useQuery({
    queryKey: [...LEGAL_INCIDENTS_KEY, companyId],
    enabled: enabled && Boolean(user) && Boolean(companyId),
    staleTime: 60_000,
    queryFn: async (): Promise<LegalIncident[]> => {
      const { data, error } = await supabase
        .from('incidents')
        .select('id, incident_number, incident_type, incident_date, location, vessel_id')
        .eq('company_id', companyId as string)
        .order('incident_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
  const byId = useMemo(() => new Map((query.data ?? []).map((i) => [i.id, i])), [query.data]);
  const incidentLabel = useCallback((id: string | null | undefined) => {
    const i = id ? byId.get(id) : undefined;
    return i ? `${i.incident_number} · ${i.incident_type}` : '';
  }, [byId]);
  return { ...query, incidents: query.data ?? [], incidentLabel };
}

/** Runs the SLA sweeper on demand (legal team only). */
export function useLegalAlertSweep() {
  const access = useLegalAccess();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (): Promise<number> => {
      if (!access.canEdit) throw new Error('Only the legal team can refresh SLA alerts');
      const { data, error } = await supabase.rpc('legal_generate_alerts', {});
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(count === 1 ? '1 new SLA alert raised' : `${count} new SLA alerts raised`, { description: 'Existing alerts were refreshed.' });
    },
    onError: (error) => toast.error('Could not refresh SLA alerts', { description: errorMessage(error) }),
  });
  return mutation;
}
