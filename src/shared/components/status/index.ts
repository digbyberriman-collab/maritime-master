/**
 * Status display (gap/10 DS12, §A.8; BUILD-PLAN A6).
 *
 *   <StatusPill domain="incident" status={row.status} />
 *   <WhoseMoveChip move={envelope.whose_move} since={envelope.moved_at} />
 *   <ExpiryPill expiresOn={doc.expiry_date} windowDays={rule.warn_days} />
 *
 * Use these instead of a module-local colour helper. Never pair raw palette
 * classes with a status.
 */
export { StatusPill, type StatusPillProps } from './StatusPill';
export { WhoseMoveChip, type WhoseMoveChipProps } from './WhoseMoveChip';
export { ExpiryPill, type ExpiryPillProps } from './ExpiryPill';
export {
  STATUS_DOMAINS,
  STATUS_REGISTRY,
  humanizeStatus,
  normalizeStatusKey,
  statusLabel,
  statusMeta,
  statusTone,
  statusVocabulary,
  type StatusDomain,
  type StatusEntry,
  type StatusMeta,
} from './statusTone';
export { expiryDetail, formatWaiting, isExpiryBucket, resolveExpiry, waitingDays, type ResolvedExpiry } from './helpers';
export { TONES, TONE_FILL, TONE_SURFACE, TONE_TEXT, TONE_BAR, isTone, type Tone } from '@/components/ui/tones';
