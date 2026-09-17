/**
 * Data-service boundary for the logbook workspace. Every Supabase call the
 * module makes lives here so the hooks stay declarative and a different
 * backend (the planned onboard service) can be substituted later.
 */
import { supabase } from '@/integrations/supabase/client';
import type { LogbookBook } from './catalog';
import { referenceFor } from './catalog';
import { templateRevision } from './templates';
import { vesselSheetSections } from './vesselSheets';
import type {
  AuditRow, EntryRow, EntryView, FlagProfileId, LogbookRow, PageRow, RegistryRow, RegistrySource, SampleRow, SignatureRow, VolumeRow, VolumeTemplate,
} from './types';
import type { SampleInput } from './telemetry';

type Json = never;

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

// ── Logbooks ────────────────────────────────────────────────────────────────
export async function fetchLogbooks(vesselId: string): Promise<LogbookRow[]> {
  const { data, error } = await supabase.from('logbooks').select('*').eq('vessel_id', vesselId);
  fail(error);
  return (data ?? []) as unknown as LogbookRow[];
}

export async function ensureLogbook(companyId: string, vesselId: string, book: LogbookBook): Promise<LogbookRow> {
  const { data: existing, error } = await supabase
    .from('logbooks').select('*').eq('vessel_id', vesselId).eq('logbook_type', book.dbType as Json).maybeSingle();
  fail(error);
  if (existing) return existing as unknown as LogbookRow;
  const { data, error: insertError } = await supabase
    .from('logbooks')
    .insert({ company_id: companyId, vessel_id: vesselId, logbook_type: book.dbType as Json, name: book.title, description: book.description, is_statutory: book.statutory })
    .select('*').single();
  if (insertError) throw new Error('This logbook has not been opened for the vessel yet, and your role cannot open it. Ask the Master to open the first volume.');
  return data as unknown as LogbookRow;
}

// ── Volumes ─────────────────────────────────────────────────────────────────
export async function fetchVolumes(vesselId: string, bookId?: string): Promise<VolumeRow[]> {
  let query = supabase.from('logbook_volumes').select('*').eq('vessel_id', vesselId).order('sequence', { ascending: true });
  if (bookId) query = query.eq('book_id', bookId);
  const { data, error } = await query;
  fail(error);
  return (data ?? []) as unknown as VolumeRow[];
}

export interface OpenVolumeInput {
  companyId: string;
  vesselId: string;
  /** Used to attach vessel-specific readings sheets (e.g. the DAGON engine-room log) to the volume template. */
  vesselName?: string | null;
  book: LogbookBook;
  profile: FlagProfileId;
  label: string;
  particulars: Record<string, unknown>;
  registrySource: RegistrySource | null;
  continuationOf: string | null;
}

export function buildTemplate(book: LogbookBook, vesselName?: string | null): VolumeTemplate {
  return {
    revision: templateRevision, title: book.title, basis: book.basis, roles: book.roles,
    sections: [...book.sections, ...vesselSheetSections(book.slug, vesselName)],
    reference: referenceFor(book),
  };
}

export async function openVolume(input: OpenVolumeInput): Promise<VolumeRow> {
  const logbook = await ensureLogbook(input.companyId, input.vesselId, input.book);
  const { data, error } = await supabase
    .from('logbook_volumes')
    .insert({
      logbook_id: logbook.id,
      company_id: input.companyId,
      vessel_id: input.vesselId,
      book_id: input.book.id,
      flag_profile: input.profile,
      label: input.label,
      template_revision: templateRevision,
      template: buildTemplate(input.book, input.vesselName) as unknown as Json,
      cover_fields: input.book.coverFields as unknown as Json,
      particulars: input.particulars as Json,
      registry_source: (input.registrySource ?? null) as Json,
      continuation_of: input.continuationOf,
    })
    .select('*').single();
  fail(error);
  return data as unknown as VolumeRow;
}

export async function closeVolume(volumeId: string, expectedVersion: number, place: string, reason: string): Promise<VolumeRow> {
  const { data, error } = await supabase.rpc('logbook_close_volume', { p_volume_id: volumeId, p_expected_version: expectedVersion, p_place: place, p_reason: reason });
  fail(error);
  return data as unknown as VolumeRow;
}

// ── Entries ─────────────────────────────────────────────────────────────────
const ENTRY_SELECT = '*, signatures:logbook_signatures(*)';

const normalise = (rows: unknown[]): EntryView[] =>
  (rows as Array<EntryRow & { signatures: SignatureRow[] | null }>).map((row) => ({
    ...row,
    signatures: [...(row.signatures ?? [])].sort((a, b) => a.signed_at.localeCompare(b.signed_at)),
  }));

