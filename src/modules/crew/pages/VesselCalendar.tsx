import { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, ChevronLeft, ChevronRight, Plus, Loader2,
  Plane, Wrench, Shield, ClipboardCheck, Users, Ship
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  isToday, parseISO
} from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  type: 'rotation' | 'audit' | 'yard' | 'drill' | 'travel' | 'maintenance';
  description?: string;
  vesselId?: string;
  vesselName?: string;
}

const EVENT_COLORS: Record<string, { bg: string; text: string; icon: React.ElementType }> = {
  rotation: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Users },
  audit: { bg: 'bg-purple-100', text: 'text-purple-700', icon: Shield },
  yard: { bg: 'bg-orange-100', text: 'text-orange-700', icon: Wrench },
  drill: { bg: 'bg-green-100', text: 'text-green-700', icon: ClipboardCheck },
  travel: { bg: 'bg-cyan-100', text: 'text-cyan-700', icon: Plane },
  maintenance: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Wrench },
};

export default function VesselCalendar() {
  const { profile } = useAuth();
  const { selectedVesselId, vessels } = useVessel();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [viewType, setViewType] = useState<'month' | 'list'>('month');

  useEffect(() => {
    loadEvents();
  }, [currentMonth, selectedVesselId, profile?.company_id]);

  async function loadEvents() {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      const start = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
      const end = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
      const allEvents: CalendarEvent[] = [];

      // Load crew travel records
      const travelQuery = supabase
        .from('crew_travel_records')
        .select(`
          id, departure_date, arrival_date, travel_type,
          crew_member:profiles(first_name, last_name),
          vessel:vessels(id, name)
        `)
        .eq('company_id', profile.company_id)
        .gte('departure_date', start)
        .lte('departure_date', end);

      if (selectedVesselId && selectedVesselId !== '__all__') {
        travelQuery.eq('vessel_id', selectedVesselId);
      }

      const { data: travelData } = await travelQuery;
      
      travelData?.forEach(t => {
        const crewName = t.crew_member 
          ? `${t.crew_member.first_name} ${t.crew_member.last_name}`
          : 'Unknown';
        allEvents.push({
          id: `travel-${t.id}`,
          title: `${crewName} - ${t.travel_type}`,
          date: t.departure_date,
          endDate: t.arrival_date || undefined,
          type: 'travel',
          vesselId: t.vessel?.id,
          vesselName: t.vessel?.name,
        });
      });

      // Load audits
      const auditQuery = supabase
        .from('audits')
        .select('id, audit_number, audit_type, scheduled_date, vessel:vessels(id, name)')
        .eq('company_id', profile.company_id)
        .gte('scheduled_date', start)
        .lte('scheduled_date', end);

      if (selectedVesselId && selectedVesselId !== '__all__') {
        auditQuery.eq('vessel_id', selectedVesselId);
      }

      const { data: auditData } = await auditQuery;
      
      auditData?.forEach(a => {
        allEvents.push({
          id: `audit-${a.id}`,
          title: `${a.audit_type} Audit`,
          date: a.scheduled_date,
          type: 'audit',
          description: a.audit_number,
          vesselId: a.vessel?.id,
          vesselName: a.vessel?.name,
        });
      });

      // Load drills (using correct column names)
      const drillQuery = supabase
        .from('drills')
        .select('id, drill_number, drill_date_scheduled, status, vessel:vessels(id, name)')
        .gte('drill_date_scheduled', start)
        .lte('drill_date_scheduled', end);

      if (selectedVesselId && selectedVesselId !== '__all__') {
        drillQuery.eq('vessel_id', selectedVesselId);
      }

      const { data: drillData } = await drillQuery;
      
      drillData?.forEach((d: any) => {
        if (d.drill_date_scheduled) {
          allEvents.push({
            id: `drill-${d.id}`,
            title: d.drill_number || 'Drill',
            date: d.drill_date_scheduled,
            type: 'drill',
            description: d.status,
            vesselId: d.vessel?.id,
            vesselName: d.vessel?.name,
          });
        }
      });

      setEvents(allEvents);
    } catch (error) {
      console.error('Failed to load calendar events:', error);
    } finally {
      setLoading(false);
    }
  }

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const getEventsForDay = (day: Date) => {
    return events.filter(event => isSameDay(parseISO(event.date), day));
  };

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="h-6 w-6" />
              Vessel Calendar
            </h1>
            <p className="text-muted-foreground">
              Crew rotations, audits, drills, and yard periods
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={viewType} onValueChange={(v: 'month' | 'list') => setViewType(v)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="list">List</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Calendar Navigation */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <CardTitle className="text-lg">
                {format(currentMonth, 'MMMM yyyy')}
              </CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : viewType === 'month' ? (
              <div className="grid grid-cols-7 gap-1">
                {/* Weekday headers */}
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
                
                {/* Calendar days */}
                {calendarDays.map(day => {
                  const dayEvents = getEventsForDay(day);
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isSelected = selectedDate && isSameDay(day, selectedDate);
                  
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDate(day)}
                      className={`
                        min-h-[80px] p-1 rounded-lg border text-left transition-colors
                        ${isCurrentMonth ? 'bg-background' : 'bg-muted/30 text-muted-foreground'}
                        ${isToday(day) ? 'border-primary' : 'border-transparent'}
                        ${isSelected ? 'ring-2 ring-primary' : ''}
                        hover:bg-muted/50
                      `}
                    >
                      <span className={`
                        text-sm font-medium
                        ${isToday(day) ? 'text-primary' : ''}
                      `}>
                        {format(day, 'd')}
                      </span>
                      <div className="space-y-0.5 mt-1">
                        {dayEvents.slice(0, 3).map(event => {
                          const config = EVENT_COLORS[event.type];
                          return (
                            <div
                              key={event.id}
                              className={`text-xs truncate px-1 py-0.5 rounded ${config.bg} ${config.text}`}
                            >
                              {event.title}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-xs text-muted-foreground px-1">
                            +{dayEvents.length - 3} more
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              // List view
              <div className="space-y-2">
                {events.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No events this month
                  </p>
                ) : (
                  events
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(event => {
                      const config = EVENT_COLORS[event.type];
                      const Icon = config.icon;
                      return (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50"
                        >
                          <div className={`p-2 rounded-lg ${config.bg}`}>
                            <Icon className={`h-4 w-4 ${config.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{event.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(parseISO(event.date), 'MMM d, yyyy')}
                              {event.vesselName && ` • ${event.vesselName}`}
                            </p>
                          </div>
                          <Badge variant="outline" className={`${config.bg} ${config.text}`}>
                            {event.type}
                          </Badge>
                        </div>
                      );
                    })
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Selected Day Details */}
        {selectedDate && viewType === 'month' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDayEvents.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No events scheduled
                </p>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map(event => {
                    const config = EVENT_COLORS[event.type];
                    const Icon = config.icon;
                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-3 p-3 rounded-lg border"
                      >
                        <div className={`p-2 rounded-lg ${config.bg}`}>
                          <Icon className={`h-4 w-4 ${config.text}`} />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{event.title}</p>
                          {event.description && (
                            <p className="text-sm text-muted-foreground">{event.description}</p>
                          )}
                          {event.vesselName && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Ship className="h-3 w-3" />
                              {event.vesselName}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {event.type}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardContent className="py-3">
            <div className="flex flex-wrap gap-4">
              {Object.entries(EVENT_COLORS).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <div key={type} className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${config.bg}`}>
                      <Icon className={`h-3 w-3 ${config.text}`} />
                    </div>
                    <span className="text-sm capitalize">{type}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
