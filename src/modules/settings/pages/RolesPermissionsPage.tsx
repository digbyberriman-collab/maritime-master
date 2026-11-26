import { Download, History, Users } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import { RoleDefinitionsMatrix, RoleDefinitionsNotice } from '@/modules/auth/components/RoleDefinitionsMatrix';
import { usePermissionAuditGate, usePermissionHistory } from '@/modules/auth/hooks/useRoleDefinitions';

/**
 * Roles & Permissions (gap/03 B6; Phase 2 spec §A.8, proposed D-124): the
 * global role matrix, read only. Role definitions are shared by every
 * company and frozen to the service role (migration file 8), so this page
 * has no save controls, writes nothing to `roles` / `role_permissions` and
 * never calls `log_permission_change` (service-only). Access for one person
 * is changed in Users & Access. The Change history tab reads the
 * permission log only for a caller the database says may see it (D-240).
 */
export default function RolesPermissionsPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Roles & Permissions" description="What each STORM role can open, module by module." />
      <RoleDefinitionsNotice />

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix" className="gap-2">
            <Users aria-hidden="true" className="h-4 w-4" />
            Role matrix
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History aria-hidden="true" className="h-4 w-4" />
            Change history
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <RoleDefinitionsMatrix />
        </TabsContent>

        <TabsContent value="history">
          <PermissionHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Shown in place of the history to a caller the log's RLS would filter out. */
const PERMISSION_HISTORY_RESTRICTED = 'Only DPAs and full administrators can see the change history.';

/**
 * The Change history tab (D-240; D-04, D-124, non-negotiable 9). The log's
 * RLS answers an empty list, not an error, to anyone it filters out, so the
 * tab asks the database the policy's own question first
 * (`usePermissionAuditGate`) and reads `permission_audit_log` only on a
 * yes. A caller without the capability is told the history is restricted,
 * never "No permission changes recorded yet", and gets no table, no Export
 * CSV and no log request. A failed check shows the error state with Retry.
 */
function PermissionHistory() {
  const gate = usePermissionAuditGate();
  const { data: logs = [], isLoading, error, refetch } = usePermissionHistory({ enabled: gate.status === 'allowed' });

  function exportCSV() {
    const csv = [
      ['Timestamp', 'Action', 'Module', 'Reason', 'High Impact'].join(','),
      ...logs.map((l) => [l.timestamp_utc, l.action_type, l.target_module_key || '', `"${(l.reason_text || '').replace(/"/g, '""')}"`, l.is_high_impact].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `permission-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (gate.status === 'loading') return <PageLoading label="Checking who can see the change history" />;
  if (gate.status === 'error') return <PageError error={gate.error} onRetry={gate.retry} />;
  if (gate.status === 'denied') {
    return (
      <Card>
        <CardContent className="p-0">
          <AccessDenied
            title="The change history is restricted"
            detail={
              <div className="space-y-1">
                <p>{PERMISSION_HISTORY_RESTRICTED}</p>
                <p>One person's access is changed in Users & Access.</p>
              </div>
            }
            backTo={null}
            headingLevel={2}
          />
        </CardContent>
      </Card>
    );
  }

  if (isLoading) return <PageLoading />;
  if (error) return <PageError error={error} onRetry={() => void refetch()} />;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Permission change history</CardTitle>
            <CardDescription>Recent changes to who can do what</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCSV}
            className="gap-2 [@media(pointer:coarse)]:h-11"
            disabled={logs.length === 0}
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Impact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No permission changes recorded yet
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm">{new Date(log.timestamp_utc).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {log.action_type.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{log.target_module_key || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{log.reason_text || '-'}</TableCell>
                  <TableCell>
                    {log.is_high_impact ? (
                      <Badge variant="destructive" className="text-xs">
                        High
                      </Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