export async function fetchVolumeEntries(volumeId: string): Promise<EntryView[]> {
  const { data, error } = await supabase
    .from('logbook_entries').select(ENTRY_SELECT).eq('volume_id', volumeId)
    .order('line_number', { ascending: true }).order('created_at', { ascending: true });
  fail(error);
  return normalise(data ?? []);
}

export async function fetchVesselEntries(vesselId: string, limit = 500): Promise<EntryView[]> {
  const { data, error } = await supabase
    .from('logbook_entries').select(ENTRY_SELECT).eq('vessel_id', vesselId)
    .order('entry_at', { ascending: false }).limit(limit);
  fail(error);
  return normalise(data ?? []);
}

export async function fetchEntry(id: string): Promise<EntryView | null> {
  const { data, error } = await supabase.from('logbook_entries').select(ENTRY_SELECT).eq('id', id).maybeSingle();
  fail(error);
  return data ? normalise([data])[0] : null;
}

export interface EntryCountRow { logbook_id: string; status: string; superseded_by_id: string | null; recorded_by: string | null; volume_id: string | null; }

export async function fetchEntryCounts(vesselId: string): Promise<EntryCountRow[]> {
  const { data, error } = await supabase
    .from('logbook_entries').select('logbook_id, status, superseded_by_id, recorded_by, volume_id').eq('vessel_id', vesselId);
  fail(error);
  return (data ?? []) as EntryCountRow[];
}

export interface LineInput {
  id?: string;
  expectedVersion?: number;
  logbookId: string;
  companyId: string;
  vesselId: string;
  volumeId: string;
  sectionId: string;
  entryAt: string;
  data: Record<string, unknown>;
  remarks: string | null;
  sourceSampleId: string | null;
  overrideReason: string | null;
  amendedFromId?: string | null;
  amendmentReason?: string | null;
}

export async function saveLine(input: LineInput): Promise<EntryRow> {
  if (input.id) {
    const { data, error } = await supabase
      .from('logbook_entries')
      .update({
        entry_at: input.entryAt,
        data: input.data as Json,
        remarks: input.remarks,
        summary: input.remarks ? input.remarks.slice(0, 140) : null,
        source_sample_id: input.sourceSampleId,
        override_reason: input.overrideReason,
      })
      .eq('id', input.id)
      .eq('version', input.expectedVersion ?? -1)
      .select('*');
    fail(error);
    if (!data || data.length === 0) throw new Error('This record changed. Refresh it before continuing.');
    return data[0] as unknown as EntryRow;
  }
  const { data, error } = await supabase
    .from('logbook_entries')
    .insert({
      logbook_id: input.logbookId,
      company_id: input.companyId,
      vessel_id: input.vesselId,
      volume_id: input.volumeId,
      section_id: input.sectionId,
      entry_at: input.entryAt,
      data: input.data as Json,
      remarks: input.remarks,
      summary: input.remarks ? input.remarks.slice(0, 140) : null,
      source_sample_id: input.sourceSampleId,
      override_reason: input.overrideReason,
      amended_from_id: input.amendedFromId ?? null,
      amendment_reason: input.amendmentReason ?? null,
    })
    .select('*').single();
  fail(error);
  return data as unknown as EntryRow;
}

/** Ids among `entryIds` that already have a linked correction, in this or any continuation volume. */
export async function fetchCorrectedIds(entryIds: string[]): Promise<string[]> {
  if (entryIds.length === 0) return [];
  const { data, error } = await supabase.from('logbook_entries').select('amended_from_id').in('amended_from_id', entryIds);
  fail(error);
  return (data ?? []).map((row) => row.amended_from_id).filter((id): id is string => Boolean(id));
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from('logbook_entries').delete().eq('id', id).eq('status', 'draft');
  fail(error);
}

export type SignKind = 'author' | 'countersign' | 'verify' | 'acknowledge' | 'attested';

export async function signEntry(id: string, expectedVersion: number, kind: SignKind, witness?: { name: string; capacity: string }): Promise<EntryRow> {
  const { data, error } = await supabase.rpc('logbook_sign_entry', {
    p_entry_id: id, p_expected_version: expectedVersion, p_kind: kind,
    p_witness_name: witness?.name, p_witness_capacity: witness?.capacity,
  });
  fail(error);
  return data as unknown as EntryRow;
}

// ── Pages ───────────────────────────────────────────────────────────────────
export async function fetchPages(volumeId: string): Promise<PageRow[]> {
  const { data, error } = await supabase.from('logbook_pages').select('*').eq('volume_id', volumeId).order('page_number', { ascending: true });
  fail(error);
  return (data ?? []) as unknown as PageRow[];
}

