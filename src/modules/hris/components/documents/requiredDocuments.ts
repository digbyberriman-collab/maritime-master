import type { ExpiryTone } from '@/modules/hris/lib/format';

/**
 * Baseline document checklist for a seafarer. Mirrors the REQUIRED_DOCUMENTS
 * idea in src/modules/crew/pages/CrewDocuments.tsx but resolves against the
 * HRIS sources: profile columns for passport/medical and crew_certificates
 * for the rest, matched on certificate type/name keywords.
 */
export interface RequiredDocumentDef {
  key: string;
  label: string;
  /** Where the item is satisfied from. */
  source: 'profile_passport' | 'profile_medical' | 'certificate';
  /** Case-insensitive keywords matched against certificate_type + certificate_name. */
  keywords?: string[];
}

export const REQUIRED_DOCUMENTS: readonly RequiredDocumentDef[] = [
  { key: 'passport', label: 'Passport', source: 'profile_passport' },
  { key: 'seamans_book', label: "Seaman's Book", source: 'certificate', keywords: ['seaman', 'discharge book', 'seafarer identity'] },
  { key: 'stcw_basic', label: 'STCW Basic Safety', source: 'certificate', keywords: ['stcw basic', 'basic safety'] },
  { key: 'medical', label: 'Medical (ENG1/ML5)', source: 'profile_medical', keywords: ['eng1', 'ml5', 'medical certificate'] },
  { key: 'coc', label: 'Certificate of Competency', source: 'certificate', keywords: ['master', 'chief mate', 'oow', 'chief engineer', 'second engineer', 'oicew', 'electro-technical', 'yacht master', 'competency'] },
  { key: 'flag_endorsement', label: 'Flag State Endorsement', source: 'certificate', keywords: ['flag', 'endorsement'] },
  { key: 'gmdss', label: 'GMDSS', source: 'certificate', keywords: ['gmdss'] },
];

export interface CertificateLike {
  certificate_type: string;
  certificate_name: string;
  expiry_date: string | null;
}

export interface RequiredDocumentStatus extends RequiredDocumentDef {
  present: boolean;
  /** Best (latest) expiry among matching records, if any. */
  expiry: string | null;
  tone: ExpiryTone;
}

const matches = (cert: CertificateLike, keywords: string[]) => {
  const haystack = `${cert.certificate_type} ${cert.certificate_name}`.toLowerCase();
  return keywords.some((k) => haystack.includes(k));
};

const latest = (dates: (string | null)[]): string | null =>
  dates.reduce<string | null>((best, d) => (d && (!best || d > best) ? d : best), null);

export function resolveRequiredDocuments(
  input: {
    passport_number: string | null;
    passport_expiry: string | null;
    medical_expiry: string | null;
    certificates: CertificateLike[];
  },
  toneOf: (value: string | null) => ExpiryTone,
): RequiredDocumentStatus[] {
  return REQUIRED_DOCUMENTS.map((def) => {
    const matching = def.keywords ? input.certificates.filter((c) => matches(c, def.keywords ?? [])) : [];
    let present = matching.length > 0;
    let expiry = latest(matching.map((c) => c.expiry_date));

    if (def.source === 'profile_passport') {
      present = present || Boolean(input.passport_number) || Boolean(input.passport_expiry);
      expiry = latest([expiry, input.passport_expiry]);
    } else if (def.source === 'profile_medical') {
      present = present || Boolean(input.medical_expiry);
      expiry = latest([expiry, input.medical_expiry]);
    }

    return { ...def, present, expiry, tone: present ? (expiry ? toneOf(expiry) : 'none') : 'none' };
  });
}
