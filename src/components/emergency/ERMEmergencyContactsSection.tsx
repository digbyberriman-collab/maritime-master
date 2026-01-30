import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Info, AlertTriangle } from 'lucide-react';
import { useEmergencyContactsStore } from '@/store/emergencyContactsStore';
import { EmergencyContactCard } from '@/components/emergency/EmergencyContactCard';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface ERMEmergencyContactsSectionProps {
  vesselId: string;
}

export function ERMEmergencyContactsSection({ vesselId }: ERMEmergencyContactsSectionProps) {
  const { contacts, isLoading, loadContacts, currentVesselId } = useEmergencyContactsStore();

  useEffect(() => {
    if (vesselId && vesselId !== currentVesselId) {
      loadContacts(vesselId);
    }
  }, [vesselId, currentVesselId, loadContacts]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!contacts) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Emergency Contacts Not Configured</h3>
          <p className="text-muted-foreground mb-4">
            Emergency contact details have not been configured for this vessel.
          </p>
          <Link 
            to={`/vessels/${vesselId}/emergency`}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Set up now
            <ExternalLink className="w-4 h-4" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Read-only notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This section displays emergency contact information managed under{' '}
          <Link 
            to={`/vessels/${vesselId}/emergency`}
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Vessel → Emergency Details
            <ExternalLink className="w-3 h-3" />
          </Link>
          . To make changes, edit the source data there.
        </AlertDescription>
      </Alert>

      {/* Emergency Contact Card - Read Only */}
      <EmergencyContactCard contacts={contacts} variant="full" />
    </div>
  );
}
