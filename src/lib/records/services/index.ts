/**
 * Record-engine services (Phase 2 spec §B.6): typed RPC wrappers and reads
 * over the pending client, built on the pure engines in `src/lib/records`;
 * React Query hooks in ./hooks.ts and page-state helpers in ./uiState.ts.
 */
export * from './keys';
export * from './results';
export * from './envelopes';
export * from './transitions';
export * from './signatures';
export * from './threads';
export * from './attachments';
export * from './links';
export * from './exports';
export * from './uiState';
export * from './hooks';
export type * from './db.pending';
