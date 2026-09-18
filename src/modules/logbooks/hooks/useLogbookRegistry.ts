import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRegistries, saveRegistry, type RegistryInput } from '../lib/logbookApi';
import type { FlagProfileId, RegistryRow } from '../lib/types';

export function useLogbookRegistry(vesselId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['logbook-registries', vesselId], enabled: !!vesselId, queryFn: () => fetchRegistries(vesselId!) });
  const registries = query.data ?? [];
  const forProfile = (profile: FlagProfileId): RegistryRow | null => registries.find((r) => r.flag_profile === profile) ?? null;

  const save = useMutation({
    mutationFn: (input: RegistryInput) => saveRegistry(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['logbook-registries', vesselId] }),
  });

  return { registries, forProfile, isLoading: query.isLoading, save, refetch: query.refetch };
}
