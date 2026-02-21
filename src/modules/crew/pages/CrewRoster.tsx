import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  UserPlus,
  Search,
  Users,
  MoreHorizontal,
  Eye,
  Edit,
  LogOut,
  Download,
  Ship,
  ArrowRightLeft,
  UserX,
  Loader2,
  Upload,
  KeyRound,
  UserCheck,
  ShieldAlert,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useCrew, type CrewMember } from '@/modules/crew/hooks/useCrew';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useVesselFilter } from '@/modules/vessels/hooks/useVesselFilter';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';
import CrewFormModal from '@/modules/crew/components/CrewFormModal';
import CrewProfileModal from '@/modules/crew/components/CrewProfileModal';
import TransferCrewModal from '@/modules/crew/components/TransferCrewModal';
import FullCrewEditModal from '@/modules/crew/components/FullCrewEditModal';
import SignOffDialog from '@/modules/crew/components/SignOffDialog';
import ImportCrewCSVModal from '@/modules/crew/components/ImportCrewCSVModal';
import AdminPinModal from '@/modules/crew/components/AdminPinModal';
import ResetAccountModal from '@/modules/crew/components/ResetAccountModal';
import ToggleAccessModal from '@/modules/crew/components/ToggleAccessModal';
import ReallocateVesselModal from '@/modules/crew/components/ReallocateVesselModal';

