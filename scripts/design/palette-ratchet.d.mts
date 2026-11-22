/** Types for scripts/design/palette-ratchet.mjs (imported by src/test/design tests). */
export type PaletteCategory = 'palette' | 'hex' | 'dark';
export type PaletteCounts = Record<PaletteCategory, number>;
export type PaletteBaseline = Record<string, PaletteCounts>;

export interface AllowListEntry {
  path: string;
  categories: PaletteCategory[];
  reason: string;
}

export interface RatchetChange {
  path: string;
  category: PaletteCategory;
  baseline: number;
  current: number;
  isNew?: boolean;
}

export declare const CATEGORIES: readonly PaletteCategory[];
export declare const PALETTE_FAMILIES: readonly string[];
export declare const COLOR_UTILITIES: readonly string[];
export declare const PALETTE_CLASS_RE: RegExp;
export declare const ALLOW_LIST: readonly AllowListEntry[];
export declare const BASELINE_PATH: string;

export declare function scanSource(text: string): PaletteCounts;
export declare function paletteClasses(text: string): string[];
export declare function allowedCategories(path: string, text: string): PaletteCategory[];
export declare function isScanned(path: string): boolean;
export declare function scanRepo(root: string): PaletteBaseline;
export declare function totals(counts: PaletteBaseline): PaletteCounts & { files: number };
export declare function compareToBaseline(
  current: PaletteBaseline,
  baseline: PaletteBaseline,
): { increases: RatchetChange[]; decreases: RatchetChange[] };
export declare function nextBaseline(current: PaletteBaseline, baseline: PaletteBaseline, allowIncrease?: boolean): PaletteBaseline;
export declare function readBaseline(root: string): PaletteBaseline;
export declare function serialiseBaseline(files: PaletteBaseline): string;
