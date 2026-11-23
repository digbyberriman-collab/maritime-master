import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus, Shield } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageEmpty, PageError, PageLoading } from '@/shared/components/states';
import { cn } from '@/lib/utils';
import { roleHas, useRoleDefinitions } from '../hooks/useRoleDefinitions';
import type { PermissionLevel } from '../types';

const LEVELS: ReadonlyArray<{ level: PermissionLevel; label: string }> = [
  { level: 'view', label: 'View' },
  { level: 'edit', label: 'Edit' },
  { level: 'admin', label: 'Admin' },
];

export const ROLE_DEFINITIONS_NOTICE_TITLE = 'Role definitions are managed by STORM';

/** The read-only notice: why there is nothing to save here, and where access is changed instead. */
export function RoleDefinitionsNotice() {
  return (
    <Alert variant="info" data-role-definitions-notice="">
      <Shield aria-hidden="true" className="h-4 w-4" />
      <AlertTitle>{ROLE_DEFINITIONS_NOTICE_TITLE}</AlertTitle>
      <AlertDescription>
        Every company shares these roles, so they cannot be changed here. To change what one person can see or do, use{' '}
        <Link to="/users-access" className="font-medium underline underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Users &amp; Access
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

function Mark({ allowed }: { allowed: boolean }) {
  return allowed ? (
    <span className="inline-flex size-7 items-center justify-center rounded-md bg-signal-muted text-primary" data-allowed="true">
      <Check aria-hidden="true" className="size-4" />
      <span className="sr-only">Allowed</span>
    </span>
  ) : (
    <span className="inline-flex size-7 items-center justify-center text-muted-foreground" data-allowed="false">
      <Minus aria-hidden="true" className="size-4" />
      <span className="sr-only">Not allowed</span>
    </span>
  );
}

/**
 * The global role matrix, read only (Phase 2 spec §A.8; proposed D-124):
 * pick a role, see which modules it may view, edit or administer. No save
 * controls and no writes: `roles` and `role_permissions` are frozen to the
 * service role.
 */
export function RoleDefinitionsMatrix({ className }: { className?: string }) {
  const { data, isLoading, error, refetch } = useRoleDefinitions();
  const [picked, setPicked] = useState<string | null>(null);
  const roles = useMemo(() => data?.roles ?? [], [data]);
  const selectedId = picked ?? roles[0]?.id ?? null;
  const selected = roles.find((r) => r.id === selectedId) ?? null;

  if (isLoading) return <PageLoading variant="detail" />;
  if (error) return <PageError error={error} onRetry={() => void refetch()} />;
  if (!data || roles.length === 0) return <PageEmpty title="No roles yet" body="STORM has not published role definitions for this workspace." />;

  const topLevel = data.modules.filter((m) => !m.parent_key);

  return (
    <div className={cn('grid gap-4 lg:grid-cols-12', className)}>
      <Card className="lg:col-span-4 xl:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Roles</CardTitle>
          <CardDescription>Choose a role to see what it can open</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="max-h-[32rem] overflow-y-auto" aria-label="Roles">
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => setPicked(role.id)}
                  aria-pressed={role.id === selectedId}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    role.id === selectedId ? 'border-l-2 border-l-primary bg-primary/10' : 'hover:bg-muted/50',
                  )}
                >
                  <Shield aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{role.display_name}</span>
                    <span className="block text-xs capitalize text-muted-foreground">{role.default_scope} scope</span>
                  </span>
                  {role.is_time_limited ? (
                    <Badge variant="outline" className="text-xs">
                      Time limited
                    </Badge>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-8 xl:col-span-9">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{selected?.display_name}</CardTitle>
          <CardDescription>{selected?.description || 'What this role can open, module by module.'}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table aria-label={selected ? `Permissions of ${selected.display_name}` : 'Permissions'}>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[12rem]">Module</TableHead>
                {LEVELS.map((l) => (
                  <TableHead key={l.level} className="w-20 text-center">
                    {l.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {topLevel.map((module) => {
                const subs = data.modules.filter((m) => m.parent_key === module.key);
                return (
                  <React.Fragment key={module.id}>
                    <TableRow className="bg-muted/30">
                      <TableCell className="font-medium">{module.name}</TableCell>
                      {LEVELS.map((l) => (
                        <TableCell key={l.level} className="text-center">
                          <Mark allowed={selectedId ? roleHas(data.permissions, selectedId, module.key, l.level) : false} />
                        </TableCell>
                      ))}
                    </TableRow>
                    {subs.map((sub) => (
                      <TableRow key={sub.id}>
                        <TableCell className="pl-8 text-muted-foreground">{sub.name}</TableCell>
                        {LEVELS.map((l) => (
                          <TableCell key={l.level} className="text-center">
                            <Mark allowed={selectedId ? roleHas(data.permissions, selectedId, sub.key, l.level) : false} />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
