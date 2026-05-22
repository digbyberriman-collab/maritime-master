import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ship, Pencil } from 'lucide-react';
import { useVessels, type VesselFormData } from '@/modules/vessels/hooks/useVessels';
import VesselFormModal from '@/modules/vessels/components/VesselFormModal';

interface VesselProfileCardProps {
  vesselId: string;
}

const Field: React.FC<{ label: string; value?: string | number | null }> = ({ label, value }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium text-foreground">
      {value === null || value === undefined || value === '' ? '—' : value}
    </p>
  </div>
);

const VesselProfileCard: React.FC<VesselProfileCardProps> = ({ vesselId }) => {
  const { vessels, updateVessel } = useVessels();
  const vessel = vessels.find((v) => v.id === vesselId) || null;
  const [isEditOpen, setIsEditOpen] = useState(false);

  if (!vessel) return null;

  const handleSubmit = async (data: VesselFormData) => {
    await updateVessel.mutateAsync({ id: vessel.id, formData: data });
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Ship className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                {vessel.name}
                {vessel.status && (
                  <Badge variant="outline" className="ml-1">
                    {vessel.status}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Vessel profile and particulars</CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit Profile
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <Field label="IMO Number" value={vessel.imo_number} />
            <Field label="Vessel Type" value={vessel.vessel_type} />
            <Field label="Flag State" value={vessel.flag_state} />
            <Field label="Classification" value={vessel.classification_society} />
            <Field label="Gross Tonnage" value={vessel.gross_tonnage} />
            <Field label="Build Year" value={vessel.build_year} />
            <Field label="Status" value={vessel.status} />
          </div>
        </CardContent>
      </Card>

      <VesselFormModal
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        vessel={vessel}
        onSubmit={handleSubmit}
        isLoading={updateVessel.isPending}
      />
    </>
  );
};

export default VesselProfileCard;