/**
 * Vessel registry rules: which saved details may fill a new volume cover,
 * how particulars rows reuse a fixed cover, and reading freshness.
 */
import type { TemplateField, TemplateSection } from './templates';

const text = (key: string, label: string, extra: Partial<TemplateField> = {}): TemplateField => ({ key, label, type: 'text', required: false, ...extra });

export const registryFields: TemplateField[] = [
  text('shipName', 'Vessel name', { required: true }), text('officialNumber', 'Official / distinctive number'),
  text('imoNumber', 'IMO number'), text('portRegistry', 'Port of registry'),
  text('grossTonnage', 'Gross tonnage', { type: 'number', min: 0, max: 100000000 }),
  text('netTonnage', 'Net tonnage', { type: 'number', min: 0, max: 100000000 }),
  text('vesselType', 'Vessel profile', { type: 'select', options: ['Commercial yacht', 'Private yacht', 'Passenger ship', 'Cargo ship', 'Oil tanker', 'Chemical tanker'] }),
  text('workingLanguage', 'Working language'), text('owner', 'Owner / manager'),
  text('ownerAddress', 'Owner / manager address', { type: 'textarea' }), text('callSign', 'Call sign'), text('mmsi', 'MMSI'),
];

export const registryBookKeys = ['certificateRef', 'tankPlan', 'tankCapacities', 'slopDepths', 'ballastCapacity'];

export interface RegistryLike {
  fields: Record<string, unknown>;
  book_defaults?: Record<string, Record<string, unknown>> | null;
}

/** Book references are isolated by book and flag. Opening place and volume label are always supplied for this volume. */
export function coverFromRegistry(registry: RegistryLike | null | undefined, bookId: string, coverFields: TemplateField[]): Record<string, unknown> {
  if (!registry) return {};
  const eligible: Record<string, unknown> = { ...registry.fields, ...(registry.book_defaults?.[bookId] ?? {}) };
  return Object.fromEntries(
    coverFields
      .filter((f) => (registryFields.some((r) => r.key === f.key) || registryBookKeys.includes(f.key)) && eligible[f.key] !== undefined && eligible[f.key] !== '')
      .map((f) => [f.key, eligible[f.key]]),
  );
}

export interface VolumeLike {
  particulars: Record<string, unknown>;
  registry_source?: { fields?: Record<string, unknown> } | null;
}

/** Particulars rows are prefilled from the volume's fixed cover and pinned registry snapshot. */
export function particularsFromVolume(volume: VolumeLike | null | undefined, section: TemplateSection): Record<string, unknown> {
  if (!volume || section.id !== 'particulars') return {};
  const values = { ...(volume.registry_source?.fields ?? {}), ...volume.particulars };
  return Object.fromEntries(section.fields.filter((f) => values[f.key] !== undefined && values[f.key] !== '').map((f) => [f.key, values[f.key]]));
}

/** Freshness window for automatic reading drafts: two minutes old at most, five seconds of clock lead tolerated. */
export const FRESHNESS_MS = 120000;
export const CLOCK_LEAD_MS = 5000;

export interface SampleLike { sample_type: string; observed_at: string; }

export function isFresh(sample: SampleLike | null | undefined, now = Date.now()): boolean {
  if (!sample) return false;
  const age = now - Date.parse(sample.observed_at);
  return Number.isFinite(age) && age >= -CLOCK_LEAD_MS && age <= FRESHNESS_MS;
}

export function freshReading<T extends SampleLike>(samples: T[], sensor: string | undefined, now = Date.now()): T | null {
  if (!sensor) return null;
  const sample = samples.find((s) => s.sample_type === sensor);
  return sample && isFresh(sample, now) ? sample : null;
}

/** Vessel table columns that seed a registry draft when nothing has been saved yet. */
export function registryFromVessel(vessel: { name: string; imo_number: string | null; gross_tonnage: number | null; call_sign?: string | null; mmsi?: string | null; home_port?: string | null; vessel_type?: string | null } | null): Record<string, unknown> {
  if (!vessel) return {};
  const fields: Record<string, unknown> = { shipName: vessel.name };
  if (vessel.imo_number) fields.imoNumber = vessel.imo_number;
  if (vessel.gross_tonnage != null) fields.grossTonnage = vessel.gross_tonnage;
  if (vessel.call_sign) fields.callSign = vessel.call_sign;
  if (vessel.mmsi) fields.mmsi = vessel.mmsi;
  if (vessel.home_port) fields.portRegistry = vessel.home_port;
  const type = (vessel.vessel_type ?? '').toLowerCase();
  if (type.includes('private')) fields.vesselType = 'Private yacht';
  else if (type.includes('yacht') || type.includes('commercial')) fields.vesselType = 'Commercial yacht';
  return fields;
}

/** Default flag profile from the vessel's registered flag state. */
export function profileForFlag(flagState: string | null | undefined): 'CISR' | 'MCA' {
  const flag = (flagState ?? '').toLowerCase();
  if (flag.includes('united kingdom') || flag.includes('uk') || flag.includes('british') || flag.includes('red ensign')) return 'MCA';
  return 'CISR';
}