const CrewRoster: React.FC = () => {
  const { profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Use global vessel filter from master selector
  const { vesselFilter: masterVesselFilter, isAllVessels, selectedVessel } = useVesselFilter();
  
  // Local override for vessel selection within roster page (optional)
  const [localVesselFilter, setLocalVesselFilter] = useState<string>('inherit');
  
  // Determine effective vessel filter: use local override if set, otherwise use master filter
  const effectiveVesselFilter = useMemo(() => {
    if (localVesselFilter === 'inherit') {
      return isAllVessels ? undefined : masterVesselFilter || undefined;
    }
    return localVesselFilter === 'all' ? undefined : localVesselFilter;
  }, [localVesselFilter, masterVesselFilter, isAllVessels]);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSignOffDialogOpen, setIsSignOffDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewMember | null>(null);
  
  // Admin action states
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isToggleAccessModalOpen, setIsToggleAccessModalOpen] = useState(false);
  const [isReallocateModalOpen, setIsReallocateModalOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<'reset' | 'toggle' | 'reallocate' | null>(null);
  
  const { isConfirmed } = useAdminActions();
  const [isSyncing, setIsSyncing] = useState(false);
  
  const { vessels, isLoading: vesselsLoading } = useVessels();
  const {
    crew,
    isLoading,
    refetch: refetchCrew,
    addCrewMember,
    updateCrewMember,
    transferCrew,
    signOffCrew,
    deactivateCrew,
  } = useCrew(effectiveVesselFilter);

  const canManageCrew = ['dpa', 'shore_management'].includes(profile?.role || '');
  const isDPAAdmin = ['dpa', 'superadmin'].includes(profile?.role || '');
  const isMaster = profile?.role === 'master';

  // Handle ?new=true URL parameter to auto-open Add Crew modal
  useEffect(() => {
    if (searchParams.get('new') === 'true' && canManageCrew) {
      setIsFormModalOpen(true);
      // Remove the query param after opening
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, canManageCrew, setSearchParams]);

  // Filter crew based on search
  const filteredCrew = useMemo(() => {
    if (!searchQuery.trim()) return crew;

    const query = searchQuery.toLowerCase();
    return crew.filter(
      (member) =>
        member.first_name.toLowerCase().includes(query) ||
        member.last_name.toLowerCase().includes(query) ||
        member.rank?.toLowerCase().includes(query) ||
        member.nationality?.toLowerCase().includes(query) ||
        member.email.toLowerCase().includes(query)
    );
  }, [crew, searchQuery]);

  const handleViewProfile = (member: CrewMember) => {
    setSelectedCrew(member);
    setIsProfileModalOpen(true);
  };

  const handleEditProfile = (member: CrewMember) => {
    setSelectedCrew(member);
    setIsProfileModalOpen(false);
    setIsEditModalOpen(true);
  };

  const handleTransfer = (member: CrewMember) => {
    setSelectedCrew(member);
    setIsProfileModalOpen(false);
    setIsTransferModalOpen(true);
  };

  const handleSignOff = (member: CrewMember) => {
    setSelectedCrew(member);
    setIsProfileModalOpen(false);
    setIsSignOffDialogOpen(true);
  };

  const handleDeactivate = (member: CrewMember) => {
    setSelectedCrew(member);
    setIsProfileModalOpen(false);
    setIsDeactivateDialogOpen(true);
  };

  const confirmSignOff = async (data: { assignmentId: string; leaveDate: string }) => {
    await signOffCrew.mutateAsync(data);
    setIsSignOffDialogOpen(false);
    setSelectedCrew(null);
  };

  const confirmDeactivate = async () => {
    if (selectedCrew) {
      await deactivateCrew.mutateAsync(selectedCrew.user_id);
    }
    setIsDeactivateDialogOpen(false);
    setSelectedCrew(null);
  };

  const handleExportCSV = () => {
    const headers = ['Name', 'Rank/Position', 'Vessel Assignment', 'Nationality', 'Email', 'Phone', 'Join Date', 'Status'];
    const rows = filteredCrew.map((member) => [
      `${member.first_name} ${member.last_name}`,
      member.rank || '',
      member.current_assignment?.vessel_name || 'Unassigned',
      member.nationality || '',
      member.email,
      member.phone || '',
      member.current_assignment?.join_date || '',
      member.status || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `STORM_Crew_List_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'Active':
        return 'default';
      case 'On Leave':
        return 'secondary';
      case 'Inactive':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getAccountStatusBadge = (member: CrewMember) => {
    const status = member.account_status || 'active';
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-primary/80">Active</Badge>;
      case 'disabled':
        return <Badge variant="destructive">Disabled</Badge>;
      case 'invited':
        return <Badge variant="secondary">Invited</Badge>;
      case 'not_invited':
        return <Badge variant="outline">Not Invited</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Admin action handlers
  const handleAdminAction = (member: CrewMember, action: 'reset' | 'toggle' | 'reallocate') => {
    setSelectedCrew(member);
    setPendingAdminAction(action);
    
    // Check if already confirmed within window
    if (isConfirmed()) {
      executeAdminAction(action);
    } else {
      setIsPinModalOpen(true);
    }
  };

  const executeAdminAction = (action: 'reset' | 'toggle' | 'reallocate') => {
    setPendingAdminAction(null);
    switch (action) {
      case 'reset':
        setIsResetModalOpen(true);
        break;
      case 'toggle':
        setIsToggleAccessModalOpen(true);
        break;
      case 'reallocate':
        setIsReallocateModalOpen(true);
        break;
    }
  };

  const handlePinConfirmed = () => {
    if (pendingAdminAction) {
      executeAdminAction(pendingAdminAction);
    }
  };

  const activeVessels = vessels.filter((v) => v.status === 'Active');
  
  // Get selected vessel name for display
  const selectedVesselName = useMemo(() => {
    if (localVesselFilter === 'inherit') {
      if (isAllVessels) return 'all vessels';
      return selectedVessel?.name || 'selected vessel';
    }
    if (localVesselFilter === 'all') return 'all vessels';
    return activeVessels.find(v => v.id === localVesselFilter)?.name || 'selected vessel';
  }, [localVesselFilter, isAllVessels, selectedVessel, activeVessels]);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Crew List</h1>
            <p className="text-muted-foreground">Manage crew assignments and profiles</p>
          </div>
          {canManageCrew && (
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  setIsSyncing(true);
                  try {
                    const { data, error } = await supabase.functions.invoke('airtable-sync', {
                      body: { action: 'two_way' },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast({
                      title: 'Airtable Sync Complete',
                      description: `Imported: ${data.imported}, Exported: ${data.exported}${data.errored ? `, Errors: ${data.errored}` : ''}`,
                    });
                    refetchCrew();
                  } catch (e: any) {
                    toast({ title: 'Sync Failed', description: e.message, variant: 'destructive' });
                  } finally {
                    setIsSyncing(false);
                  }
                }}
                variant="outline"
                className="flex items-center gap-2"
                disabled={isSyncing}
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Airtable'}
              </Button>
              <Button 
                onClick={() => setIsImportModalOpen(true)}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
              <Button 
                onClick={() => setIsFormModalOpen(true)} 
                className="flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                Add Crew Member
              </Button>
            </div>
          )}
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, rank, nationality, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={localVesselFilter} onValueChange={setLocalVesselFilter}>
                <SelectTrigger className="w-full sm:w-64">
                  {vesselsLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading vessels...</span>
                    </div>
                  ) : (
                    <>
                      <Ship className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Use Master Filter" />
                    </>
                  )}
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="inherit">
                    {isAllVessels 
                      ? '🔗 Master Filter (All Vessels)' 
                      : `🔗 Master Filter (${selectedVessel?.name || 'Selected'})`
                    }
                  </SelectItem>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {activeVessels.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name} {vessel.imo_number && `(IMO: ${vessel.imo_number})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleExportCSV} className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Crew Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              <span>
                {isLoading ? (
                  'Loading crew members...'
                ) : (
                  <>
                    Showing {filteredCrew.length} crew member{filteredCrew.length !== 1 ? 's' : ''}{' '}
                    {effectiveVesselFilter ? `on ${selectedVesselName}` : 'across all vessels'}
                  </>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredCrew.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
                {crew.length === 0 ? (
                  <>
                    <p className="text-lg font-medium">
                      {!effectiveVesselFilter 
                        ? 'No crew members yet' 
                        : `No crew currently assigned to ${selectedVesselName}`}
                    </p>
                    <p className="text-sm mb-4">
                      {canManageCrew 
                        ? 'Click "Add Crew Member" to get started.' 
                        : 'Contact your administrator to add crew members.'}
                    </p>
                    {canManageCrew && (
                      <Button onClick={() => setIsFormModalOpen(true)} className="gap-2">
                        <UserPlus className="w-4 h-4" />
                        Add Crew Member
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium">No crew members found</p>
                    <p className="text-sm">Try adjusting your search or filter.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Rank/Position</TableHead>
                      <TableHead>Vessel Assignment</TableHead>
                      <TableHead>Nationality</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Contract Start</TableHead>
                      <TableHead>Contract End</TableHead>
                      <TableHead>Passport Expiry</TableHead>
                      <TableHead>Medical Expiry</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Account Status</TableHead>
                      <TableHead>Last Login</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCrew.map((member) => (
                      <TableRow key={member.id} className={member.status === 'Inactive' ? 'opacity-50' : ''}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {member.first_name} {member.last_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {member.rank || member.current_assignment?.position || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {member.current_assignment ? (
                            <div className="flex items-center gap-2">
                              <Ship className="w-4 h-4 text-muted-foreground" />
                              {member.current_assignment.vessel_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {member.nationality || '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.email}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.phone || '-'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {member.department || '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.contract_start_date
                            ? format(new Date(member.contract_start_date), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.contract_end_date
                            ? format(new Date(member.contract_end_date), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.passport_expiry
                            ? format(new Date(member.passport_expiry), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {member.medical_expiry
                            ? format(new Date(member.medical_expiry), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(member.status)}>
                            {member.status || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getAccountStatusBadge(member)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {member.last_login_at
                            ? format(new Date(member.last_login_at), 'dd MMM yyyy HH:mm')
                            : 'Never'}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-popover">
                              <DropdownMenuItem onClick={() => handleViewProfile(member)}>
                                <Eye className="w-4 h-4 mr-2" />
                                View Profile
                              </DropdownMenuItem>
                              {(canManageCrew || isMaster) && (
                                <DropdownMenuItem onClick={() => handleEditProfile(member)}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              {canManageCrew && member.current_assignment && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleTransfer(member)}>
                                    <ArrowRightLeft className="w-4 h-4 mr-2" />
                                    Transfer
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleSignOff(member)}>
                                    <LogOut className="w-4 h-4 mr-2" />
                                    Sign Off
                                  </DropdownMenuItem>
                                </>
                              )}
                              {canManageCrew && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    onClick={() => handleDeactivate(member)}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <UserX className="w-4 h-4 mr-2" />
                                    Deactivate
                                  </DropdownMenuItem>
                                </>
                              )}
                              {isDPAAdmin && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <ShieldAlert className="w-3 h-3" />
                                    Admin Actions
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleAdminAction(member, 'reset')}>
                                    <KeyRound className="w-4 h-4 mr-2" />
                                    Reset Account
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleAdminAction(member, 'toggle')}>
                                    {member.account_status === 'disabled' ? (
                                      <><UserCheck className="w-4 h-4 mr-2" />Enable Access</>
                                    ) : (
                                      <><UserX className="w-4 h-4 mr-2" />Disable Access</>
                                    )}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleAdminAction(member, 'reallocate')}>
                                    <Ship className="w-4 h-4 mr-2" />
                                    Reallocate Vessel
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <CrewFormModal
        isOpen={isFormModalOpen}
        onClose={() => setIsFormModalOpen(false)}
        onSubmit={addCrewMember.mutateAsync}
        isLoading={addCrewMember.isPending}
      />

      <CrewProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => {
          setIsProfileModalOpen(false);
          setSelectedCrew(null);
        }}
        crewMember={selectedCrew}
        onEdit={() => selectedCrew && handleEditProfile(selectedCrew)}
        onTransfer={() => selectedCrew && handleTransfer(selectedCrew)}
        onSignOff={() => selectedCrew && handleSignOff(selectedCrew)}
        onDeactivate={() => selectedCrew && handleDeactivate(selectedCrew)}
        canManage={canManageCrew}
      />

      <FullCrewEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setSelectedCrew(null);
        }}
        crewMember={selectedCrew}
        onSubmit={updateCrewMember.mutateAsync}
        isLoading={updateCrewMember.isPending}
      />

      <TransferCrewModal
        isOpen={isTransferModalOpen}
        onClose={() => {
          setIsTransferModalOpen(false);
          setSelectedCrew(null);
        }}
        crewMember={selectedCrew}
        onSubmit={transferCrew.mutateAsync}
        isLoading={transferCrew.isPending}
      />

      <SignOffDialog
        isOpen={isSignOffDialogOpen}
        onClose={() => {
          setIsSignOffDialogOpen(false);
          setSelectedCrew(null);
        }}
        crewMember={selectedCrew}
        onConfirm={confirmSignOff}
        isLoading={signOffCrew.isPending}
      />

      {/* Deactivate Confirmation */}
      <AlertDialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {selectedCrew?.first_name}{' '}
              {selectedCrew?.last_name}'s account? They will no longer be able to access the
              system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import CSV Modal */}
      <ImportCrewCSVModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          refetchCrew();
        }}
      />

      {/* Admin Action Modals */}
      <AdminPinModal
        open={isPinModalOpen}
        onOpenChange={setIsPinModalOpen}
        onConfirmed={handlePinConfirmed}
        title="Confirm Admin Action"
        description="Enter your 6-digit admin PIN to proceed with this sensitive action."
      />

      <ResetAccountModal
        open={isResetModalOpen}
        onOpenChange={setIsResetModalOpen}
        crewMember={selectedCrew}
      />

      <ToggleAccessModal
        open={isToggleAccessModalOpen}
        onOpenChange={setIsToggleAccessModalOpen}
        crewMember={selectedCrew}
      />

      <ReallocateVesselModal
        open={isReallocateModalOpen}
        onOpenChange={setIsReallocateModalOpen}
        crewMember={selectedCrew}
      />
    </DashboardLayout>
  );
};

export default CrewRoster;
