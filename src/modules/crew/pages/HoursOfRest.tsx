import { useState, useEffect, useMemo } from 'react';
import { 
  Clock, Plus, Save, Calendar, AlertTriangle, 
  CheckCircle, Loader2, ChevronLeft, ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/shared/hooks/use-toast';
import { 
  format, startOfWeek, endOfWeek, eachDayOfInterval, 
  addWeeks, subWeeks, parseISO, isSameDay
} from 'date-fns';

interface HourBlock {
  hour: number;
  isRest: boolean;
}

interface DayRecord {
  date: string;
  hours: HourBlock[];
  totalRest: number;
  isCompliant: boolean;
  notes?: string;
}

// STCW Requirements:
// - Minimum 10 hours rest in any 24-hour period
// - Minimum 77 hours rest in any 7-day period
// - Rest may be divided into no more than two periods, one of which must be at least 6 hours

export default function HoursOfRest() {
  const { user, profile } = useAuth();
  const { selectedVessel } = useVessel();
  const { toast } = useToast();
  
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [records, setRecords] = useState<Record<string, DayRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const weekDays = useMemo(() => {
    const start = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday start
    const end = endOfWeek(currentWeek, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentWeek]);

  useEffect(() => {
    if (user?.id) {
      loadRecords();
    }
  }, [user?.id, currentWeek]);

  async function loadRecords() {
    setLoading(true);
    try {
      const start = format(weekDays[0], 'yyyy-MM-dd');
      const end = format(weekDays[6], 'yyyy-MM-dd');

      const { data } = await supabase
        .from('hours_of_rest_records')
        .select('*')
        .eq('crew_id', user?.id)
        .gte('record_date', start)
        .lte('record_date', end);

      const recordMap: Record<string, DayRecord> = {};
      
      // Initialize all days with empty records
      weekDays.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const existingRecord = data?.find((r: any) => r.record_date === dateStr);
        
        if (existingRecord) {
          // Parse rest_periods JSONB to create hours array
          const restPeriods = (existingRecord.rest_periods as any[]) || [];
          const hours = createDefaultHours();
          // Mark rest hours based on rest_periods
          restPeriods.forEach((period: any) => {
            if (period.start !== undefined && period.end !== undefined) {
              for (let h = period.start; h < period.end; h++) {
                if (hours[h]) hours[h].isRest = true;
              }
            }
          });
          const totalRest = existingRecord.total_rest_hours || hours.filter(h => h.isRest).length;
          recordMap[dateStr] = {
            date: dateStr,
            hours,
            totalRest,
            isCompliant: existingRecord.is_compliant || totalRest >= 10,
            notes: existingRecord.notes || undefined,
          };
        } else {
          recordMap[dateStr] = {
            date: dateStr,
            hours: createDefaultHours(),
            totalRest: 0,
            isCompliant: false,
          };
        }
      });

      setRecords(recordMap);
    } catch (error) {
      console.error('Failed to load HoR records:', error);
    } finally {
      setLoading(false);
    }
  }

  function createDefaultHours(): HourBlock[] {
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      isRest: false,
    }));
  }

  function toggleHour(date: string, hour: number) {
    setRecords(prev => {
      const dayRecord = prev[date];
      if (!dayRecord) return prev;

      const newHours = dayRecord.hours.map(h => 
        h.hour === hour ? { ...h, isRest: !h.isRest } : h
      );
      const totalRest = newHours.filter(h => h.isRest).length;

      return {
        ...prev,
        [date]: {
          ...dayRecord,
          hours: newHours,
          totalRest,
          isCompliant: totalRest >= 10,
        },
      };
    });
  }

  function setNotes(date: string, notes: string) {
    setRecords(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        notes,
      },
    }));
  }

  async function saveRecords() {
    if (!user?.id || !selectedVessel?.id) {
      toast({
        title: 'Error',
        description: 'Please select a vessel first',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      // Convert hours to rest_periods format
      const upsertData = Object.values(records).map(record => {
        const restPeriods: { start: number; end: number }[] = [];
        let periodStart: number | null = null;
        
        record.hours.forEach((hour, idx) => {
          if (hour.isRest && periodStart === null) {
            periodStart = idx;
          } else if (!hour.isRest && periodStart !== null) {
            restPeriods.push({ start: periodStart, end: idx });
            periodStart = null;
          }
        });
        if (periodStart !== null) {
          restPeriods.push({ start: periodStart, end: 24 });
        }

        return {
          crew_id: user.id,
          vessel_id: selectedVessel.id,
          record_date: record.date,
          rest_periods: restPeriods,
          total_rest_hours: record.totalRest,
          total_work_hours: 24 - record.totalRest,
          is_compliant: record.isCompliant,
          notes: record.notes || null,
        };
      });

      const { error } = await supabase
        .from('hours_of_rest_records')
        .upsert(upsertData as any, { onConflict: 'crew_id,record_date' });

      if (error) throw error;

      toast({
        title: 'Saved',
        description: 'Hours of rest records saved successfully',
      });
    } catch (error) {
      console.error('Failed to save:', error);
      toast({
        title: 'Error',
        description: 'Failed to save records',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }

  const weeklyStats = useMemo(() => {
    const totalRest = Object.values(records).reduce((sum, r) => sum + r.totalRest, 0);
    const isWeeklyCompliant = totalRest >= 77;
    const nonCompliantDays = Object.values(records).filter(r => !r.isCompliant).length;
    
    return { totalRest, isWeeklyCompliant, nonCompliantDays };
  }, [records]);

  const selectedRecord = records[format(selectedDate, 'yyyy-MM-dd')];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Clock className="h-6 w-6" />
              Hours of Rest
            </h1>
            <p className="text-muted-foreground">
              STCW/MLC rest hour compliance tracking
            </p>
          </div>
          <Button onClick={saveRecords} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>

        {/* Week Navigation */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="text-center">
                <p className="font-medium">
                  {format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}
                </p>
                <p className="text-sm text-muted-foreground">Week View</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className={weeklyStats.isWeeklyCompliant ? 'border-success' : 'border-destructive'}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Rest Total</p>
                  <p className="text-2xl font-bold">{weeklyStats.totalRest}h / 77h</p>
                </div>
                {weeklyStats.isWeeklyCompliant ? (
                  <CheckCircle className="h-8 w-8 text-success" />
                ) : (
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Compliant Days</p>
              <p className="text-2xl font-bold">
                {7 - weeklyStats.nonCompliantDays} / 7
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">STCW Status</p>
              <Badge 
                variant="outline" 
                className={weeklyStats.isWeeklyCompliant && weeklyStats.nonCompliantDays === 0
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
                }
              >
                {weeklyStats.isWeeklyCompliant && weeklyStats.nonCompliantDays === 0
                  ? 'Compliant'
                  : 'Non-Compliant'
                }
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Day Selector */}
        <div className="grid grid-cols-7 gap-2">
          {weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const record = records[dateStr];
            const isSelected = isSameDay(day, selectedDate);
            
            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(day)}
                className={`
                  p-3 rounded-lg border text-center transition-colors
                  ${isSelected ? 'ring-2 ring-primary border-primary' : 'hover:bg-muted/50'}
                  ${record?.isCompliant ? 'bg-success/5' : 'bg-destructive/5'}
                `}
              >
                <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
                <p className="font-medium">{format(day, 'd')}</p>
                <p className={`text-sm font-bold ${record?.isCompliant ? 'text-success' : 'text-destructive'}`}>
                  {record?.totalRest || 0}h
                </p>
              </button>
            );
          })}
        </div>

        {/* Hour Grid */}
        {selectedRecord && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>{format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
                <Badge 
                  variant="outline"
                  className={selectedRecord.isCompliant ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}
                >
                  {selectedRecord.totalRest}h rest ({selectedRecord.isCompliant ? 'Compliant' : 'Non-Compliant'})
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
                {selectedRecord.hours.map((block) => (
                  <button
                    key={block.hour}
                    onClick={() => toggleHour(selectedRecord.date, block.hour)}
                    className={`
                      aspect-square rounded text-xs font-medium transition-colors
                      ${block.isRest 
                        ? 'bg-success text-success-foreground' 
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }
                    `}
                    title={`${String(block.hour).padStart(2, '0')}:00 - ${block.isRest ? 'Rest' : 'Work'}`}
                  >
                    {block.hour}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-success" />
                  <span>Rest</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-muted" />
                  <span>Work</span>
                </div>
                <p className="text-muted-foreground ml-auto">
                  Tap hours to toggle rest/work
                </p>
              </div>

              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  value={selectedRecord.notes || ''}
                  onChange={(e) => setNotes(selectedRecord.date, e.target.value)}
                  placeholder="Add notes for this day..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* STCW Requirements Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">STCW Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                Minimum 10 hours rest in any 24-hour period
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                Minimum 77 hours rest in any 7-day period
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                Rest may be divided into max 2 periods, one must be at least 6 hours
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
