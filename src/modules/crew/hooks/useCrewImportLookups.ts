import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { RANKS, NATIONALITIES } from '@/modules/crew/constants';

/**
 * Live distinct roles, nationalities, departments and vessels sourced from
 * the imported crew roster (`crew_import_active`) and `vessels_import` tables.
 *
 * Falls back to the curated constants if the query is still loading or empty,
 * so existing forms never render with empty dropdowns.
 */
export const useCrewImportLookups = () => {
  const rolesQuery = useQuery({
    queryKey: ['crew-import-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crew_import_active')
        .select('role')
        .not('role', 'is', null);
      if (error) throw error;
      const set = new Set<string>();
      data?.forEach((r: { role: string | null }) => {
        if (r.role) set.add(r.role.trim());
      });
      return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60_000,
  });

  const nationalitiesQuery = useQuery({
    queryKey: ['crew-import-nationalities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crew_import_active')
        .select('nationality')
        .not('nationality', 'is', null);
      if (error) throw error;
      const set = new Set<string>();
      data?.forEach((r: { nationality: string | null }) => {
        if (r.nationality) set.add(r.nationality.trim());
      });
      return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60_000,
  });

  const departmentsQuery = useQuery({
    queryKey: ['crew-import-departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crew_import_active')
        .select('department')
        .not('department', 'is', null);
      if (error) throw error;
      const set = new Set<string>();
      data?.forEach((r: { department: string | null }) => {
        if (r.department) set.add(r.department.trim());
      });
      return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
    },
    staleTime: 5 * 60_000,
  });

  const vesselsQuery = useQuery({
    queryKey: ['vessels-import'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vessels_import')
        .select('id, airtable_id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  // Merge live values with the curated constants so dropdowns are never empty
  // and any new role/nationality from the import shows up automatically.
  const ranks = Array.from(
    new Set([...(rolesQuery.data ?? []), ...RANKS]),
  ).sort((a, b) => a.localeCompare(b));

  const nationalities = Array.from(
    new Set([...(nationalitiesQuery.data ?? []), ...NATIONALITIES]),
  ).sort((a, b) => a.localeCompare(b));

  return {
    ranks,
    nationalities,
    departments: departmentsQuery.data ?? [],
    vessels: vesselsQuery.data ?? [],
    isLoading:
      rolesQuery.isLoading ||
      nationalitiesQuery.isLoading ||
      departmentsQuery.isLoading ||
      vesselsQuery.isLoading,
  };
};
