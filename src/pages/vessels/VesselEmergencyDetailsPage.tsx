import { useEffect, useState } from 'react';
import { Edit, History, Loader2, AlertTriangle, FileText } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useVessel } from '@/contexts/VesselContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEmergencyContactsStore } from '@/store/emergencyContactsStore';
import { useDashboardPermissions } from '@/hooks/useRBACPermissions';
import { EmergencyContactCard } from '@/components/emergency/EmergencyContactCard';
import { EmergencyContactsEditDialog } from '@/components/emergency/EmergencyContactsEditDialog';
import { EmergencyContactsHistoryDialog } from '@/components/emergency/EmergencyContactsHistoryDialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

export default function VesselEmergencyDetailsPage() {
  const { selectedVessel } = useVessel();
  const { profile } = useAuth();
  const { isDPA, isCaptain, isReady } = useDashboardPermissions();
  const { contacts, isLoading, error, loadContacts, initializeFromDefaults } = useEmergencyContactsStore();
  
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const vesselId = selectedVessel?.id;
  const companyId = profile?.company_id;
  const canEdit = isReady && (isDPA || isCaptain);

  useEffect(() => {
    if (vesselId) {
      loadContacts(vesselId);
    }
  }, [vesselId, loadContacts]);

  const handleInitializeFromDefaults = async () => {
    if (!vesselId || !companyId) return;
    setIsInitializing(true);
    const success = await initializeFromDefaults(vesselId, companyId);
    setIsInitializing(false);
    if (!success) {
      // No defaults available, open edit dialog
      setIsEditOpen(true);
    }
  };

  if (!selectedVessel) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Please select a vessel to view emergency details.</p>
        </div>
      </DashboardLayout>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6 p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </DashboardLayout>
    );
  }

  if (!contacts) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <Card className="border-dashed">
            <CardContent className="p-12 text-center">
              <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">
                No Emergency Contacts Configured
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Emergency contact details have not been set up for {selectedVessel.name}. 
                {canEdit ? ' Set them up now to ensure critical contact information is available during emergencies.' : ''}
              </p>
              {canEdit && (
                <div className="flex justify-center gap-4">
                  <Button onClick={() => setIsEditOpen(true)}>
                    Set Up Emergency Contacts
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={handleInitializeFromDefaults}
                    disabled={isInitializing}
                  >
                    {isInitializing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Use Fleet Defaults
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog for new contacts */}
        {canEdit && vesselId && companyId && (
          <EmergencyContactsEditDialog
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            vesselId={vesselId}
            companyId={companyId}
            contacts={null}
          />
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Emergency Contact Details</h1>
            <p className="text-muted-foreground mt-1">
              Critical contact information for emergency situations on {selectedVessel.name}
            </p>
          </div>
          
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsHistoryOpen(true)}>
                <History className="w-4 h-4 mr-2" />
                View History
              </Button>
              <Button size="sm" onClick={() => setIsEditOpen(true)}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Details
              </Button>
            </div>
          )}
        </div>

        {/* Emergency Contact Card */}
        <div className="max-w-4xl">
          <EmergencyContactCard contacts={contacts} variant="full" />
        </div>

        {/* Edit Dialog */}
        {canEdit && vesselId && companyId && (
          <EmergencyContactsEditDialog
            open={isEditOpen}
            onOpenChange={setIsEditOpen}
            vesselId={vesselId}
            companyId={companyId}
            contacts={contacts}
          />
        )}

        {/* History Dialog */}
        {canEdit && contacts && (
          <EmergencyContactsHistoryDialog
            open={isHistoryOpen}
            onOpenChange={setIsHistoryOpen}
            contactId={contacts.id}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
