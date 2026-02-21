import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Ship, Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { useVessels, Vessel, VesselFormData } from '@/modules/vessels/hooks/useVessels';
import VesselFormModal from '@/modules/vessels/components/VesselFormModal';
import DeleteVesselDialog from '@/modules/vessels/components/DeleteVesselDialog';
import { Skeleton } from '@/components/ui/skeleton';

const Vessels: React.FC = () => {
  const { vessels, isLoading, createVessel, updateVessel, deleteVessel } = useVessels();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);

  // Auto-open modal when navigated with ?new=true
  useEffect(() => {
    if (searchParams.get('new') === 'true') {
      setSelectedVessel(null);
      setIsFormModalOpen(true);
      searchParams.delete('new');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const filteredVessels = useMemo(() => {
    if (!searchQuery.trim()) return vessels;
    
    const query = searchQuery.toLowerCase();
    return vessels.filter(
      (vessel) =>
        vessel.name.toLowerCase().includes(query) ||
        vessel.imo_number?.toLowerCase().includes(query)
    );
  }, [vessels, searchQuery]);

  const handleAddVessel = () => {
    setSelectedVessel(null);
    setIsFormModalOpen(true);
  };

  const handleEditVessel = (vessel: Vessel) => {
    setSelectedVessel(vessel);
    setIsFormModalOpen(true);
  };

  const handleDeleteVessel = (vessel: Vessel) => {
    setSelectedVessel(vessel);
    setIsDeleteDialogOpen(true);
  };

  const handleFormSubmit = async (data: VesselFormData) => {
    if (selectedVessel) {
      await updateVessel.mutateAsync({ id: selectedVessel.id, formData: data });
    } else {
      await createVessel.mutateAsync(data);
    }
  };

  const handleConfirmDelete = async () => {
    if (selectedVessel) {
      await deleteVessel.mutateAsync(selectedVessel.id);
      setIsDeleteDialogOpen(false);
      setSelectedVessel(null);
    }
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'Active':
        return 'default';
      case 'Laid-up':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vessels</h1>
            <p className="text-muted-foreground">Manage your fleet vessels</p>
          </div>
          <Button onClick={handleAddVessel} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Vessel
          </Button>
        </div>

        {/* Search */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by vessel name or IMO number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Vessels Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Ship className="w-5 h-5" />
              Fleet Vessels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : filteredVessels.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Ship className="w-16 h-16 mx-auto mb-4 opacity-50" />
                {vessels.length === 0 ? (
                  <>
                    <p className="text-lg font-medium">No vessels added yet</p>
                    <p className="text-sm">Click "Add Vessel" to get started.</p>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium">No vessels found</p>
                    <p className="text-sm">Try adjusting your search query.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vessel Name</TableHead>
                      <TableHead>IMO Number</TableHead>
                      <TableHead>Flag State</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredVessels.map((vessel) => (
                      <TableRow key={vessel.id}>
                        <TableCell className="font-medium">{vessel.name}</TableCell>
                        <TableCell>{vessel.imo_number || '-'}</TableCell>
                        <TableCell>{vessel.flag_state || '-'}</TableCell>
                        <TableCell>{vessel.classification_society || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={getStatusBadgeVariant(vessel.status)}
                            className={
                              vessel.status === 'Active'
                                ? 'bg-success/20 text-success border-success/30'
                                : ''
                            }
                          >
                            {vessel.status || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditVessel(vessel)}
                              title="Edit vessel"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteVessel(vessel)}
                              title="Delete vessel"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
      <VesselFormModal
        open={isFormModalOpen}
        onOpenChange={setIsFormModalOpen}
        vessel={selectedVessel}
        onSubmit={handleFormSubmit}
        isLoading={createVessel.isPending || updateVessel.isPending}
      />

      <DeleteVesselDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        vessel={selectedVessel}
        onConfirm={handleConfirmDelete}
        isLoading={deleteVessel.isPending}
      />
    </DashboardLayout>
  );
};

export default Vessels;
