/**
 * Command palette public API (gap/10 IA12, BUILD-PLAN S5). Import from here
 * only: `import { CommandPaletteProvider, useCommandPalette } from
 * '@/shared/components/command-palette'`.
 */
export { default as CommandPaletteProvider } from './CommandPaletteProvider';
export { default as CommandPalette } from './CommandPalette';
export { useCommandPalette, useCommandPaletteInitialQuery, INERT_COMMAND_PALETTE } from './context';
export { preloadCommandPalette } from './preload';
export {
  RECORD_REFERENCE_PATTERN,
  RECORD_REFERENCE_PROVIDERS,
  looksLikeRecordReference,
  searchRecordReferences,
} from './recordReferences';
export type { CommandPaletteApi, RecordReferenceMatch, RecordReferenceProvider } from './types';
