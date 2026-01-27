import React, { useState, useEffect } from 'react';
import { Shield, Plus, Edit, Trash2, Save, AlertCircle, Check, X, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import SettingsCard from '../common/SettingsCard';

interface Role {
  id: string;
  role_code: string;
  role_name: string;
  description: string | null;
  is_system_role: boolean;
  is_custom: boolean;
  scope_type: 'fleet' | 'vessel' | 'department' | 'self';
}

interface Permission {
  id: string;
  module: string;
  action: string;
  description: string | null;
}

interface RolePermission {
  role_id: string;
  permission_id: string;
}

interface FieldRedaction {
  id: string;
  module: string;
  field_name: string;
  restricted_role_ids: string[];
}

type PermissionMatrix = Record<string, Record<string, boolean>>;

const PERMISSION_MODULES = [
  { id: 'ism_forms', name: 'ISM/SMS Forms', actions: ['view', 'create', 'edit', 'approve', 'sign', 'export'] },
  { id: 'documents', name: 'Documents', actions: ['view', 'create', 'edit', 'approve', 'delete', 'export'] },
  { id: 'crew_certificates', name: 'Crew Certificates', actions: ['view', 'create', 'edit', 'approve', 'delete', 'export'] },
  { id: 'vessel_certificates', name: 'Vessel Certificates', actions: ['view', 'create', 'edit', 'approve', 'delete', 'export'] },
  { id: 'incidents', name: 'Incidents', actions: ['view', 'create', 'edit', 'approve', 'delete', 'export'] },
  { id: 'drills', name: 'Drills', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'training', name: 'Training', actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { id: 'hours_of_rest', name: 'Hours of Rest', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'audits', name: 'Audits', actions: ['view', 'create', 'edit', 'export'] },
  { id: 'maintenance', name: 'Maintenance', actions: ['view', 'export'] },
  { id: 'fleet_map', name: 'Fleet Map', actions: ['view'] },
  { id: 'settings', name: 'Settings', actions: ['view', 'edit', 'configure'] },
];

const ALL_ACTIONS = ['view', 'create', 'edit', 'approve', 'sign', 'delete', 'export', 'configure'];

const REDACTION_FIELDS = [
  { field: 'salary', label: 'Salary Information', module: 'crew' },
  { field: 'medical', label: 'Medical Records', module: 'crew' },
  { field: 'disciplinary', label: 'Disciplinary Records', module: 'crew' },
  { field: 'maintenance_overdue', label: 'Maintenance Overdue', module: 'maintenance' },
  { field: 'captain_notes', label: 'Captain Notes', module: 'crew' },
  { field: 'commercial', label: 'Commercial Data', module: 'vessel' },
];

interface NewRoleData {
  role_code: string;
  role_name: string;
  description: string;
  scope_type: 'fleet' | 'vessel' | 'department' | 'self';
}

const PermissionsSection: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [permissionMatrix, setPermissionMatrix] = useState<PermissionMatrix>({});
  const [fieldRedactions, setFieldRedactions] = useState<FieldRedaction[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [isRedactionModalOpen, setIsRedactionModalOpen] = useState(false);
  const [selectedRedactionField, setSelectedRedactionField] = useState<typeof REDACTION_FIELDS[0] | null>(null);
  const [newRole, setNewRole] = useState<NewRoleData>({
    role_code: '',
    role_name: '',
    description: '',
    scope_type: 'vessel',
  });

  const userRole = profile?.role || '';
  const isDPA = userRole === 'dpa' || userRole === 'shore_management';

  useEffect(() => {
    if (user?.id && profile?.company_id) {
      loadData();
    }
  }, [user?.id, profile?.company_id]);

  useEffect(() => {
    if (selectedRole) {
      loadPermissionMatrix();
    }
  }, [selectedRole?.id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadRoles(),
      loadPermissions(),
      loadFieldRedactions(),
    ]);
    setLoading(false);
  };

  const loadRoles = async () => {
    if (!profile?.company_id) return;

    try {
      const { data, error } = await (supabase as any)
        .from('roles')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('is_system_role', { ascending: false })
        .order('role_name');

      if (error) throw error;

      const rolesData = data || [];
      setRoles(rolesData);
      
      // Select first role by default
      if (rolesData.length > 0 && !selectedRole) {
        setSelectedRole(rolesData[0]);
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  };

  const loadPermissions = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('permissions')
        .select('*');

      if (error) throw error;
      setPermissions(data || []);
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  };

  const loadPermissionMatrix = async () => {
    if (!selectedRole) return;

    try {
      const { data, error } = await (supabase as any)
        .from('role_permissions')
        .select('permission_id')
        .eq('role_id', selectedRole.id);

      if (error) throw error;

      // Build matrix from role permissions
      const enabledPermIds = new Set((data || []).map((rp: any) => rp.permission_id));
      
      const matrix: PermissionMatrix = {};
      PERMISSION_MODULES.forEach(mod => {
        matrix[mod.id] = {};
        mod.actions.forEach(action => {
          const perm = permissions.find(p => p.module === mod.id && p.action === action);
          matrix[mod.id][action] = perm ? enabledPermIds.has(perm.id) : false;
        });
      });

      setPermissionMatrix(matrix);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading permission matrix:', error);
    }
  };

  const loadFieldRedactions = async () => {
    if (!profile?.company_id) return;

    try {
      const { data, error } = await (supabase as any)
        .from('field_redactions')
        .select('*')
        .eq('company_id', profile.company_id);

      if (error) throw error;
      setFieldRedactions(data || []);
    } catch (error) {
      console.error('Error loading field redactions:', error);
    }
  };

  const togglePermission = (module: string, action: string) => {
    if (!selectedRole || (selectedRole.is_system_role && selectedRole.role_code === 'DPA')) {
      return;
    }

    setPermissionMatrix(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: !prev[module]?.[action],
      },
    }));
    setHasChanges(true);
  };

  const savePermissions = async () => {
    if (!selectedRole) return;

    setSaving(true);

    try {
      // Get all permission IDs to enable
      const permissionIdsToEnable: string[] = [];
      
      for (const mod of PERMISSION_MODULES) {
        for (const action of mod.actions) {
          if (permissionMatrix[mod.id]?.[action]) {
            const perm = permissions.find(p => p.module === mod.id && p.action === action);
            if (perm) {
              permissionIdsToEnable.push(perm.id);
            }
          }
        }
      }

      // Delete all existing permissions for this role
      await (supabase as any)
        .from('role_permissions')
        .delete()
        .eq('role_id', selectedRole.id);

      // Insert new permissions
      if (permissionIdsToEnable.length > 0) {
        const inserts = permissionIdsToEnable.map(permId => ({
          role_id: selectedRole.id,
          permission_id: permId,
        }));

        const { error } = await (supabase as any)
          .from('role_permissions')
          .insert(inserts);

        if (error) throw error;
      }

      // Log audit
      await (supabase as any).from('audit_logs').insert({
        entity_type: 'role_permissions',
        entity_id: selectedRole.id,
        action: 'UPDATE',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
        new_values: { permissions: permissionIdsToEnable },
      });

      toast({
        title: 'Permissions saved',
        description: `Permissions for ${selectedRole.role_name} have been updated.`,
      });

      setHasChanges(false);
    } catch (error) {
      console.error('Error saving permissions:', error);
      toast({
        title: 'Error',
        description: 'Failed to save permissions. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const createCustomRole = async () => {
    if (!newRole.role_code || !newRole.role_name) {
      toast({
        title: 'Validation Error',
        description: 'Role code and name are required.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await (supabase as any)
        .from('roles')
        .insert({
          company_id: profile?.company_id,
          role_code: newRole.role_code.toUpperCase().replace(/\s/g, '_'),
          role_name: newRole.role_name,
          description: newRole.description || null,
          scope_type: newRole.scope_type,
          is_system_role: false,
          is_custom: true,
        })
        .select()
        .single();

      if (error) throw error;

      await (supabase as any).from('audit_logs').insert({
        entity_type: 'role',
        entity_id: data.id,
        action: 'CREATE',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
        new_values: newRole,
      });

      toast({
        title: 'Role created',
        description: `Custom role "${newRole.role_name}" has been created.`,
      });

      setIsCreateRoleModalOpen(false);
      setNewRole({ role_code: '', role_name: '', description: '', scope_type: 'vessel' });
      loadRoles();
    } catch (error: any) {
      console.error('Error creating role:', error);
      toast({
        title: 'Error',
        description: error.message?.includes('duplicate') 
          ? 'A role with this code already exists.' 
          : 'Failed to create role.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomRole = async (role: Role) => {
    if (role.is_system_role) {
      toast({
        title: 'Cannot delete',
        description: 'System roles cannot be deleted.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await (supabase as any)
        .from('roles')
        .delete()
        .eq('id', role.id);

      if (error) throw error;

      await (supabase as any).from('audit_logs').insert({
        entity_type: 'role',
        entity_id: role.id,
        action: 'DELETE',
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
        old_values: role as any,
      });

      toast({
        title: 'Role deleted',
        description: `Custom role "${role.role_name}" has been deleted.`,
      });

      if (selectedRole?.id === role.id) {
        setSelectedRole(roles.find(r => r.id !== role.id) || null);
      }
      
      loadRoles();
    } catch (error) {
      console.error('Error deleting role:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete role.',
        variant: 'destructive',
      });
    }
  };

  const openRedactionEditor = (field: typeof REDACTION_FIELDS[0]) => {
    setSelectedRedactionField(field);
    setIsRedactionModalOpen(true);
  };

  const updateFieldRedaction = async (fieldName: string, restrictedRoleIds: string[]) => {
    if (!profile?.company_id || !selectedRedactionField) return;

    try {
      const existing = fieldRedactions.find(
        r => r.field_name === fieldName && r.module === selectedRedactionField.module
      );

      if (existing) {
        await (supabase as any)
          .from('field_redactions')
          .update({ restricted_role_ids: restrictedRoleIds })
          .eq('id', existing.id);
      } else {
        await (supabase as any)
          .from('field_redactions')
          .insert({
            company_id: profile.company_id,
            module: selectedRedactionField.module,
            field_name: fieldName,
            restricted_role_ids: restrictedRoleIds,
          });
      }

      toast({
        title: 'Redaction updated',
        description: 'Field redaction rules have been saved.',
      });

      loadFieldRedactions();
      setIsRedactionModalOpen(false);
    } catch (error) {
      console.error('Error updating redaction:', error);
      toast({
        title: 'Error',
        description: 'Failed to update redaction.',
        variant: 'destructive',
      });
    }
  };

  const resetToDefaults = () => {
    if (selectedRole) {
      loadPermissionMatrix();
    }
  };

  if (!isDPA) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Permissions</h2>
          <p className="text-muted-foreground mt-1">Role-based access control configuration</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access this section. Only DPA users can manage permissions.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Permissions</h2>
          <p className="text-muted-foreground mt-1">Role-based access control configuration</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-16 bg-muted rounded-lg" />
          <div className="h-96 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Permissions</h2>
        <p className="text-muted-foreground mt-1">Configure role-based access control for your organization</p>
      </div>

      {/* Role Selector */}
      <SettingsCard>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="role-select" className="text-sm font-medium whitespace-nowrap">
              Select Role:
            </Label>
            <Select
              value={selectedRole?.id || ''}
              onValueChange={(value) => {
                const role = roles.find(r => r.id === value);
                setSelectedRole(role || null);
              }}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue placeholder="Select a role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map(role => (
                  <SelectItem key={role.id} value={role.id}>
                    <div className="flex items-center gap-2">
                      <span>{role.role_name}</span>
                      <Badge variant="outline" className="text-xs">
                        {role.is_system_role ? 'System' : 'Custom'}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => setIsCreateRoleModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Custom Role
          </Button>
        </div>
      </SettingsCard>

      {/* Selected Role Info */}
      {selectedRole && (
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <p className="font-medium">{selectedRole.role_name}</p>
            <p className="text-sm text-muted-foreground">
              Scope: {selectedRole.scope_type} | {selectedRole.description || 'No description'}
            </p>
          </div>
          {selectedRole.is_custom && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => deleteCustomRole(selectedRole)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Permission Matrix */}
      <SettingsCard
        title="Permission Matrix"
        description="Configure module access permissions for the selected role"
      >
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left py-3 px-4 font-medium">Module</th>
                {ALL_ACTIONS.map(action => (
                  <th key={action} className="text-center py-3 px-2 font-medium capitalize">
                    {action}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_MODULES.map(module => (
                <tr key={module.id} className="border-b hover:bg-muted/30">
                  <td className="py-3 px-4 font-medium">{module.name}</td>
                  {ALL_ACTIONS.map(action => (
                    <td key={action} className="text-center py-3 px-2">
                      {module.actions.includes(action) ? (
                        <div className="flex justify-center">
                          <Checkbox
                            checked={permissionMatrix[module.id]?.[action] || false}
                            onCheckedChange={() => togglePermission(module.id, action)}
                            disabled={selectedRole?.is_system_role && selectedRole?.role_code === 'DPA'}
                          />
                        </div>
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {hasChanges && (
          <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
            <Button variant="outline" onClick={resetToDefaults}>
              Reset
            </Button>
            <Button onClick={savePermissions} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Permissions'}
            </Button>
          </div>
        )}
      </SettingsCard>

      {/* Field Redactions */}
      <SettingsCard
        title="Field-Level Redactions"
        description="Control which sensitive fields are hidden from specific roles"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {REDACTION_FIELDS.map(item => {
            const redaction = fieldRedactions.find(
              r => r.field_name === item.field && r.module === item.module
            );
            const restrictedCount = redaction?.restricted_role_ids?.length || 0;

            return (
              <div key={item.field} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium text-sm">{item.label}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openRedactionEditor(item)}
                    className="h-8 w-8"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Hidden from: {restrictedCount} role{restrictedCount !== 1 ? 's' : ''}
                </p>
              </div>
            );
          })}
        </div>
      </SettingsCard>

      {/* Create Role Modal */}
      <Dialog open={isCreateRoleModalOpen} onOpenChange={setIsCreateRoleModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Custom Role</DialogTitle>
            <DialogDescription>
              Define a new role with custom permissions
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role_code">Role Code *</Label>
              <Input
                id="role_code"
                value={newRole.role_code}
                onChange={(e) => setNewRole({ 
                  ...newRole, 
                  role_code: e.target.value.toUpperCase().replace(/\s/g, '_') 
                })}
                placeholder="e.g., SENIOR_DECKHAND"
              />
              <p className="text-xs text-muted-foreground">Unique identifier, no spaces</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role_name">Role Name *</Label>
              <Input
                id="role_name"
                value={newRole.role_name}
                onChange={(e) => setNewRole({ ...newRole, role_name: e.target.value })}
                placeholder="e.g., Senior Deckhand"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newRole.description}
                onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
                rows={2}
                placeholder="Brief description of this role's responsibilities"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="scope_type">Scope</Label>
              <Select
                value={newRole.scope_type}
                onValueChange={(value: any) => setNewRole({ ...newRole, scope_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fleet">Fleet-wide</SelectItem>
                  <SelectItem value="vessel">Vessel-level</SelectItem>
                  <SelectItem value="department">Department-level</SelectItem>
                  <SelectItem value="self">Self only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createCustomRole} disabled={saving}>
              {saving ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Field Redaction Modal */}
      <Dialog open={isRedactionModalOpen} onOpenChange={setIsRedactionModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Field Redaction</DialogTitle>
            <DialogDescription>
              {selectedRedactionField?.label} - Select roles that should NOT see this field
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {roles.map(role => {
              const redaction = fieldRedactions.find(
                r => r.field_name === selectedRedactionField?.field && 
                     r.module === selectedRedactionField?.module
              );
              const isRestricted = redaction?.restricted_role_ids?.includes(role.id) || false;

              return (
                <div key={role.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span>{role.role_name}</span>
                    <Badge variant="outline" className="text-xs">
                      {role.is_system_role ? 'System' : 'Custom'}
                    </Badge>
                  </div>
                  <Checkbox
                    checked={isRestricted}
                    onCheckedChange={(checked) => {
                      if (!selectedRedactionField) return;
                      
                      const currentIds = redaction?.restricted_role_ids || [];
                      const newIds = checked
                        ? [...currentIds, role.id]
                        : currentIds.filter(id => id !== role.id);
                      
                      updateFieldRedaction(selectedRedactionField.field, newIds);
                    }}
                    disabled={role.role_code === 'DPA'}
                  />
                </div>
              );
            })}
          </div>

          <DialogFooter>
            <Button onClick={() => setIsRedactionModalOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PermissionsSection;
