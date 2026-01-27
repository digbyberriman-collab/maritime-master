import React, { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCrew, type CrewMember } from '@/hooks/useCrew';
import { useVessels } from '@/hooks/useVessels';
import CrewFormModal from '@/components/crew/CrewFormModal';
import CrewProfileModal from '@/components/crew/CrewProfileModal';
import TransferCrewModal from '@/components/crew/TransferCrewModal';
import FullCrewEditModal from '@/components/crew/FullCrewEditModal';
import SignOffDialog from '@/components/crew/SignOffDialog';
import ImportCrewCSVModal from '@/components/crew/ImportCrewCSVModal';

const VESSEL_FILTER_KEY = 'storm_crew_vessel_filter';

const CrewRoster: React.FC = () => {
  const { profile } = useAuth();
  
  // Initialize from sessionStorage
  const [vesselFilter, setVesselFilter] = useState<string>(() => {
    const saved = sessionStorage.getItem(VESSEL_FILTER_KEY);
    return saved || 'all';
  });
  
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSignOffDialogOpen, setIsSignOffDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewMember | null>(null);

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
  } = useCrew(vesselFilter === 'all' ? undefined : vesselFilter);

  const canManageCrew = ['dpa', 'shore_management'].includes(profile?.role || '');
  const isMaster = profile?.role === 'master';

  // Save filter to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(VESSEL_FILTER_KEY, vesselFilter);
  }, [vesselFilter]);

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
    a.download = `STORM_Crew_Roster_${format(new Date(), 'yyyy-MM-dd')}.csv`;
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

  const activeVessels = vessels.filter((v) => v.status === 'Active');
  
  // Get selected vessel name for display
  const selectedVesselName = vesselFilter === 'all' 
    ? 'all vessels' 
    : activeVessels.find(v => v.id === vesselFilter)?.name || 'selected vessel';

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Crew Roster</h1>
            <p className="text-muted-foreground">Manage crew assignments and profiles</p>
          </div>
          {canManageCrew && (
            <div className="flex gap-2">
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
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-full sm:w-64">
                  {vesselsLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Loading vessels...</span>
                    </div>
                  ) : (
                    <>
                      <Ship className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="All Vessels" />
                    </>
                  )}
                </SelectTrigger>
                <SelectContent className="bg-popover">
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
                    {vesselFilter === 'all' ? 'across all vessels' : `on ${selectedVesselName}`}
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
                      {vesselFilter === 'all' 
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
                      <TableHead>Join Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCrew.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">
                          {member.first_name} {member.last_name}
                        </TableCell>
                        <TableCell>
                          {member.rank || member.current_assignment?.position || '-'}
                        </TableCell>
                        <TableCell>
                          {member.current_assignment ? (
                            <div className="flex items-center gap-2">
                              <Ship className="w-4 h-4 text-muted-foreground" />
                              {member.current_assignment.vessel_name}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>{member.nationality || '-'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {member.email}
                        </TableCell>
                        <TableCell>{member.phone || '-'}</TableCell>
                        <TableCell>
                          {member.current_assignment?.join_date
                            ? format(new Date(member.current_assignment.join_date), 'dd MMM yyyy')
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(member.status)}>
                            {member.status || 'Unknown'}
                          </Badge>
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
    </DashboardLayout>
  );
};

export default CrewRoster;
