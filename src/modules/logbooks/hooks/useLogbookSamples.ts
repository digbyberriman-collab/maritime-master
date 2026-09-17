import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { captureSample, fetchSamples } from '../lib/logbookApi';
import { simulate, parseRmc, type SampleType } from '../lib/telemetry';

/** Captured readings for the vessel (simulated or pasted NMEA). No live gateway is connected. */
export function useLogbookSamples(vesselId: string | null, companyId: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['logbook-samples', vesselId],
    enabled: !!vesselId,
    refetchInterval: 30000,
    queryFn: () => fetchSamples(vesselId!),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['logbook-samples', vesselId] });

  const simulateSample = useMutation({
    mutationFn: async (type: SampleType) => {
      if (!vesselId || !companyId) throw new Error('Select a vessel first.');
      return captureSample(companyId, vesselId, simulate(type));
    },
    onSuccess: invalidate,
  });

  const pasteRmc = useMutation({
    mutationFn: async (sentence: string) => {
      if (!vesselId || !companyId) throw new Error('Select a vessel first.');
      return captureSample(companyId, vesselId, parseRmc(sentence));
    },
    onSuccess: invalidate,
  });

  return { samples: query.data ?? [], isLoading: query.isLoading, simulateSample, pasteRmc, refetch: query.refetch };
}
