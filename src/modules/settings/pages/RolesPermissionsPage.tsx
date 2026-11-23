import { Download, History, Users } from 'lucide-react';
import PageHeader from '@/shared/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageError, PageLoading } from '@/shared/components/states';
import { RoleDefinitionsMatrix, RoleDefinitionsNotice } from '@/modules/auth/components/RoleDefinitionsMatrix';
import { usePermissionHistory } from '@/modules/auth/hooks/useRoleDefinitions';

/**
 * Roles & Permissions (gap/03 B6; Phase 2 spec §A.8, proposed D-124): the
 * global role matrix, read only. Role definitions are shared by every
 * company and frozen to the service role (migration file 8), so this page
 * has no save controls, writes nothing to `roles` / `role_permissions` and
 * never calls `log_permission_change` (service-only). Access for one person
 * is changed in Users & Access.
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

/** Access changes recorded in `permission_audit_log` (only people allowed to see the log read rows). */
function PermissionHistory() {
  const { data: logs = [], isLoading, error, refetch } = usePermissionHistory();

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
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2" disabled={logs.length === 0}>
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
