/**
 * Record engines (gap/08): pure TypeScript, no database access.
 *
 * - `dates`       calendar days: `toCalendarDate` for date columns,
 *                 `localCalendarDate` for instants ("days since" ages)
 * - `expiry`      window-relative expiry buckets (DECISIONS C5, D-31)
 * - `reference`   TYPE-VSL-YYYY-NNN / TYPE-YYYY-NNN / VSL-YYYYMMDD-NNN (C21)
 * - `signatures`  ordered signature slots, sign as / witnessed / on behalf,
 *                 pass to, reverse-order removal, stale detection
 * - `companyStep` envelope transitions with the none / acknowledge / sign_off gate
 *                 (return and close-as sources D-30, void rules D-32)
 * - `threads`     status-update threads, requests, follow-up dates
 * - `whoseMove`   vessel / company / none
 * - `registry`    record-kind registry (G7)
 *
 * The SQL functions (`record_transition`, `sign_slot`, …) are the authority;
 * these mirror them for the UI and for shared tests.
 */
export * from './types';
export * from './dates';
export * from './expiry';
export * from './reference';
export * from './signatures';
export * from './companyStep';
export * from './threads';
export * from './whoseMove';
export * from './registry';
