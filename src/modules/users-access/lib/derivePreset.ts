import { CREW_MODULE_KEYS, PRESET_MATRIX, type AccessPreset, type PermissionLevel } from './presets';

export type UserPermMap = Record<string, PermissionLevel | null>;

export function derivePreset(perms: UserPermMap): AccessPreset {
  for (const preset of ['full_access', 'department_head', 'view_only'] as const) {
    const matrix = PRESET_MATRIX[preset];
    const match = CREW_MODULE_KEYS.every((k) => (perms[k] ?? null) === (matrix[k] ?? null));
    if (match) return preset;
  }
  return 'custom';
}