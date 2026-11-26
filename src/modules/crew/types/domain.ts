/**
 * Crew domain types shared by the crew pages (X1; gap/04). Plain data and
 * labels only: no client, no React, so lib/ and tests import it freely.
 *
 * X1-01: positions and departments (DECISIONS C22, D-X1-1), position
 * manning (gap/04 C12, C49) and the reference data (countries, languages;
 * gap/04 C71). The database rows are in ./db.pending.ts; these are the
 * camel-case shapes the hooks return.
 */

/** Rank tiers of a position, highest first (the PMS catalogue's tiers). */
export const RANK_TIERS = ['command', 'hod', 'officer', 'rating', 'trainee'] as const;
export type RankTier = (typeof RANK_TIERS)[number];

export const RANK_TIER_LABEL: Record<RankTier, string> = {
  command: 'Command',
  hod: 'Head of department',
  officer: 'Officer',
  rating: 'Rating',
  trainee: 'Trainee',
};

/** PMS access-set keys a position can default to (X6 adds the access sets themselves). */
export const ACCESS_SET_KEYS = ['full_vessel', 'hod', 'officer', 'crew', 'view_only'] as const;
export type AccessSetKey = (typeof ACCESS_SET_KEYS)[number];

export const ACCESS_SET_LABEL: Record<AccessSetKey, string> = {
  full_vessel: 'Full vessel access',
  hod: 'Head of department',
  officer: 'Officer',
  crew: 'Crew',
  view_only: 'View only',
};

/** The default access set a new position takes from its tier (the server applies the same rule). */
export const DEFAULT_ACCESS_SET_FOR_TIER: Record<RankTier, AccessSetKey> = {
  command: 'full_vessel',
  hod: 'hod',
  officer: 'officer',
  rating: 'crew',
  trainee: 'crew',
};

/** Where a position row lives: STORM's catalogue, the company, or one vessel. */
export type PositionScope = 'system' | 'company' | 'vessel';

export const POSITION_SCOPE_LABEL: Record<PositionScope, string> = {
  system: 'STORM catalogue',
  company: 'Company',
  vessel: 'This vessel',
};

export interface Department {
  key: string;
  label: string;
  sortOrder: number;
}

/** One position as a vessel sees it (crew_positions_for_vessel). */
export interface VesselPosition {
  positionId: string;
  scope: PositionScope;
  key: string;
  name: string;
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  rankTier: RankTier;
  defaultAccessSetKey: AccessSetKey | null;
  stcwCapacity: string | null;
  /** The position's own rank order (STORM's or the company's). */
  baseSortOrder: number;
  /** The vessel's rank order: its override, else the base order. */
  sortOrder: number;
  isListed: boolean;
  minOnBoard: number;
  maxOnBoard: number | null;
  /** Current assignments on the vessel whose title maps to this position. */
  holderCount: number;
}

/** A title used on the vessel that maps to no position (crew_vessel_unmatched_titles). */
export interface UnmatchedTitle {
  title: string;
  titleKey: string;
  holderCount: number;
}

export interface Country {
  iso2: string;
  iso3: string;
  name: string;
  demonym: string | null;
  dialCode: string | null;
  flagEmoji: string | null;
  sortName: string;
}

export interface Language {
  code: string;
  name: string;
  sortOrder: number;
}

/** Language proficiency for a second or later language (crew_languages, X1-03). */
export const LANGUAGE_PROFICIENCIES = ['basic', 'conversational', 'advanced', 'fluent'] as const;
export type LanguageProficiency = (typeof LANGUAGE_PROFICIENCIES)[number];

export const LANGUAGE_PROFICIENCY_LABEL: Record<LanguageProficiency, string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  advanced: 'Advanced',
  fluent: 'Fluent',
};
