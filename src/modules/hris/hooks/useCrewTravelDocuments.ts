import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export const TRAVEL_DOCUMENTS_BUCKET = 'crew-travel-documents';

export type CrewTravelDocument = Pick<
  Tables<'crew_travel_documents'>,
  | 'id'
  | 'crew_member_id'
  | 'document_type'
  | 'original_filename'
  | 'standardised_filename'
  | 'original_file_path'
  | 'standardised_file_path'
  | 'mime_type'
  | 'file_size_bytes'
  | 'valid_from'
  | 'valid_until'
  | 'verified'
  | 'verified_at'
  | 'extraction_status'
  | 'created_at'
>;

export const CREW_TRAVEL_DOCUMENTS_KEY = ['hris', 'crew-travel-documents'] as const;

/**
 * Read-only list of a crew member's travel documents (passport, visa, etc.)
 * uploaded through the travel-document pipeline. Keyed on the auth user id
 * (`crew_travel_documents.crew_member_id`), so imported crew without an
 * account have nothing here yet.
 */
export function useCrewTravelDocuments(userId: string | null | undefined) {
  return useQuery({
    queryKey: [...CREW_TRAVEL_DOCUMENTS_KEY, userId ?? null],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async (): Promise<CrewTravelDocument[]> => {
      const { data, error } = await supabase
        .from('crew_travel_documents')
        .select(
          'id, crew_member_id, document_type, original_filename, standardised_filename, original_file_path, standardised_file_path, mime_type, file_size_bytes, valid_from, valid_until, verified, verified_at, extraction_status, created_at',
        )
        .eq('crew_member_id', userId as string)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Short-lived signed URL for a file in the travel documents bucket. */
export async function getTravelDocumentSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(TRAVEL_DOCUMENTS_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
