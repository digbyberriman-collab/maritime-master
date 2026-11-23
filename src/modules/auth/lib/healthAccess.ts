import type { MedicalAccess } from '@/modules/auth/lib/medicalAccess';
import type { WellnessAccess } from '@/modules/auth/lib/wellnessAccess';

/**
 * Who may enter the Health & Wellness workspace: anyone with medical or
 * wellness access at any level, self-service included (crew see their own
 * records). The pages inside keep their own gates: clinical pages need
 * medical access, the wellness pages wellness access.
 *
 * One rule for `canAccessModule('health')` (AuthContext) and the workspace
 * entry's nav gate (moduleKey `health` in useNavNodeFilter, D-97), so the
 * Apps entry and the module agree on who gets in.
 */
export function canEnterHealth(
  medical: Pick<MedicalAccess, 'level'>,
  wellness: Pick<WellnessAccess, 'level'>,
): boolean {
  return medical.level !== 'none' || wellness.level !== 'none';
}
