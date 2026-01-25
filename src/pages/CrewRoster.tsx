import React, { useState, useMemo } from 'react';
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
  Plus,
  Search,
  Users,
  MoreHorizontal,
  Eye,
  Edit,
  LogOut,
  Download,
  Ship,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCrew, type CrewMember } from '@/hooks/useCrew';
import { useVessels } from '@/hooks/useVessels';
import CrewFormModal from '@/components/crew/CrewFormModal';
import CrewProfileModal from '@/components/crew/CrewProfileModal';
import TransferCrewModal from '@/components/crew/TransferCrewModal';

const CrewRoster: React.FC = () => {
  const { profile } = useAuth();
  const [vesselFilter, setVesselFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isSignOffDialogOpen, setIsSignOffDialogOpen] = useState(false);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewMember | null>(null);

  const { vessels } = useVessels();
  const {
    crew,
    isLoading,
    addCrewMember,
    updateCrewMember,
    transferCrew,
    signOffCrew,
    deactivateCrew,
  } = useCrew(vesselFilter === 'all' ? undefined : vesselFilter);

  const canManageCrew = ['dpa', 'shore_management'].includes(profile?.role || '');
  const isMaster = profile?.role === 'master';

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
    // For now, close profile modal - in a full implementation, would open edit modal
    setIsProfileModalOpen(false);
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

  const confirmSignOff = async () => {
    if (selectedCrew?.current_assignment) {
      await signOffCrew.mutateAsync({
        assignmentId: selectedCrew.current_assignment.id,
        leaveDate: format(new Date(), 'yyyy-MM-dd'),
      });
    }
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
    const headers = ['Name', 'Rank', 'Vessel', 'Position', 'Nationality', 'Join Date', 'Status'];
    const rows = filteredCrew.map((member) => [
      `${member.first_name} ${member.last_name}`,
      member.rank || '',
      member.current_assignment?.vessel_name || 'Unassigned',
      member.current_assignment?.position || '',
      member.nationality || '',
      member.current_assignment?.join_date || '',
      member.status || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
            <Button onClick={() => setIsFormModalOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Crew Member
            </Button>
          )}
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, rank, or nationality..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <Ship className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="All Vessels" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="all">All Vessels</SelectItem>
                  {activeVessels.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
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
              Crew Members
              {!isLoading && (
                <Badge variant="secondary" className="ml-2">
                  {filteredCrew.length}
                </Badge>
              )}
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
                    <p className="text-lg font-medium">No crew members yet</p>
                    <p className="text-sm">Click "Add Crew Member" to get started.</p>
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
                                <DropdownMenuItem onClick={() => handleSignOff(member)}>
                                  <LogOut className="w-4 h-4 mr-2" />
                                  Sign Off
                                </DropdownMenuItem>
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

      {/* Sign Off Confirmation */}
      <AlertDialog open={isSignOffDialogOpen} onOpenChange={setIsSignOffDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Off Crew Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign off {selectedCrew?.first_name} {selectedCrew?.last_name}{' '}
              from {selectedCrew?.current_assignment?.vessel_name}? This will end their current
              assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOff}>Sign Off</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
    </DashboardLayout>
  );
};

export default CrewRoster;
