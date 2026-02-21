import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Navigation, Plane, FileSignature, 
  ChevronRight, MapPin, Calendar,
  UserPlus, UserMinus
} from 'lucide-react';
import { useDashboardStore } from '@/modules/dashboard/store/dashboardStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const OperationsSnapshot: React.FC = () => {
  const { summary, isAllVessels } = useDashboardStore();

  // Placeholder data - these would connect to actual voyage/travel data sources
  const nextPort = null; // Would come from voyage planning module
  const eta = null;
  const crewMovements: Array<{
    id: string;
    crew_name: string;
    movement_type: 'join' | 'leave';
    date: string;
    vessel_name?: string;
  }> = []; // Would come from crew travel records

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Navigation className="w-4 h-4 text-primary" />
          Operations Snapshot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Next Port / ETA */}
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <MapPin className="w-4 h-4" />
            Next Port
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {nextPort || 'Not scheduled'}
            </span>
            {eta && (
              <span className="text-sm text-muted-foreground">
                ETA: {eta}
              </span>
            )}
          </div>
        </div>

        {/* Upcoming Crew Movements */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plane className="w-4 h-4 text-muted-foreground" />
              Upcoming Crew Movements
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/crew/admin/travel">
                View All
              </Link>
            </Button>
          </div>
          {crewMovements.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No upcoming movements
            </p>
          ) : (
            <div className="space-y-2">
              {crewMovements.slice(0, 5).map((movement) => (
                <div 
                  key={movement.id}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2">
                    {movement.movement_type === 'join' ? (
                      <UserPlus className="w-4 h-4 text-green-500" />
                    ) : (
                      <UserMinus className="w-4 h-4 text-orange-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{movement.crew_name}</p>
                      {isAllVessels && movement.vessel_name && (
                        <p className="text-xs text-muted-foreground">{movement.vessel_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant={movement.movement_type === 'join' ? 'default' : 'secondary'}>
                      {movement.movement_type === 'join' ? 'Joining' : 'Leaving'}
                    </Badge>
                    <p className="text-xs text-muted-foreground mt-0.5">{movement.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Signatures */}
        <Link 
          to="/ism/forms/pending"
          className="flex items-center justify-between p-3 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileSignature className="w-5 h-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Pending Signatures</p>
              <p className="text-xs text-muted-foreground">Forms awaiting approval</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-2xl font-bold',
              (summary?.pending_signatures_count || 0) > 0 && 'text-primary'
            )}>
              {summary?.pending_signatures_count || 0}
            </span>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
};
