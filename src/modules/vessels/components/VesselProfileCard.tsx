import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Ship, Pencil, FileText } from 'lucide-react';
import { useVessels, type VesselFormData } from '@/modules/vessels/hooks/useVessels';
import VesselFormModal from '@/modules/vessels/components/VesselFormModal';
import VesselParticularsModal from '@/modules/vessels/components/VesselParticularsModal';
import { VESSEL_PARTICULARS_SECTIONS } from '@/modules/vessels/config/particularsSchema';

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
  const { vessels, updateVessel, updateVesselParticulars } = useVessels();
  const vessel = vessels.find((v) => v.id === vesselId) || null;
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isParticularsOpen, setIsParticularsOpen] = useState(false);

  if (!vessel) return null;

  const handleSubmit = async (data: VesselFormData) => {
    await updateVessel.mutateAsync({ id: vessel.id, formData: data });
  };

  const particulars: Record<string, string> = vessel.particulars || {};
  const hasParticulars = Object.values(particulars).some((v) => v && v.toString().trim() !== '');

  const handleParticularsSubmit = async (values: Record<string, string>) => {
    await updateVesselParticulars.mutateAsync({ id: vessel.id, particulars: values });
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

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div>
              <CardTitle>Vessel Particulars</CardTitle>
              <CardDescription>
                Full specification sheet — dimensions, machinery, electrical, ownership and more
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setIsParticularsOpen(true)}>
            <Pencil className="w-4 h-4 mr-2" />
            {hasParticulars ? 'Edit Particulars' : 'Add Particulars'}
          </Button>
        </CardHeader>
        <CardContent>
          {!hasParticulars ? (
            <p className="text-sm text-muted-foreground">
              No particulars recorded yet. Click "Add Particulars" to enter the vessel's
              specification sheet (dimensions, machinery, classification, ownership, etc.).
            </p>
          ) : (
            <div className="space-y-6">
              {VESSEL_PARTICULARS_SECTIONS.map((section) => {
                const sectionFields = section.fields.filter(
                  (f) => particulars[f.key] && particulars[f.key].toString().trim() !== ''
                );
                if (sectionFields.length === 0) return null;
                return (
                  <div key={section.id}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b border-border pb-1 mb-3">
                      {section.title}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3">
                      {sectionFields.map((field) => (
                        <div
                          key={field.key}
                          className={field.multiline ? 'md:col-span-2 lg:col-span-3' : ''}
                        >
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            {field.label}
                          </p>
                          <p className="text-sm font-medium text-foreground whitespace-pre-line">
                            {particulars[field.key]}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <VesselFormModal
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        vessel={vessel}
        onSubmit={handleSubmit}
        isLoading={updateVessel.isPending}
      />

      <VesselParticularsModal
        open={isParticularsOpen}
        onOpenChange={setIsParticularsOpen}
        vesselName={vessel.name}
        initialValues={particulars}
        onSubmit={handleParticularsSubmit}
        isLoading={updateVesselParticulars.isPending}
      />
    </>
  );
};

export default VesselProfileCard;