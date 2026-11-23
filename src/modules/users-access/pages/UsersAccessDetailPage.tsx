import React, { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Loader2, Lock, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { notify } from '@/shared/lib/notify';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { useCan } from '@/lib/permissions/useCan';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useInvitationActions, useInvitationStatuses } from '../hooks/useInvitations';
import { invitationCell } from '../lib/invitationStatus';
import { AccountStatusPill, InvitationStatus } from '../components/InvitationStatus';
import { useUserAccessDetail, useModulesList } from '../hooks/useUserAccessDetail';
import { isOverrideRefused, useApplyPreset, useSavePermissionOverride } from '../hooks/useSavePermissionOverride';
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
import { APPROVAL_CAPABILITIES, VIEW_CAPABILITIES } from '../lib/capabilityCatalog';

const PERM_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'none', label: 'No Access', color: 'text-muted-foreground' },
  { value: 'view', label: 'Read Only', color: 'text-primary' },
  { value: 'edit', label: 'Read & Write', color: 'text-success' },
  { value: 'admin', label: 'Admin', color: 'text-warning' },
];

const parsePerm = (v: string): PermissionLevel | null => (v === 'none' ? null : (v as PermissionLevel));

const CAPABILITY_LABELS = new Map([...VIEW_CAPABILITIES, ...APPROVAL_CAPABILITIES].map((c) => [c.key, c.label]));
const EXTRA_LABELS = new Map([
  ['crew.department_scope', 'Department scope'],
  ['crew_roster', 'Crew roster'],
  ['crew_certificates', 'Crew certificates'],
  ['hr', 'HR'],
  ['training', 'Training'],
]);

/** "A", "A and B", "A, B and 3 more". */
function listLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? 'these modules';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  if (labels.length === 3) return `${labels[0]}, ${labels[1]} and ${labels[2]}`;
  return `${labels[0]}, ${labels[1]} and ${labels.length - 2} more`;
}

const UsersAccessDetailPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const { data: detail, isLoading, error, refetch } = useUserAccessDetail(userId);
  const { data: modules } = useModulesList();
  const saveOverride = useSavePermissionOverride();
  const applyPreset = useApplyPreset();
  const { user } = useAuth();
  const deptQuery = useDepartmentScope(userId);
  const deptScope = deptQuery.data ?? [];
  const saveDept = useSaveDepartmentScope();
  const profileIds = useMemo(() => (detail ? [detail.profileId] : []), [detail]);
  const invitations = useInvitationStatuses(detail?.companyId, profileIds);
  const invitationActions = useInvitationActions();
  const canAssign = useCan('admin.access.users_access.assign');

  const currentPreset: AccessPreset = useMemo(
    () => (detail ? derivePreset(detail.permissions) : 'custom'),
    [detail]
  );

  const moduleByKey = useMemo(() => {
    const map = new Map<string, { key: string; name: string }>();
    (modules ?? []).forEach((m) => map.set(m.key, { key: m.key, name: m.name }));
    return map;
  }, [modules]);

  if (isLoading) {
    return (
      <DashboardLayout>
        <PageLoading variant="detail" />
      </DashboardLayout>
    );
  }
  if (error) {
    return (
      <DashboardLayout>
        <PageError error={error} onRetry={() => void refetch()} />
      </DashboardLayout>
    );
  }
  if (!detail) {
    return (
      <DashboardLayout>
        <PageEmpty headingLevel={1} title="Person not found" body="They may have been removed, or you may not have access to them." />
      </DashboardLayout>
    );
  }

  const cell = invitationCell(detail.account, invitations.byProfile.get(detail.profileId), invitations.source);
  const name = `${detail.firstName} ${detail.lastName}`.trim();
  // Nobody edits their own access (the server refuses it too): the page is read-only for yourself.
  const isSelf = Boolean(user?.id) && detail.userId === user?.id;

  const labelFor = (key: string) => moduleByKey.get(key)?.name ?? CAPABILITY_LABELS.get(key) ?? EXTRA_LABELS.get(key) ?? key;

  /**
   * A write that failed. A refusal (RLS kept a row, or refused the insert)
   * names the modules; when part of the request was saved anyway, it says
   * so (the matrix reloads what is saved). Never a success toast.
   */
  const reportWriteError = (fallbackTitle: string) => (e: unknown) => {
    if (isOverrideRefused(e)) {
      if (e.self) {
        notify.error("You can't change your own access.", { title: 'Access not changed' });
        return;
      }
      notify.error(e.partial ? 'Part of the change was saved. The page now shows their current access.' : 'Nothing was changed.', {
        title: `You can't change this person's access for ${listLabels(e.moduleKeys.map(labelFor))}`,
      });
      return;
    }
    notify.error(e, { title: fallbackTitle });
  };

  const handlePresetChange = (value: string) => {
    if (value === 'custom' || !userId || isSelf) return;
    const matrix = PRESET_MATRIX[value as Exclude<AccessPreset, 'custom'>];
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => notify.success('Access preset applied'),
        onError: reportWriteError('Could not apply the preset'),
      }
    );
  };

  const handleModuleChange = (moduleKey: string, value: string) => {
    if (!userId || isSelf) return;
    saveOverride.mutate(
      { userId, moduleKey, permission: parsePerm(value) },
      {
        onSuccess: () => notify.success('Permission updated', { description: labelFor(moduleKey) }),
        onError: reportWriteError('Could not update the permission'),
      }
    );
  };

  const handleSetAll = (value: string) => {
    if (!userId || isSelf) return;
    const matrix: Record<string, PermissionLevel | null> = {};
    OTHER_MODULE_GROUPS.forEach((g) => g.moduleKeys.forEach((k) => { matrix[k] = parsePerm(value); }));
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => notify.success('Applied to all modules'),
        onError: reportWriteError('Could not apply to all modules'),
      }
    );
  };

  const handleGroupChange = (groupKey: string, value: string) => {
    if (!userId || isSelf) return;
    const group = OTHER_MODULE_GROUPS.find((g) => g.key === groupKey);
    if (!group) return;
    const matrix: Record<string, PermissionLevel | null> = {};
    group.moduleKeys.forEach((k) => { matrix[k] = parsePerm(value); });
    applyPreset.mutate(
      { userId, matrix },
      {
        onSuccess: () => notify.success(`${group.label} updated`),
        onError: reportWriteError(`Could not update ${group.label}`),
      }
    );
  };

  const handleCapToggle = (capKey: string, enabled: boolean) => {
    if (!userId || isSelf) return;
    saveOverride.mutate(
      { userId, moduleKey: capKey, permission: enabled ? 'view' : null },
      {
        onError: reportWriteError('Could not update the permission'),
      }
    );
  };

  const handleDeptChange = (next: string[]) => {
    if (!userId || isSelf) return;
    saveDept.mutate({ userId, departments: next }, { onError: reportWriteError('Could not update the department scope') });
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
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AccountStatusPill account={detail.account} />
              {detail.roleDisplayName && (
                <Badge variant="outline" className="rounded-full bg-primary/10 text-primary border-transparent">
                  {detail.roleDisplayName}
                </Badge>
              )}
              {detail.position && (
                <span className="text-sm text-muted-foreground">· {detail.position}</span>
              )}
            </div>
            {cell.status !== 'none' ? (
              <div className="flex flex-wrap items-start gap-3 pt-3" data-invitation-status="">
                <span className="type-body-sm text-muted-foreground">Invitation</span>
                <InvitationStatus cell={cell} loading={invitations.source === 'loading'} />
                {canAssign && (cell.canInvite || cell.canResend) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="[@media(pointer:coarse)]:min-h-11"
                    disabled={invitationActions.invitingProfileId === detail.profileId}
                    onClick={() => void invitationActions.inviteOne({ profileId: detail.profileId, name, email: detail.email })}
                  >
                    {invitationActions.invitingProfileId === detail.profileId ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Send aria-hidden="true" />}
                    {cell.canInvite ? 'Send invitation' : 'Resend invitation'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
        </Card>

        {isSelf ? (
          <Alert variant="info" data-access-readonly="self">
            <Lock aria-hidden="true" className="h-4 w-4" />
            <AlertTitle>You can't change your own access.</AlertTitle>
            <AlertDescription>This is what you can see and do. Ask another administrator to change it.</AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crew Module Access</CardTitle>
            <CardDescription>Control what crew data this member can see and manage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium min-w-[110px]">Access Preset</label>
              <Select value={currentPreset} onValueChange={handlePresetChange} disabled={isSelf}>
                <SelectTrigger className="max-w-md" aria-label="Access preset">
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
              <Select onValueChange={handleSetAll} disabled={isSelf}>
                <SelectTrigger className="w-40 h-8" aria-label="Set all modules to">
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
                  disabled={isSelf}
                />
              );
            })}
          </CardContent>
        </Card>

        {currentPreset === 'custom' && (
          <CustomPermissionsCard permissions={detail.permissions} onToggle={handleCapToggle} disabled={isSelf} />
        )}

        <DepartmentScopeCard
          selected={deptScope}
          onChange={handleDeptChange}
          disabled={isSelf || deptQuery.isLoading}
          error={deptQuery.error}
          onRetry={() => void deptQuery.refetch()}
        />
      </div>
    </DashboardLayout>
  );
};

export default UsersAccessDetailPage;