/**
 * Which profile tab a crew document sits on (X1-04; gap/04 C23, C24,
 * T-185): the tab is a property of the document's category, never of how a
 * person filed it. Medical certificates are Documents, never Qualifications.
 *
 * - SYSTEM_CATEGORY_TAB mirrors the 37 categories seeded by
 *   20261124060400_crew_document_catalogue.sql (src/test/crew/documentState.test.ts
 *   parses the seed and compares). The live categories come from
 *   crew_document_categories (useDocumentTypes); this table answers while
 *   the catalogue is not applied and for the legacy fallback.
 * - legacyDocumentKey mirrors SQL crew_document_legacy_key(), and
 *   LEGACY_CATEGORY mirrors the seeded legacy map (every
 *   MARITIME_CERTIFICATE_TYPES string of the certificates module), so a
 *   legacy row lands on the same tab before and after the catalogue.
 * - readFieldSchema narrows a type's stored field_schema.
 *
 * Pure: no React, no client.
 */
import type { Json } from '@/integrations/supabase/types';
import type { CrewDocumentFieldKey, CrewDocumentFieldSchema, CrewDocumentItemType, CrewDocumentTab } from '../types/db.pending';

export const CREW_DOCUMENT_TABS = ['documents', 'stcw', 'qualifications'] as const satisfies readonly CrewDocumentTab[];

export const CREW_DOCUMENT_TAB_LABEL: Readonly<Record<CrewDocumentTab, string>> = {
  documents: 'Documents',
  stcw: 'STCW',
  qualifications: 'Qualifications',
};

/** Where a document with no type (a legacy row the catalogue could not classify) is shown. */
export const UNCLASSIFIED_TAB: CrewDocumentTab = 'qualifications';

/** The seeded categories and their tab (mirror of 20261124060400). */
export const SYSTEM_CATEGORY_TAB: Readonly<Record<string, CrewDocumentTab>> = {
  passports: 'documents',
  seafarer_identity: 'documents',
  visas: 'documents',
  work_permits: 'documents',
  medical_fitness: 'documents',
  health_records: 'documents',
  identity_other: 'documents',
  licences: 'documents',
  other_documents: 'documents',
  stcw_basic: 'stcw',
  stcw_survival_craft: 'stcw',
  stcw_fire: 'stcw',
  stcw_medical: 'stcw',
  stcw_security: 'stcw',
  stcw_passenger: 'stcw',
  stcw_special_ships: 'stcw',
  stcw_navigation: 'stcw',
  stcw_leadership: 'stcw',
  stcw_engineering: 'stcw',
  coc_deck: 'qualifications',
  coc_deck_yacht: 'qualifications',
  coc_engineering: 'qualifications',
  coc_engineering_yacht: 'qualifications',
  coc_electro: 'qualifications',
  radio: 'qualifications',
  flag_endorsements: 'qualifications',
  ratings: 'qualifications',
  dynamic_positioning: 'qualifications',
  diving: 'qualifications',
  tenders_watersports: 'qualifications',
  helicopter_offshore: 'qualifications',
  culinary: 'qualifications',
  interior: 'qualifications',
  wellness: 'qualifications',
  technical_trades: 'qualifications',
  security_services: 'qualifications',
  other_qualifications: 'qualifications',
};

/** A category row (crew_document_categories), as far as the tab needs it. */
export interface CategoryTab {
  key: string;
  tab: CrewDocumentTab;
}

export function isCrewDocumentTab(value: unknown): value is CrewDocumentTab {
  return typeof value === 'string' && (CREW_DOCUMENT_TABS as readonly string[]).includes(value);
}

/**
 * The tab of a category: the live catalogue's answer when given, else the
 * seeded table, else Qualifications (an unknown or missing category).
 */
export function tabForCategory(categoryKey: string | null | undefined, categories?: readonly CategoryTab[]): CrewDocumentTab {
  if (!categoryKey) return UNCLASSIFIED_TAB;
  const live = categories?.find((c) => c.key === categoryKey);
  if (live && isCrewDocumentTab(live.tab)) return live.tab;
  return SYSTEM_CATEGORY_TAB[categoryKey] ?? UNCLASSIFIED_TAB;
}

// ---------------------------------------------------------------- legacy certificate strings

/**
 * The normalised key of a legacy certificate string (SQL
 * crew_document_legacy_key): lower case, '&' read as 'and', every run of
 * other characters one underscore, none leading or trailing; null for a
 * blank text.
 */
export function legacyDocumentKey(text: string | null | undefined): string | null {
  const key = String(text ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ /g, '_');
  return key === '' ? null : key;
}

