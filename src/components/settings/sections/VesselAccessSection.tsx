import React, { useState, useEffect } from 'react';
import { Ship, Plus, Edit, Trash2, Users, ArrowRightLeft, Save, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import SettingsCard from '../common/SettingsCard';

interface Vessel {
  id: string;
  name: string;
  imo_number: string | null;
  flag_state: string | null;
  classification_society: string | null;
}

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
}

interface Assignment {
  id: string;
  position: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  user_id: string;
  vessel_id: string;
}

interface GroupedAssignment {
  user: User;
  assignments: {
    id: string;
    vessel: Vessel;
    position: string;
    start_date: string | null;
    end_date: string | null;
  }[];
}

interface AssignmentFormData {
  user_id: string;
  vessel_id: string;
  position: string;
  start_date: string;
  end_date: string;
}

const POSITIONS = [
  'Captain',
  'Chief Officer',
  'Chief Engineer',
  'Second Officer',
  'Second Engineer',
  'Third Officer',
  'Third Engineer',
  'Bosun',
  'AB Seaman',
  'OS Seaman',
  'Oiler',
  'Wiper',
  'Chief Steward',
  'Cook',
  'Steward',
  'Purser',
  'ETO',
  'Cadet',
];

const VesselAccessSection: React.FC = () => {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<GroupedAssignment[]>([]);
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userVesselIds, setUserVesselIds] = useState<string[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<GroupedAssignment | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<{
    userId: string;
    fromVesselId: string;
    position: string;
  } | null>(null);
  
  const [formData, setFormData] = useState<AssignmentFormData>({
    user_id: '',
    vessel_id: '',
    position: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
  });
  
  const [transferVesselId, setTransferVesselId] = useState('');

  const userRole = profile?.role || '';
  const isDPA = userRole === 'dpa' || userRole === 'shore_management';
  const isCaptain = userRole === 'master';

  useEffect(() => {
    if (user?.id && profile?.company_id) {
      loadData();
    }
  }, [user?.id, profile?.company_id]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([
      loadUserVesselIds(),
      loadVessels(),
      loadUsers(),
    ]);
    setLoading(false);
  };

  const loadUserVesselIds = async () => {
    if (!user?.id) return;
    
    const { data } = await supabase
      .from('crew_assignments')
      .select('vessel_id')
      .eq('user_id', user.id)
      .eq('is_current', true);
    
    const vesselIds = data?.map(d => d.vessel_id) || [];
    setUserVesselIds(vesselIds);
    
    // After getting vessel IDs, load assignments
    await loadUserAssignments(vesselIds);
  };

  const loadUserAssignments = async (currentUserVesselIds: string[]) => {
    if (!profile?.company_id) return;

    try {
      // First get assignments
      let query = supabase
        .from('crew_assignments')
        .select('id, user_id, vessel_id, position, start_date, end_date, is_current')
        .eq('is_current', true);

      // Captain sees only their vessel(s)
      if (isCaptain && !isDPA) {
        if (currentUserVesselIds.length > 0) {
          query = query.in('vessel_id', currentUserVesselIds);
        } else {
          setAssignments([]);
          return;
        }
      }

      const { data: assignmentData, error } = await query;
      if (error) throw error;

      if (!assignmentData || assignmentData.length === 0) {
        setAssignments([]);
        return;
      }

      // Get unique user and vessel IDs
      const userIds = [...new Set(assignmentData.map(a => a.user_id))];
      const vesselIds = [...new Set(assignmentData.map(a => a.vessel_id))];

      // Fetch users and vessels
      const [usersResult, vesselsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email, role')
          .in('user_id', userIds),
        supabase
          .from('vessels')
          .select('id, name, imo_number, flag_state, classification_society')
          .in('id', vesselIds)
      ]);

      const usersMap = new Map(
        (usersResult.data || []).map(u => [u.user_id, {
          id: u.user_id,
          first_name: u.first_name,
          last_name: u.last_name,
          email: u.email,
          role: u.role
        }])
      );

      const vesselsMap = new Map(
        (vesselsResult.data || []).map(v => [v.id, v])
      );

      // Group by user
      const grouped = new Map<string, GroupedAssignment>();
      
      for (const assignment of assignmentData) {
        const userInfo = usersMap.get(assignment.user_id);
        const vesselInfo = vesselsMap.get(assignment.vessel_id);
        
        if (!userInfo || !vesselInfo) continue;

        if (!grouped.has(assignment.user_id)) {
          grouped.set(assignment.user_id, {
            user: userInfo,
            assignments: []
          });
        }

        grouped.get(assignment.user_id)!.assignments.push({
          id: assignment.id,
          vessel: vesselInfo,
          position: assignment.position,
          start_date: assignment.start_date,
          end_date: assignment.end_date,
        });
      }

      setAssignments(Array.from(grouped.values()));
    } catch (error) {
      console.error('Error loading assignments:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user assignments.',
        variant: 'destructive'
      });
    }
  };

  const loadVessels = async () => {
    if (!profile?.company_id) return;

    try {
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name, imo_number, flag_state, classification_society')
        .eq('company_id', profile.company_id)
        .neq('status', 'Sold')
        .order('name');

      if (error) throw error;
      setVessels(data || []);
    } catch (error) {
      console.error('Error loading vessels:', error);
    }
  };

  const loadUsers = async () => {
    if (!profile?.company_id) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, email, role')
        .eq('company_id', profile.company_id)
        .order('last_name');

      if (error) throw error;
      setUsers((data || []).map(u => ({
        id: u.user_id,
        first_name: u.first_name,
        last_name: u.last_name,
        email: u.email,
        role: u.role
      })));
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const logAuditTrail = async (
    entityId: string,
    action: string,
    oldValues: any,
    newValues: any
  ) => {
    try {
      await supabase.from('audit_logs').insert({
        entity_type: 'crew_assignment',
        entity_id: entityId,
        action,
        actor_user_id: user?.id,
        actor_email: profile?.email,
        actor_role: profile?.role,
        old_values: oldValues,
        new_values: newValues,
      });
    } catch (error) {
      console.error('Error logging audit:', error);
    }
  };

  const createAssignment = async () => {
    if (!formData.user_id || !formData.vessel_id || !formData.position) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields.',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);

    try {
      const { data, error } = await supabase
        .from('crew_assignments')
        .insert({
          user_id: formData.user_id,
          vessel_id: formData.vessel_id,
          position: formData.position,
          join_date: formData.start_date || new Date().toISOString().split('T')[0],
          start_date: formData.start_date || null,
          end_date: formData.end_date || null,
          is_current: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await logAuditTrail(data.id, 'CREATE', null, formData);

      toast({
        title: 'Assignment created',
        description: 'User has been assigned to the vessel.'
      });

      setIsModalOpen(false);
      resetForm();
      loadUserVesselIds();
    } catch (error) {
      console.error('Error creating assignment:', error);
      toast({
        title: 'Error',
        description: 'Failed to create assignment. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteAssignment = async (assignmentId: string, userId: string) => {
    try {
      const { error } = await supabase
        .from('crew_assignments')
        .update({
          end_date: new Date().toISOString().split('T')[0],
          is_current: false,
        })
        .eq('id', assignmentId);

      if (error) throw error;

      await logAuditTrail(assignmentId, 'DELETE', { is_current: true }, { is_current: false });

      toast({
        title: 'Assignment removed',
        description: 'User has been removed from the vessel.'
      });

      loadUserVesselIds();
    } catch (error) {
      console.error('Error deleting assignment:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove assignment.',
        variant: 'destructive'
      });
    }
  };

  const transferUser = async () => {
    if (!selectedAssignment || !transferVesselId) return;

    setSaving(true);

    try {
      // End current assignment
      await supabase
        .from('crew_assignments')
        .update({
          end_date: new Date().toISOString().split('T')[0],
          is_current: false,
        })
        .eq('user_id', selectedAssignment.userId)
        .eq('vessel_id', selectedAssignment.fromVesselId)
        .eq('is_current', true);

      // Create new assignment
      const { data, error } = await supabase
        .from('crew_assignments')
        .insert({
          user_id: selectedAssignment.userId,
          vessel_id: transferVesselId,
          position: selectedAssignment.position,
          join_date: new Date().toISOString().split('T')[0],
          start_date: new Date().toISOString().split('T')[0],
          is_current: true,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;

      await logAuditTrail(data.id, 'TRANSFER', 
        { from_vessel: selectedAssignment.fromVesselId },
        { to_vessel: transferVesselId }
      );

      toast({
        title: 'Transfer complete',
        description: 'User has been transferred to the new vessel.'
      });

      setIsTransferModalOpen(false);
      setSelectedAssignment(null);
      setTransferVesselId('');
      loadUserVesselIds();
    } catch (error) {
      console.error('Error transferring user:', error);
      toast({
        title: 'Error',
        description: 'Failed to transfer user.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      user_id: '',
      vessel_id: '',
      position: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
    });
    setEditingAssignment(null);
  };

  const openTransferModal = (userId: string, fromVesselId: string, position: string) => {
    setSelectedAssignment({ userId, fromVesselId, position });
    setIsTransferModalOpen(true);
  };

  const getAccessibleVessels = () => {
    if (isDPA) return vessels;
    return vessels.filter(v => userVesselIds.includes(v.id));
  };

  const getRoleColor = (role: string) => {
    switch (role?.toLowerCase()) {
      case 'dpa':
      case 'shore_management':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'master':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'chief_engineer':
      case 'chief_officer':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Vessel Access</h2>
          <p className="text-muted-foreground mt-1">Manage user assignments to vessels</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-muted rounded-lg" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Vessel Access</h2>
        <p className="text-muted-foreground mt-1">
          {isDPA 
            ? 'Manage user assignments across the fleet' 
            : 'Manage user assignments for your vessel(s)'
          }
        </p>
      </div>

      {!isDPA && isCaptain && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            As Captain, you can only manage assignments for your assigned vessel(s).
          </AlertDescription>
        </Alert>
      )}

      {/* User Assignments Table */}
      <SettingsCard
        title="User Assignments"
        description="Current vessel assignments for all users"
        headerAction={
          <Button onClick={() => setIsModalOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Assignment
          </Button>
        }
      >
        {assignments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No assignments found</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Vessels</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((assignment) => (
                  <TableRow key={assignment.user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {assignment.user.first_name} {assignment.user.last_name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {assignment.user.email}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getRoleColor(assignment.user.role)}>
                        {assignment.user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {assignment.assignments.map((a) => (
                          <Badge key={a.id} variant="secondary" className="text-xs">
                            {a.vessel.name}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {assignment.assignments[0]?.position || '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {assignment.assignments.map((a) => (
                          <React.Fragment key={a.id}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openTransferModal(
                                assignment.user.id,
                                a.vessel.id,
                                a.position
                              )}
                              title="Transfer to another vessel"
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteAssignment(a.id, assignment.user.id)}
                              className="text-destructive hover:text-destructive"
                              title="Remove assignment"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </React.Fragment>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SettingsCard>

      {/* Fleet Overview */}
      {isDPA && (
        <SettingsCard
          title="Fleet Overview"
          description="Quick view of all vessels and their crew count"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vessels.map(vessel => {
              const vesselAssignments = assignments.flatMap(a => 
                a.assignments.filter(as => as.vessel.id === vessel.id)
              );
              
              return (
                <div 
                  key={vessel.id} 
                  className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <Ship className="h-5 w-5 text-primary" />
                    <span className="font-medium">{vessel.name}</span>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    {vessel.imo_number && <p>IMO: {vessel.imo_number}</p>}
                    {vessel.flag_state && <p>Flag: {vessel.flag_state}</p>}
                    {vessel.classification_society && <p>Class: {vessel.classification_society}</p>}
                  </div>
                  <div className="mt-3 pt-3 border-t flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {vesselAssignments.length} crew assigned
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>
      )}

      {/* Add Assignment Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Assignment</DialogTitle>
            <DialogDescription>
              Assign a user to a vessel with a specific position
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user">User *</Label>
              <Select
                value={formData.user_id}
                onValueChange={(value) => setFormData({ ...formData, user_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.first_name} {u.last_name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vessel">Vessel *</Label>
              <Select
                value={formData.vessel_id}
                onValueChange={(value) => setFormData({ ...formData, vessel_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select vessel" />
                </SelectTrigger>
                <SelectContent>
                  {getAccessibleVessels().map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="position">Position *</Label>
              <Select
                value={formData.position}
                onValueChange={(value) => setFormData({ ...formData, position: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {POSITIONS.map(pos => (
                    <SelectItem key={pos} value={pos}>
                      {pos}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start_date">Start Date</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">End Date</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Leave empty for ongoing</p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createAssignment} disabled={saving}>
              {saving ? 'Creating...' : 'Create Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Modal */}
      <Dialog open={isTransferModalOpen} onOpenChange={setIsTransferModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer User</DialogTitle>
            <DialogDescription>
              Transfer this user to a different vessel
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Transfer to Vessel</Label>
              <Select
                value={transferVesselId}
                onValueChange={setTransferVesselId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select destination vessel" />
                </SelectTrigger>
                <SelectContent>
                  {getAccessibleVessels()
                    .filter(v => v.id !== selectedAssignment?.fromVesselId)
                    .map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={transferUser} disabled={saving || !transferVesselId}>
              {saving ? 'Transferring...' : 'Transfer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VesselAccessSection;
