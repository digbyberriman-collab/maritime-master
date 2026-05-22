import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { useUserAccessDetail, useModulesList } from '../hooks/useUserAccessDetail';
import { useApplyPreset, useSavePermissionOverride } from '../hooks/useSavePermissionOverride';
import {
  PRESET_MATRIX,
  PRESET_OPTIONS,
  type AccessPreset,
  type PermissionLevel,
} from '../lib/presets';
import { derivePreset } from '../lib/derivePreset';
import { OTHER_MODULE_GROUPS, groupLevelFor } from '../lib/moduleGroups';
import { ModuleGroupRow } from '../components/ModuleGroupRow';
import { CustomPermissionsCard } from '../components/CustomPermissionsCard';
import { DepartmentScopeCard } from '../components/DepartmentScopeCard';
import { useDepartmentScope, useSaveDepartmentScope } from '../hooks/useDepartmentScope';

const PERM_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'none', label: 'No Access', color: 'text-muted-foreground' },
  { value: 'view', label: 'Read Only', color: 'text-primary' },
  { value: 'edit', label: 'Read & Write', color: 'text-success' },
  { value: 'admin', label: 'Admin', color: 'text-warning' },
];

const parsePerm = (v: string): PermissionLevel | null => (v === 'none' ? null : (v as PermissionLevel));

const UsersAccessDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { data: detail, isLoading } = useUserAccessDetail(userId);
  const { data: modules } = useModulesList();
  const saveOverride = useSavePermissionOverride();
  const applyPreset = useApplyPreset();
  const { toast } = useToast();
  const { data: deptScope = [] } = useDepartmentScope(userId);
  const saveDept = useSaveDepartmentScope();

  const currentPreset: AccessPreset = useMemo(
    () => (detail ? derivePreset(detail.permissions) : 'custom'),
    [detail]
  );

  const moduleByKey = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    (modules ?? []).forEach((m) => map.set(m.key, { key: m.key, name: m.name }));
    return map;
  }, [modules]);

  if (isLoading || !detail) {
    return (
      <DashboardLayout>
        <div className="p-6 text-sm text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  const handlePresetChange = (value: string) => {
    if (value === 'custom' || !userId) return;
    const matrix = PRESET_MATRIX[value as Exclude<AccessPreset, 'custom'>];
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => toast({ title: 'Access preset applied' }),
        onError: (e: any) => toast({ title: 'Failed to apply preset', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleModuleChange = (moduleKey: string, value: string) => {
    if (!userId) return;
    saveOverride.mutate(
      { userId, moduleKey, permission: parsePerm(value) },
      {
        onSuccess: () => toast({ title: 'Permission updated' }),
        onError: (e: any) => toast({ title: 'Failed to update', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleSetAll = (value: string) => {
    if (!userId) return;
    const matrix: Record<string, PermissionLevel | null> = {};
    OTHER_MODULE_GROUPS.forEach((g) => g.moduleKeys.forEach((k) => { matrix[k] = parsePerm(value); }));
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => toast({ title: 'Applied to all modules' }),
        onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleGroupChange = (groupKey: string, value: string) => {
    if (!userId) return;
    const group = OTHER_MODULE_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const matrix: Record<string, PermissionLevel | null> = {};
    group.moduleKeys.forEach((k) => { matrix[k] = parsePerm(value); });
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => toast({ title: `${group.label} updated` }),
        onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleCapToggle = (capKey: string, enabled: boolean) => {
    if (!userId) return;
    saveOverride.mutate(
      { userId, moduleKey: capKey, permission: enabled ? 'view' : null },
      {
        onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
      }
    );
  };

  const handleDeptChange = (next: string[]) => {
    if (!userId) return;
    saveDept.mutate({ userId, departments: next });
  };

  return (
    <DashboardLayout>
      <div className="p-4 lg:p-6 space-y-4 max-w-5xl">
        <Link to="/users-access" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Crew List
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {detail.firstName} {detail.lastName}
            </CardTitle>
            <div className="flex items-center gap-2 pt-1">
              <Badge variant="outline" className="rounded-full bg-muted text-muted-foreground border-transparent">active</Badge>
              {detail.roleDisplayName && (
                <Badge variant="outline" className="rounded-full bg-primary/10 text-primary border-transparent">
                  {detail.roleDisplayName}
                </Badge>
              )}
              {detail.position && (
                <span className="text-sm text-muted-foreground">· {detail.position}</span>
              )}
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crew Module Access</CardTitle>
            <CardDescription>Control what crew data this member can see and manage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium min-w-[110px]">Access Preset</label>
              <Select value={currentPreset} onValueChange={handlePresetChange}>
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex flex-col py-0.5">
                        <span className="font-medium">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Other Modules</CardTitle>
              <CardDescription>None = no access</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Set all to:</span>
              <Select onValueChange={handleSetAll}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {PERM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {OTHER_MODULE_GROUPS.map((group) => {
              const groupLevel = groupLevelFor(detail.permissions, group);
              const childModules = group.moduleKeys
                .map((k) => moduleByKey.get(k) ?? { key: k, name: k })
                .filter(Boolean);
              return (
                <ModuleGroupRow
                  key={group.key}
                  group={group}
                  modules={childModules}
                  perms={detail.permissions}
                  groupLevel={groupLevel}
                  onGroupChange={(v) => handleGroupChange(group.key, v)}
                  onModuleChange={handleModuleChange}
                />
              );
            })}
          </CardContent>
        </Card>

        {currentPreset === 'custom' && (
          <CustomPermissionsCard permissions={detail.permissions} onToggle={handleCapToggle} />
        )}

        <DepartmentScopeCard selected={deptScope} onChange={handleDeptChange} />
      </div>
    </DashboardLayout>
  );
};

export default UsersAccessDetailPage;