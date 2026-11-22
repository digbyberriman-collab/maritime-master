/** Types for scripts/design/migrate-palette.mjs (imported by src/test/design tests). */
export interface ParsedPaletteClass {
  raw: string;
  variants: string;
  variantList: string[];
  important: boolean;
  util: string;
  color: string;
  shade: number | null;
  opacity: string;
}

export interface ClassChange {
  from: string;
  /** `null` when the class was removed (a redundant dark: variant or a duplicate). */
  to: string | null;
}

export interface ManualItem {
  cls: string;
  reason: string;
}

export interface ClassStringResult {
  output: string;
  changes: ClassChange[];
  manual: ManualItem[];
  hints: string[];
}

export interface SourceReport {
  changes: Array<ClassChange & { line: number }>;
  manual: Array<ManualItem & { line: number }>;
  hex: Array<{ line: number; value: string }>;
  hints: Array<{ line: number; hint: string }>;
}

export declare const NEUTRALS: readonly string[];
export declare const HUE_TOKEN: Readonly<Record<string, string>>;
export declare function splitVariants(raw: string): { variants: string; base: string };
export declare function parsePaletteClass(raw: string): ParsedPaletteClass | null;
export declare function mapPaletteClass(
  parsed: ParsedPaletteClass,
  context?: { tints: Set<string>; solid: string | null },
): { to: string; manual?: undefined } | { to?: undefined; manual: string };
export declare function migrateClassString(text: string): ClassStringResult;
export declare function migrateSource(source: string, fileName?: string): { output: string; report: SourceReport };
