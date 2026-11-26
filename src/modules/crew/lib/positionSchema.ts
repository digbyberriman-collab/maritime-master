/**
 * The "+ New position for this vessel" form (X1-01; gap/04 C12): React
 * Hook Form + zod, with the server's rules (crew_position_create) checked
 * before the request so the person sees them at the field:
 *
 * - name: 1 to 80 characters, starting with a letter once normalised;
 * - a department, a rank tier and a default access set (defaulting from
 *   the tier, DEFAULT_ACCESS_SET_FOR_TIER);
 * - vessel only (the default) or the whole company.
 *
 * Duplicates (a position with that key, name or synonym already visible on
 * the vessel) are checked against the loaded positions with
 * existingPositionFor(); the server refuses them too (position_exists).
 */
import { z } from 'zod';
import { requiredText } from '@/shared/lib/form';
import { ACCESS_SET_KEYS, DEFAULT_ACCESS_SET_FOR_TIER, RANK_TIERS, type RankTier, type VesselPosition } from '../types/domain';
import { officeKey, positionSynonym } from './positions';

export const POSITION_NAME_MAX = 80;

export const newPositionSchema = z.object({
  name: requiredText('Give the position a name', POSITION_NAME_MAX).refine((v) => /^[a-z]/.test(officeKey(v)), {
    message: 'Start the name with a letter, for example "Second Engineer"',
  }),
  departmentKey: z.string({ required_error: 'Choose a department' }).min(1, 'Choose a department'),
  rankTier: z.enum(RANK_TIERS, { errorMap: () => ({ message: 'Choose a rank tier' }) }),
  defaultAccessSetKey: z.enum(ACCESS_SET_KEYS, { errorMap: () => ({ message: 'Choose a default access set' }) }),
  vesselOnly: z.boolean(),
});

export type NewPositionValues = z.infer<typeof newPositionSchema>;

export const newPositionDefaults = (departmentKey = ''): NewPositionValues => ({
  name: '',
  departmentKey,
  rankTier: 'rating',
  defaultAccessSetKey: DEFAULT_ACCESS_SET_FOR_TIER.rating,
  vesselOnly: true,
});

/** The access set a tier change should move the field to (only while it still holds the old tier's default). */
export function accessSetAfterTierChange(current: NewPositionValues['defaultAccessSetKey'], from: RankTier, to: RankTier) {
  return current === DEFAULT_ACCESS_SET_FOR_TIER[from] ? DEFAULT_ACCESS_SET_FOR_TIER[to] : current;
}

/**
 * The position a new name would duplicate on this vessel: one whose key or
 * normalised name is the name's key, or whose key the name is a synonym of
 * (crew_position_create's position_exists rule). Null when the name is new.
 */
export function existingPositionFor(name: string, positions: readonly Pick<VesselPosition, 'key' | 'name'>[]): Pick<VesselPosition, 'key' | 'name'> | null {
  const key = officeKey(name);
  if (!key) return null;
  const synonym = positionSynonym(key);
  return positions.find((p) => p.key === key || officeKey(p.name) === key || (synonym !== null && p.key === synonym)) ?? null;
}

/**
 * The schema with the duplicate rule bound to the positions loaded for the
 * vessel, so a duplicate name shows at the field with the other errors.
 */
export function newPositionSchemaFor(existing: readonly Pick<VesselPosition, 'key' | 'name'>[]) {
  return newPositionSchema.superRefine((values, ctx) => {
    const hit = existingPositionFor(values.name ?? '', existing);
    if (hit) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: `"${hit.name}" is already in the catalogue. List it instead.` });
  });
}
