import type { PermissionLevel } from './presets';

export interface ModuleGroup {
  key: string;
  label: string;
  moduleKeys: string[];
}

export const OTHER_MODULE_GROUPS: ModuleGroup[] = [
  {
    key: 'safety',
    label: 'Safety',
    moduleKeys: ['ism', 'erm', 'ptw', 'risk_assessments', 'sops', 'drills', 'incidents', 'investigations', 'capa', 'non_conformities', 'observations'],
  },
  { key: 'certificates', label: 'Certificates', moduleKeys: ['vessel_certificates'] },
  { key: 'technical', label: 'Technical', moduleKeys: ['maintenance'] },
  { key: 'vessel', label: 'Vessel', moduleKeys: ['vessels', 'fleet', 'dashboard'] },
  { key: 'charter', label: 'Charter', moduleKeys: ['meetings', 'reports'] },
  { key: 'accounting', label: 'Accounting', moduleKeys: ['insurance', 'settings', 'audits_surveys', 'documents'] },
];

const RANK: Record<string, number> = { admin: 3, edit: 2, view: 1 };

export type GroupLevel = PermissionLevel | 'none' | 'mixed';

export function groupLevelFor(perms: Record<string, PermissionLevel | null>, group: ModuleGroup): GroupLevel {
  const levels = group.moduleKeys.map((k) => perms[k] ?? null);
  const distinct = Array.from(new Set(levels.map((l) => l ?? 'none')));
  if (distinct.length > 1) return 'mixed';
  const only = distinct[0];
  return (only === 'none' ? 'none' : (only as PermissionLevel));
}