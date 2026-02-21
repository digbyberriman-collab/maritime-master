import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useEmergencyContactsStore } from '@/modules/emergency/store/emergencyContactsStore';
import { EmergencyContactCard } from './EmergencyContactCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

interface EmergencyContactsWidgetProps {
  vesselId: string;
}

export function EmergencyContactsWidget({ vesselId }: EmergencyContactsWidgetProps) {
  const navigate = useNavigate();
  const { contacts, isLoading, loadContacts, currentVesselId } = useEmergencyContactsStore();

  useEffect(() => {
    if (vesselId && vesselId !== currentVesselId) {
      loadContacts(vesselId);
    }
  }, [vesselId, currentVesselId, loadContacts]);

  if (isLoading) {
    return (
      <Card className="border-destructive/50">
        <CardContent className="p-4">
          <Skeleton className="h-4 w-32 mb-3" />
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (!contacts) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4 text-center">
          <AlertTriangle className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm font-medium text-muted-foreground">Emergency contacts not configured</p>
          <p className="text-xs text-muted-foreground mt-1">Please set up emergency contact details</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <EmergencyContactCard
      contacts={contacts}
      variant="widget"
      onViewFull={() => navigate(`/vessels/${vesselId}/emergency`)}
      showLogo={false}
    />
  );
}