export async function sealPage(volumeId: string, sectionId: string, entryIds: string[]): Promise<PageRow> {
  const { data, error } = await supabase.rpc('logbook_seal_page', { p_volume_id: volumeId, p_section_id: sectionId, p_entry_ids: entryIds });
  fail(error);
  return data as unknown as PageRow;
}

// ── Registries ──────────────────────────────────────────────────────────────
export async function fetchRegistries(vesselId: string): Promise<RegistryRow[]> {
  const { data, error } = await supabase.from('logbook_registries').select('*').eq('vessel_id', vesselId);
  fail(error);
  return (data ?? []) as unknown as RegistryRow[];
}

export interface RegistryInput {
  companyId: string;
  vesselId: string;
  profile: FlagProfileId;
  expectedVersion: number;
  fields: Record<string, unknown>;
  bookDefaults: Record<string, Record<string, unknown>>;
  autoPopulateCover: boolean;
}

export async function saveRegistry(input: RegistryInput): Promise<RegistryRow> {
  if (input.expectedVersion === 0) {
    const { data, error } = await supabase
      .from('logbook_registries')
      .insert({ company_id: input.companyId, vessel_id: input.vesselId, flag_profile: input.profile, fields: input.fields as Json, book_defaults: input.bookDefaults as Json, auto_populate_cover: input.autoPopulateCover })
      .select('*').single();
    fail(error);
    return data as unknown as RegistryRow;
  }
  const { data, error } = await supabase
    .from('logbook_registries')
    .update({ fields: input.fields as Json, book_defaults: input.bookDefaults as Json, auto_populate_cover: input.autoPopulateCover })
    .eq('vessel_id', input.vesselId).eq('flag_profile', input.profile).eq('version', input.expectedVersion)
    .select('*');
  fail(error);
  if (!data || data.length === 0) throw new Error('Registry changed. Reload it before saving.');
  return data[0] as unknown as RegistryRow;
}

// ── Samples ─────────────────────────────────────────────────────────────────
export async function fetchSamples(vesselId: string, limit = 40): Promise<SampleRow[]> {
  const { data, error } = await supabase.from('logbook_samples').select('*').eq('vessel_id', vesselId).order('observed_at', { ascending: false }).limit(limit);
  fail(error);
  return (data ?? []) as unknown as SampleRow[];
}

export async function captureSample(companyId: string, vesselId: string, sample: SampleInput): Promise<SampleRow> {
  const { data, error } = await supabase
    .from('logbook_samples')
    .insert({
      company_id: companyId, vessel_id: vesselId, sample_type: sample.sample_type, source: sample.source, protocol: sample.protocol,
      mode: sample.mode, quality: sample.quality, observed_at: sample.observed_at, received_at: sample.received_at,
      values: sample.values as Json, raw: sample.raw as Json,
    })
    .select('*').single();
  fail(error);
  return data as unknown as SampleRow;
}

// ── Audit ───────────────────────────────────────────────────────────────────
export async function fetchAudit(vesselId: string, limit = 300): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('logbook_entry_audit').select('id, entry_id, action, changed_fields, old_values, new_values, actor_id, actor_name, created_at')
    .eq('vessel_id', vesselId).order('created_at', { ascending: false }).limit(limit);
  fail(error);
  return (data ?? []) as unknown as AuditRow[];
}

export async function fetchEntryAudit(entryId: string): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from('logbook_entry_audit').select('id, entry_id, action, changed_fields, old_values, new_values, actor_id, actor_name, created_at')
    .eq('entry_id', entryId).order('created_at', { ascending: true });
  fail(error);
  return (data ?? []) as unknown as AuditRow[];
}

// ── Roles ───────────────────────────────────────────────────────────────────
export async function fetchUserRoles(userId: string): Promise<string[]> {
  const { data, error } = await supabase.from('user_roles').select('role, is_active, expires_at').eq('user_id', userId);
  if (error) return [];
  return (data ?? [])
    .filter((row) => row.is_active !== false && (!row.expires_at || Date.parse(row.expires_at) > Date.now()))
    .map((row) => String(row.role));
}

/** Entries recorded before volumes existed (the original dialog-era module). Kept read-only. */
export async function fetchLegacyEntries(logbookId: string): Promise<EntryView[]> {
  const { data, error } = await supabase
    .from('logbook_entries').select(ENTRY_SELECT).eq('logbook_id', logbookId).is('volume_id', null)
    .order('entry_at', { ascending: true }).limit(500);
  fail(error);
  return normalise(data ?? []);
}
