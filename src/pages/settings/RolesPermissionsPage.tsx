import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Check, X, Download, Users, History, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissionsStore } from '@/store/permissionsStore';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import type { Role, Module, PermissionLevel, AuditLogEntry, RolePermission } from '@/types/permissions';

export default function RolesPermissionsPage() {
  const { canAdmin } = usePermissionsStore();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = canAdmin('settings');

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rolesRes, modulesRes, permsRes] = await Promise.all([
        supabase.from('roles').select('*').order('display_name'),
        supabase.from('modules').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('role_permissions').select('*'),
      ]);
      
      if (rolesRes.error) throw rolesRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (permsRes.error) throw permsRes.error;
      
      setRoles((rolesRes.data ?? []) as Role[]);
      setModules((modulesRes.data ?? []) as Module[]);
      setPermissions((permsRes.data ?? []) as RolePermission[]);
      setSelectedRole(rolesRes.data?.[0]?.id ?? null);
    } catch (error) {
      console.error('Failed to load permissions data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load permissions data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function hasPermission(roleId: string, moduleKey: string, level: PermissionLevel): boolean {
    return permissions.some(p => 
      p.role_id === roleId && 
      p.module_key === moduleKey && 
      p.permission === level
    );
  }

  async function togglePermission(roleId: string, moduleKey: string, level: PermissionLevel) {
    if (!canEdit || !user) return;
    
    const has = hasPermission(roleId, moduleKey, level);
    setIsSaving(true);
    
    try {
      if (has) {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('module_key', moduleKey)
          .eq('permission', level);
        
        if (error) throw error;
      } else {
        const role = roles.find(r => r.id === roleId);
        const { error } = await supabase
          .from('role_permissions')
          .insert({ 
            role_id: roleId, 
            module_key: moduleKey, 
            permission: level,
            scope: role?.default_scope ?? 'vessel',
            restrictions: {},
          });
        
        if (error) throw error;
      }
      
      // Log the change
      await supabase.rpc('log_permission_change', {
        p_actor_user_id: user.id,
        p_actor_role: 'admin',
        p_action_type: has ? 'permission_revoked' : 'permission_granted',
        p_target_role_id: roleId,
        p_target_module_key: moduleKey,
      });
      
      await loadData();
      
      toast({
        title: has ? 'Permission Removed' : 'Permission Granted',
        description: `${level} permission ${has ? 'removed from' : 'granted to'} ${moduleKey}`,
      });
    } catch (error) {
      console.error('Failed to update permission:', error);
      toast({
        title: 'Error',
        description: 'Failed to update permission',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }

  const selectedRoleData = roles.find(r => r.id === selectedRole);
  const topLevelModules = modules.filter(m => !m.parent_key);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Roles & Permissions
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure module access for each role in your organization
        </p>
      </div>

      <Tabs defaultValue="matrix" className="space-y-4">
        <TabsList>
          <TabsTrigger value="matrix" className="gap-2">
            <Users className="w-4 h-4" />
            Permission Matrix
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="w-4 h-4" />
            Change History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="space-y-4">
          <div className="grid grid-cols-12 gap-6">
            {/* Roles List */}
            <Card className="col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Roles</CardTitle>
                <CardDescription>Select a role to edit</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px]">
                  {roles.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setSelectedRole(role.id)}
                      className={`w-full px-4 py-3 text-left flex items-center gap-3 border-b transition-colors ${
                        selectedRole === role.id 
                          ? 'bg-primary/10 border-l-2 border-l-primary' 
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{role.display_name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{role.default_scope} scope</p>
                      </div>
                      {role.is_time_limited && (
                        <Badge variant="outline" className="text-xs">Time Limited</Badge>
                      )}
                    </button>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Permissions Matrix */}
            <Card className="col-span-9">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {selectedRoleData?.display_name}
                      {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    </CardTitle>
                    <CardDescription>
                      {selectedRoleData?.description || 'Configure permissions for this role'}
                    </CardDescription>
                  </div>
                  {!canEdit && (
                    <Badge variant="secondary" className="gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      View Only
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[450px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Module</TableHead>
                        <TableHead className="text-center w-[100px]">View</TableHead>
                        <TableHead className="text-center w-[100px]">Edit</TableHead>
                        <TableHead className="text-center w-[100px]">Admin</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topLevelModules.map(module => {
                        const subs = modules.filter(m => m.parent_key === module.key);
                        return (
                          <React.Fragment key={module.id}>
                            <TableRow className="bg-muted/30">
                              <TableCell className="font-medium">{module.name}</TableCell>
                              {(['view', 'edit', 'admin'] as PermissionLevel[]).map(level => (
                                <TableCell key={level} className="text-center">
                                  <PermToggle 
                                    checked={hasPermission(selectedRole!, module.key, level)}
                                    onChange={() => togglePermission(selectedRole!, module.key, level)}
                                    disabled={!canEdit || isSaving}
                                  />
                                </TableCell>
                              ))}
                            </TableRow>
                            {subs.map(sub => (
                              <TableRow key={sub.id}>
                                <TableCell className="pl-8 text-muted-foreground">{sub.name}</TableCell>
                                {(['view', 'edit', 'admin'] as PermissionLevel[]).map(level => (
                                  <TableCell key={level} className="text-center">
                                    <PermToggle 
                                      checked={hasPermission(selectedRole!, sub.key, level)}
                                      onChange={() => togglePermission(selectedRole!, sub.key, level)}
                                      disabled={!canEdit || isSaving}
                                    />
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <AuditLogViewer />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PermToggle({ 
  checked, 
  onChange, 
  disabled 
}: { 
  checked: boolean; 
  onChange: () => void; 
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
        checked 
          ? 'bg-primary text-primary-foreground' 
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {checked ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
    </button>
  );
}

function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('permission_audit_log')
          .select('*')
          .order('timestamp_utc', { ascending: false })
          .limit(100);
        
        if (error) throw error;
        setLogs((data ?? []) as AuditLogEntry[]);
      } catch (error) {
        console.error('Failed to load audit logs:', error);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  async function exportCSV() {
    const csv = [
      ['Timestamp', 'Action', 'Module', 'Reason', 'High Impact'].join(','),
      ...logs.map(l => [
        l.timestamp_utc,
        l.action_type,
        l.target_module_key || '',
        `"${l.reason_text || ''}"`,
        l.is_high_impact
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `permission-audit-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Permission Change History</CardTitle>
            <CardDescription>Recent changes to roles and permissions</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
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
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No permission changes recorded yet
                  </TableCell>
                </TableRow>
              ) : (
                logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {new Date(log.timestamp_utc).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {log.action_type.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.target_module_key || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {log.reason_text || '-'}
                    </TableCell>
                    <TableCell>
                      {log.is_high_impact && (
                        <Badge variant="destructive" className="text-xs">High</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
