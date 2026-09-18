/**
 * Row shapes for the logbook tables. These mirror the Supabase schema in
 * supabase/migrations/20260917*_logbook_meridian_*.sql.
 */
import type { TemplateField, TemplateSection } from './templates';

export type FlagProfileId = 'CISR' | 'MCA';
export type EntryStatus = 'draft' | 'submitted' | 'signed' | 'verified' | 'amended' | 'finalized';
export type SignatureKind = 'author' | 'countersign' | 'verify' | 'acknowledge' | 'attested';

export interface LogbookRow {
  id: string;
  company_id: string;
  vessel_id: string;
  logbook_type: string;
  name: string;
  description: string | null;
  is_statutory: boolean;
  is_active: boolean;
  last_entry_at: string | null;
}

export interface VolumeTemplate {
  revision: string;
  title: string;
  basis: string;
  /** Author capacities allowed to write in the book (the Master always may). */
  roles: string[];
  sections: TemplateSection[];
  reference: { title: string; url: string; note: string };
}

export interface RegistrySource {
  registry_id: string;
  profile: FlagProfileId;
  version: number;
  saved_at: string | null;
  fields: Record<string, unknown>;
  book_defaults: Record<string, unknown>;
  filled_keys: string[];
}

export interface VolumeRow {
  id: string;
  logbook_id: string;
  company_id: string;
  vessel_id: string;
  book_id: string;
  flag_profile: FlagProfileId;
  label: string;
  sequence: number;
  status: 'open' | 'closed';
  template_revision: string;
  template: VolumeTemplate;
  cover_fields: TemplateField[];
  particulars: Record<string, unknown>;
  registry_source: RegistrySource | null;
  continuation_of: string | null;
  opened_by: string | null;
  opened_by_name: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_at: string | null;
  closure_place: string | null;
  closure_reason: string | null;
  page_count: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SampleRow {
  id: string;
  company_id: string;
  vessel_id: string;
  sample_type: 'navigation' | 'machinery';
  source: string;
  protocol: string | null;
  mode: 'simulated' | 'manual-test' | 'live';
  quality: string | null;
  observed_at: string;
  received_at: string;
  values: Record<string, number>;
  raw: unknown;
  captured_by: string | null;
  captured_by_name: string | null;
  created_at: string;
}

export interface EntryRow {
  id: string;
  logbook_id: string;
  company_id: string;
  vessel_id: string;
  entry_at: string;
  entry_date: string;
  watch_period: string | null;
  page_number: number | null;
  summary: string | null;
  remarks: string | null;
  data: Record<string, unknown>;
  latitude: number | null;
  longitude: number | null;
  position_text: string | null;
  status: EntryStatus;
  recorded_by: string | null;
  recorded_by_name: string | null;
  signed_by: string | null;
  signed_by_name: string | null;
  signed_at: string | null;
  amended_from_id: string | null;
  amendment_reason: string | null;
  version: number;
  updated_by: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  // Meridian extensions
  volume_id: string | null;
  section_id: string | null;
  flag_profile: FlagProfileId | null;
  template_revision: string | null;
  schema_snapshot: TemplateSection | null;
  line_number: number | null;
  digest: string | null;
  source_sample_id: string | null;
  source_snapshot: SampleRow | null;
  override_reason: string | null;
  superseded_by_id: string | null;
  page_id: string | null;
  recorded_capacity: string | null;
}

export interface SignatureRow {
  id: string;
  entry_id: string;
  company_id: string;
  vessel_id: string;
  kind: SignatureKind;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  actor_capacity: string | null;
  witness_name: string | null;
  witness_capacity: string | null;
  digest: string;
  entry_version: number;
  page_id: string | null;
  method: string;
  statement: string | null;
  signed_at: string;
}

export interface PageRow {
  id: string;
  volume_id: string;
  logbook_id: string;
  company_id: string;
  vessel_id: string;
  section_id: string;
  page_number: number;
  entry_ids: string[];
  digests: string[];
  digest: string;
  sealed_by: string | null;
  sealed_by_name: string | null;
  sealed_at: string;
  statement: string | null;
}

export interface RegistryRow {
  id: string;
  company_id: string;
  vessel_id: string;
  flag_profile: FlagProfileId;
  version: number;
  fields: Record<string, unknown>;
  book_defaults: Record<string, Record<string, unknown>>;
  auto_populate_cover: boolean;
  saved_by: string | null;
  saved_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditRow {
  id: string;
  entry_id: string;
  action: string;
  changed_fields: string[] | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

/** An entry together with its signatures, as the workspace renders it. */
export interface EntryView extends EntryRow {
  signatures: SignatureRow[];
}
