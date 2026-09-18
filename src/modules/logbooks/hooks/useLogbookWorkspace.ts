import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeVolume, deleteDraft, fetchCorrectedIds, fetchLegacyEntries, fetchLogbooks, fetchPages, fetchVolumeEntries, fetchVolumes, openVolume, saveLine, sealPage, signEntry,
  type LineInput, type OpenVolumeInput, type SignKind,
} from '../lib/logbookApi';
import type { LogbookBook } from '../lib/catalog';
import type { FlagProfileId, VolumeRow } from '../lib/types';

/**
 * Volumes, entries (with signatures) and sealed pages for one book on the
 * selected vessel, plus the mutations the ruled sheet needs. Every mutation
 * invalidates the queries the strip and review pages depend on.
 */
export function useLogbookWorkspace(vesselId: string | null, book: LogbookBook | undefined, profile: FlagProfileId, volumeId: string | null) {
  const queryClient = useQueryClient();
  const bookId = book?.id ?? null;

  const volumesQuery = useQuery({
    queryKey: ['logbook-volumes', vesselId, bookId],
    enabled: !!vesselId && !!bookId,
    queryFn: () => fetchVolumes(vesselId!, bookId!),
  });
  const volumes = useMemo(() => (volumesQuery.data ?? []).filter((v) => v.flag_profile === profile), [volumesQuery.data, profile]);
  const volume: VolumeRow | null = useMemo(
    () => volumes.find((v) => v.id === volumeId) ?? volumes[volumes.length - 1] ?? null,
    [volumes, volumeId],
  );

  const entriesQuery = useQuery({
    queryKey: ['logbook-volume-entries', volume?.id],
    enabled: !!volume?.id,
    queryFn: () => fetchVolumeEntries(volume!.id),
  });
  const pagesQuery = useQuery({
    queryKey: ['logbook-pages', volume?.id],
    enabled: !!volume?.id,
    queryFn: () => fetchPages(volume!.id),
  });
  const logbooksQuery = useQuery({ queryKey: ['logbooks', vesselId], enabled: !!vesselId, queryFn: () => fetchLogbooks(vesselId!) });
  const logbookRow = useMemo(() => (logbooksQuery.data ?? []).find((row) => row.logbook_type === book?.dbType) ?? null, [logbooksQuery.data, book?.dbType]);
  const legacyQuery = useQuery({
    queryKey: ['logbook-legacy-entries', logbookRow?.id],
    enabled: !!logbookRow?.id,
    queryFn: () => fetchLegacyEntries(logbookRow!.id),
  });

  // Corrections of a closed volume's records live in its continuation, so the
  // current volume's entries alone cannot show which records are already corrected.
  const correctionsQuery = useQuery({
    queryKey: ['logbook-corrections-of', volume?.id],
    enabled: !!volume && volume.status !== 'open' && !!entriesQuery.data,
    queryFn: () => fetchCorrectedIds((entriesQuery.data ?? []).map((e) => e.id)),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['logbook-volume-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-pages'] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-volumes', vesselId] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-entry-counts', vesselId] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-vessel-entries', vesselId] }),
      queryClient.invalidateQueries({ queryKey: ['logbooks', vesselId] }),
      queryClient.invalidateQueries({ queryKey: ['logbook-corrections-of'] }),
    ]);
  };

  const save = useMutation({ mutationFn: (input: LineInput) => saveLine(input), onSuccess: invalidateAll });
  const discard = useMutation({ mutationFn: (id: string) => deleteDraft(id), onSuccess: invalidateAll });
  const sign = useMutation({
    mutationFn: ({ id, version, kind, witness }: { id: string; version: number; kind: SignKind; witness?: { name: string; capacity: string } }) =>
      signEntry(id, version, kind, witness),
    onSuccess: invalidateAll,
  });
  const seal = useMutation({
    mutationFn: ({ sectionId, entryIds }: { sectionId: string; entryIds: string[] }) => sealPage(volume!.id, sectionId, entryIds),
    onSuccess: invalidateAll,
  });
  const open = useMutation({ mutationFn: (input: OpenVolumeInput) => openVolume(input), onSuccess: invalidateAll });
  const close = useMutation({
    mutationFn: ({ place, reason }: { place: string; reason: string }) => closeVolume(volume!.id, volume!.version, place, reason),
    onSuccess: invalidateAll,
  });

  return {
    volumes,
    allVolumes: volumesQuery.data ?? [],
    volume,
    entries: entriesQuery.data ?? [],
    pages: pagesQuery.data ?? [],
    logbookRow,
    legacyEntries: legacyQuery.data ?? [],
    /** Records of this volume already corrected elsewhere (continuation volumes). */
    correctedElsewhere: correctionsQuery.data ?? [],
    isLoading: volumesQuery.isLoading || logbooksQuery.isLoading || (!!volume && (entriesQuery.isLoading || pagesQuery.isLoading)),
    refetch: invalidateAll,
    save, discard, sign, seal, open, close,
  };
}
