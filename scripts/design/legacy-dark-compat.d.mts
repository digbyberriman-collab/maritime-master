/** Types for scripts/design/legacy-dark-compat.mjs (imported by src/test/design tests). */
export declare const BLOCK_START: string;
export declare const BLOCK_END: string;
export declare const DEEP_CARD_HEX: string;
export declare const TAILWIND_PALETTE: Record<string, Record<number, string>>;
export declare const HUE_TOKEN: Record<string, string>;
export declare const NEUTRALS: string[];
export declare const TOKEN_FILLS: string[];
export declare const REPURPOSED_TOKENS: string[];
/** Excluded by every rule, so a `.light` subtree is left as authored. */
export declare const LIGHT_SUBTREE: string;
/** The at-rule the generated block is wrapped in (`@media screen`). */
export declare const BLOCK_MEDIA: string;

export interface LegacyDarkCompatRule {
  comment: string | null;
  selectors: string[];
  declaration: string;
  /** `dark`: only under `.dark` (the default). `all`: both themes. */
  scope: 'dark' | 'all';
}

export declare function contrastRatio(a: string, b: string): number;
export declare function escapeClass(cls: string): string;
/** Selector for a `hover:<cls>` remap: the class repeated, (0,3,0). */
export declare function hoverSel(cls: string): string;
export declare function remappedTextShades(hue: string): number[];
export declare function buildLegacyDarkCompatRules(): LegacyDarkCompatRule[];
export declare function buildLegacyDarkCompatCss(): string;
export declare function extractLegacyDarkCompatBlock(css: string): string | null;
