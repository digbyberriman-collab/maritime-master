import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDrills } from '@/modules/drills/hooks/useDrills';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { format, startOfMonth, endOfMonth, isSameDay, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Clock, List, CalendarIcon } from 'lucide-react';
import { DRILL_TYPE_COLORS, calculateComplianceStatus } from '@/modules/drills/constants';

interface DrillScheduleTabProps {
  onScheduleDrill: () => void;
}

const DrillScheduleTab: React.FC<DrillScheduleTabProps> = ({ onScheduleDrill }) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [selectedVessel, setSelectedVessel] = useState<string>('all');

  const { drills, drillTypes, scheduledDrills, completedDrills } = useDrills();
  const { vessels } = useVessels();

  // Filter drills by vessel
  const filteredDrills = selectedVessel === 'all' 
    ? drills 
    : drills.filter(d => d.vessel_id === selectedVessel);

  // Get drills for calendar display
  const getDrillsForDate = (date: Date) => {
    return filteredDrills.filter(drill => 
      isSameDay(new Date(drill.drill_date_scheduled), date)
    );
  };

  // Calculate compliance status for each drill type
  const getComplianceTracking = () => {
    return drillTypes
      .filter(dt => dt.category === 'SOLAS_Required')
      .map(drillType => {
        const typeCompletedDrills = completedDrills
          .filter(d => d.drill_type_id === drillType.id)
          .sort((a, b) => new Date(b.drill_date_actual || b.drill_date_scheduled).getTime() - 
                         new Date(a.drill_date_actual || a.drill_date_scheduled).getTime());

        const lastDrill = typeCompletedDrills[0];
        const lastDrillDate = lastDrill 
          ? new Date(lastDrill.drill_date_actual || lastDrill.drill_date_scheduled)
          : null;

        const compliance = calculateComplianceStatus(lastDrillDate, drillType.minimum_frequency);

        return {
          drillType,
          lastDrillDate,
          ...compliance,
        };
      });
  };

  const complianceTracking = getComplianceTracking();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar/List View */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Drill Schedule</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={selectedVessel} onValueChange={setSelectedVessel}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Vessels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'calendar' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('calendar')}
                >
                  <CalendarIcon className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {viewMode === 'calendar' ? (
              <div className="space-y-4">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  className="rounded-md border pointer-events-auto"
                  modifiers={{
                    hasDrill: (date) => getDrillsForDate(date).length > 0,
                  }}
                  modifiersStyles={{
                    hasDrill: { 
                      backgroundColor: 'hsl(var(--primary) / 0.1)',
                      fontWeight: 'bold',
                    },
                  }}
                />

                {/* Selected Date Drills */}
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">
                    {format(selectedDate, 'MMMM d, yyyy')}
                  </h4>
                  {getDrillsForDate(selectedDate).length > 0 ? (
                    <div className="space-y-2">
                      {getDrillsForDate(selectedDate).map(drill => (
                        <div 
                          key={drill.id} 
                          className="p-3 rounded-lg border flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${DRILL_TYPE_COLORS[drill.drill_type?.drill_name || ''] || 'bg-gray-500'}`} />
                            <div>
                              <p className="font-medium">{drill.drill_type?.drill_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {drill.vessel?.name} • {drill.location || 'Location TBD'}
                              </p>
                            </div>
                          </div>
                          <Badge variant={
                            drill.status === 'Completed' ? 'default' :
                            drill.status === 'Scheduled' ? 'secondary' :
                            'outline'
                          }>
                            {drill.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No drills scheduled for this date.
                      <Button variant="link" className="px-1" onClick={onScheduleDrill}>
                        Schedule one?
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {scheduledDrills.length > 0 ? (
                  scheduledDrills
                    .sort((a, b) => new Date(a.drill_date_scheduled).getTime() - new Date(b.drill_date_scheduled).getTime())
                    .map(drill => {
                      const isPast = new Date(drill.drill_date_scheduled) < new Date();
                      return (
                        <div 
                          key={drill.id} 
                          className={`p-3 rounded-lg border flex items-center justify-between ${isPast ? 'bg-red-50 border-red-200' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${DRILL_TYPE_COLORS[drill.drill_type?.drill_name || ''] || 'bg-gray-500'}`} />
                            <div>
                              <p className="font-medium">{drill.drill_type?.drill_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {drill.vessel?.name} • {format(new Date(drill.drill_date_scheduled), 'MMM d, yyyy')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {isPast && <Badge variant="destructive">Overdue</Badge>}
                            <Badge variant="secondary">{drill.drill_number}</Badge>
                          </div>
                        </div>
                      );
                    })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No drills scheduled.
                    <Button variant="link" onClick={onScheduleDrill}>
                      Schedule one?
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Required Drills Tracker */}
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SOLAS Required Drills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {complianceTracking.map(item => (
              <div 
                key={item.drillType.id} 
                className={`p-3 rounded-lg border ${
                  item.status === 'overdue' ? 'bg-critical-muted border-critical/20' :
                  item.status === 'due_soon' ? 'bg-warning-muted border-warning/20' :
                  'bg-success-muted border-success/20'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-medium text-sm">{item.drillType.drill_name}</p>
                  {item.status === 'overdue' ? (
                    <AlertTriangle className="h-4 w-4 text-critical" />
                  ) : item.status === 'due_soon' ? (
                    <Clock className="h-4 w-4 text-warning" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-success" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Required: Every {item.drillType.minimum_frequency} days</p>
                  <p>
                    Last: {item.lastDrillDate 
                      ? format(item.lastDrillDate, 'MMM d, yyyy')
                      : 'Never'
                    }
                  </p>
                  <p className={
                    item.status === 'overdue' ? 'text-red-600 font-medium' :
                    item.status === 'due_soon' ? 'text-yellow-600 font-medium' :
                    'text-green-600'
                  }>
                    {item.status === 'overdue' 
                      ? `Overdue by ${Math.abs(item.daysUntilDue)} days`
                      : item.status === 'due_soon'
                      ? `Due in ${item.daysUntilDue} days`
                      : `Next: ${format(item.nextDueDate, 'MMM d')}`
                    }
                  </p>
                </div>
              </div>
            ))}

            {complianceTracking.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No SOLAS required drills configured
              </p>
            )}
          </CardContent>
        </Card>

        {/* Drill Type Legend */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Drill Types</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(DRILL_TYPE_COLORS).slice(0, 6).map(([name, color]) => (
              <div key={name} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-sm">{name}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DrillScheduleTab;
