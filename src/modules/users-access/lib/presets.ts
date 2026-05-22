import type { Database } from '@/integrations/supabase/types';

export type PermissionLevel = Database['public']['Enums']['permission_level']; // 'view' | 'edit' | 'admin'
export type AccessPreset = 'view_only' | 'department_head' | 'full_access' | 'custom';

export const CREW_MODULE_KEYS = ['crew_roster', 'crew_certificates', 'hr', 'training'] as const;

// What permission a preset grants for each crew-cluster module.
// null = no access (remove override).
export const PRESET_MATRIX: Record<Exclude<AccessPreset, 'custom'>, Record<string, PermissionLevel | null>> = {
  view_only: {
    crew_roster: 'view',
    crew_certificates: 'view',
    hr: null,
    training: 'view',
  },
  department_head: {
    crew_roster: 'edit',
    crew_certificates: 'edit',
    hr: 'view',
    training: 'edit',
  },
  full_access: {
    crew_roster: 'admin',
    crew_certificates: 'admin',
    hr: 'admin',
    training: 'admin',
  },
};

export const PRESET_OPTIONS: Array<{ value: AccessPreset; label: string; description: string }> = [
  { value: 'view_only', label: 'View Only', description: 'Can see crew list only' },
  { value: 'department_head', label: 'Department Head', description: 'Manage crew, approve leave and hours of rest, conduct reviews' },
  { value: 'full_access', label: 'Full Access', description: 'Full access including medical records, employment, and all approvals' },
  { value: 'custom', label: 'Custom', description: 'Configure individual permissions manually' },
];

// The chip groups shown on the list row (screenshot 1).
export const CHIP_GROUPS: Array<{ label: string; moduleKey: string }> = [
  { label: 'Safety', moduleKey: 'ism' },
  { label: 'Certs', moduleKey: 'vessel_certificates' },
  { label: 'Tech', moduleKey: 'maintenance' },
  { label: 'Vessel', moduleKey: 'vessels' },
  { label: 'Charter', moduleKey: 'fleet' },
  { label: 'Acct', moduleKey: 'settings' },
];

export type ChipLevel = 'none' | 'ro' | 'rw';

export function permToChip(p?: PermissionLevel | null): ChipLevel {
  if (!p) return 'none';
  if (p === 'view') return 'ro';
  return 'rw';
}

export function chipToPerm(c: ChipLevel): PermissionLevel | null {
  if (c === 'none') return null;
  if (c === 'ro') return 'view';
  return 'edit';
}