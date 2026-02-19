import { supabase } from '@/integrations/supabase/client';

export interface FlightSegment {
  airline?: string | null;
  flightNumber?: string | null;
  departureAirport?: string | null;
  departureCity?: string | null;
  departureDateTime?: string | null;
  arrivalAirport?: string | null;
  arrivalCity?: string | null;
  arrivalDateTime?: string | null;
}

export interface FlightExtractionResult {
  passengerName?: string | null;
  bookingReference?: string | null;
  ticketNumber?: string | null;
  flights?: FlightSegment[];
  confidence?: number;
}

export interface DocumentMetadataExtraction {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  document_number?: string | null;
  detected_document_type?: string | null;
  confidence?: number;
  entities?: {
    crew_name?: string | null;
    vessel_name?: string | null;
    booking_reference?: string | null;
    origin_location?: string | null;
    destination_location?: string | null;
  };
  dates?: {
    issue_date?: string | null;
    valid_from?: string | null;
    valid_until?: string | null;
    next_review_date?: string | null;
    travel_date?: string | null;
  };
}

interface FileBase64Payload {
  base64: string;
  mimeType: string;
}

export async function fileToBase64Payload(file: File): Promise<FileBase64Payload> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIndex = result.indexOf(',');
      if (commaIndex < 0) {
        reject(new Error('Unable to parse data URL'));
        return;
      }
      resolve(result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  return {
    base64,
    mimeType: file.type || 'application/octet-stream',
  };
}

export async function extractFlightData(input: {
  documentType: string;
  filePath?: string;
  file?: File;
}): Promise<FlightExtractionResult | null> {
  try {
    let body: Record<string, unknown> = {
      documentType: input.documentType,
    };

    if (input.filePath) {
      body.filePath = input.filePath;
    } else if (input.file) {
      const payload = await fileToBase64Payload(input.file);
      body.base64Content = payload.base64;
      body.mimeType = payload.mimeType;
    } else {
      return null;
    }

    const { data, error } = await supabase.functions.invoke('extract-flight-data', { body });
    if (error || !data || data.error) {
      return null;
    }

    return data as FlightExtractionResult;
  } catch (error) {
    console.error('extractFlightData failed:', error);
    return null;
  }
}

export async function extractDocumentMetadata(input: {
  file: File;
  documentType?: string;
  hintTitle?: string;
}): Promise<DocumentMetadataExtraction | null> {
  try {
    const payload = await fileToBase64Payload(input.file);
    const { data, error } = await supabase.functions.invoke('extract-document-metadata', {
      body: {
        file_base64: payload.base64,
        file_mime_type: payload.mimeType,
        document_type: input.documentType || null,
        hint_title: input.hintTitle || null,
      },
    });

    if (error || !data || data.success === false) {
      return null;
    }

    return data as DocumentMetadataExtraction;
  } catch (error) {
    console.error('extractDocumentMetadata failed:', error);
    return null;
  }
}

export function pickBestDate(candidates: Array<string | null | undefined>): string | null {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = candidate.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
  }
  return null;
}

export function matchCrewIdFromName(
  extractedName: string | null | undefined,
  crewMembers: Array<{ id: string; first_name: string; last_name: string }>,
): string | null {
  if (!extractedName) return null;

  const normalizedTarget = extractedName.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!normalizedTarget) return null;

  const exact = crewMembers.find((crew) => {
    const full = `${crew.first_name} ${crew.last_name}`.toLowerCase();
    return full === normalizedTarget;
  });
  if (exact) return exact.id;

  const partial = crewMembers.find((crew) => {
    const first = crew.first_name.toLowerCase();
    const last = crew.last_name.toLowerCase();
    return normalizedTarget.includes(first) && normalizedTarget.includes(last);
  });

  return partial?.id || null;
}

