import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Ship, Anchor, MapPin, Award, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VesselDashboardData } from '@/modules/vessels/hooks/useVesselDashboard';
import { format } from 'date-fns';

interface VesselHeaderProps {
  data: VesselDashboardData | null;
  isLoading: boolean;
  isAllVessels: boolean;
  onRefresh?: () => void;
  userName?: string;
}

const VesselHeader: React.FC<VesselHeaderProps> = ({
  data,
  isLoading,
  isAllVessels,
  onRefresh,
  userName,
}) => {
  if (isLoading) {
    return (
      <Card className="gradient-primary text-primary-foreground border-0">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Skeleton className="w-14 h-14 rounded-xl bg-primary-foreground/20" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48 bg-primary-foreground/20" />
              <Skeleton className="h-4 w-64 bg-primary-foreground/20" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isAllVessels) {
    return (
      <Card className="gradient-primary text-primary-foreground border-0">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
                <Anchor className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Fleet Overview</h1>
                <p className="text-primary-foreground/80">
                  {userName ? `Welcome, ${userName}` : 'All vessels at a glance'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {data?.data_refreshed_at && (
                <span className="text-xs text-primary-foreground/60">
                  Updated {format(new Date(data.data_refreshed_at), 'HH:mm')}
                </span>
              )}
              {onRefresh && (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={onRefresh}
                  className="h-8 w-8"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gradient-primary text-primary-foreground border-0">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <Ship className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{data?.vessel_name || 'Unknown Vessel'}</h1>
                {data?.imo_number && (
                  <Badge variant="secondary" className="text-xs">
                    IMO {data.imo_number}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-primary-foreground/80 text-sm">
                {data?.flag_state && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {data.flag_state}
                  </span>
                )}
                {data?.classification_society && (
                  <span className="flex items-center gap-1">
                    <Award className="w-3 h-3" />
                    {data.classification_society}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data?.data_refreshed_at && (
              <span className="text-xs text-primary-foreground/60">
                Updated {format(new Date(data.data_refreshed_at), 'HH:mm')}
              </span>
            )}
            {onRefresh && (
              <Button
                variant="secondary"
                size="icon"
                onClick={onRefresh}
                className="h-8 w-8"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VesselHeader;