/** The legacy strings of the certificates module and the category of the type each maps to (mirror of the seeded legacy map). */
export const LEGACY_CATEGORY: Readonly<Record<string, string>> = {
  stcw_basic_safety_training_vi_1: 'stcw_basic',
  stcw_proficiency_in_survival_craft_vi_2: 'stcw_survival_craft',
  stcw_advanced_firefighting_vi_3: 'stcw_fire',
  stcw_medical_first_aid_vi_4: 'stcw_medical',
  stcw_medical_care_vi_4: 'stcw_medical',
  stcw_security_awareness_vi_6: 'stcw_security',
  stcw_crowd_management: 'stcw_passenger',
  stcw_crisis_management: 'stcw_passenger',
  stcw_ship_security_officer: 'stcw_security',
  master_unlimited: 'coc_deck',
  master_3000_gt: 'coc_deck_yacht',
  master_500_gt: 'coc_deck_yacht',
  chief_mate_unlimited: 'coc_deck',
  oow_unlimited: 'coc_deck',
  chief_engineer_unlimited: 'coc_engineering',
  second_engineer_unlimited: 'coc_engineering',
  oicew: 'coc_engineering',
  electro_technical_officer: 'coc_electro',
  yacht_master_offshore: 'coc_deck_yacht',
  yacht_master_ocean: 'coc_deck_yacht',
  eng1_medical_certificate: 'medical_fitness',
  ml5_medical_certificate: 'medical_fitness',
  padi_diving_medical: 'medical_fitness',
  drug_and_alcohol_test: 'health_records',
  huet_helicopter_underwater_escape_training: 'helicopter_offshore',
  bosiet: 'helicopter_offshore',
  fast_rescue_boat: 'stcw_survival_craft',
  tender_operator: 'tenders_watersports',
  pwc_license: 'tenders_watersports',
  diving_certification: 'diving',
  lifeguard_certification: 'tenders_watersports',
  flag_state_endorsement: 'flag_endorsements',
  gmdss_radio_operator: 'radio',
  long_range_certificate: 'radio',
  short_range_certificate: 'radio',
  passport: 'passports',
  seamans_book: 'seafarer_identity',
  visa: 'visas',
  food_safety_certificate: 'culinary',
  wine_certification: 'interior',
  other: 'other_qualifications',
};

/** The category a legacy row maps to: its certificate type, then its name (as the SQL backfill). */
export function legacyCategoryFor(certificateType: string | null | undefined, certificateName: string | null | undefined): string | null {
  const byType = legacyDocumentKey(certificateType);
  if (byType && LEGACY_CATEGORY[byType]) return LEGACY_CATEGORY[byType];
  const byName = legacyDocumentKey(certificateName);
  if (byName && LEGACY_CATEGORY[byName]) return LEGACY_CATEGORY[byName];
  return null;
}

/** The tab a legacy row is shown on (Qualifications when it maps to nothing). */
export function tabForLegacy(certificateType: string | null | undefined, certificateName: string | null | undefined): CrewDocumentTab {
  return tabForCategory(legacyCategoryFor(certificateType, certificateName));
}

/** The expiry item type of a category, for the window of a legacy row (passports 270 days, the rest 90). */
export function itemTypeForCategory(categoryKey: string | null | undefined): CrewDocumentItemType {
  switch (categoryKey) {
    case 'passports':
      return 'passport';
    case 'visas':
      return 'visa';
    case 'work_permits':
      return 'work_authorisation';
    case 'medical_fitness':
    case 'health_records':
      return 'medical';
    case 'seafarer_identity':
    case 'identity_other':
    case 'licences':
    case 'other_documents':
      return 'crew_document';
    default:
      return 'crew_qualification';
  }
}

// ---------------------------------------------------------------- field schema

export const CREW_DOCUMENT_FIELD_KEYS = [
  'issuing_office',
  'endorsement_date',
  'capacity',
  'limitations',
  'visa_type',
  'entries',
  'grade',
] as const satisfies readonly CrewDocumentFieldKey[];

/** A type's stored field_schema, narrowed: unknown keys and values are dropped (the server's CHECK allows none). */
export function readFieldSchema(value: Json | null | undefined): CrewDocumentFieldSchema {
  const out: CrewDocumentFieldSchema = {};
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const key of CREW_DOCUMENT_FIELD_KEYS) {
    const v = (value as Record<string, Json | undefined>)[key];
    if (v === 'optional' || v === 'required') out[key] = v;
  }
  return out;
}
