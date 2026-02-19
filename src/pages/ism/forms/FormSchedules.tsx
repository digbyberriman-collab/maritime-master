import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Calendar, Plus, Search, Clock, Play, Pause, Trash2,
  FileText, Loader2, Ship, Edit, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Database, Json } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { format } from 'date-fns';
import { toast } from 'sonner';

type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';

interface FormSchedule {
  id: string;
  name: string;
  template_id: string;
  template_name: string | null;
  frequency: ScheduleFrequency;
  day_of_week: number | null;
  day_of_month: number | null;
  is_active: boolean;
  vessel_ids: string[];
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

const frequencyLabels: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

function normalizeFrequency(value: string | null): ScheduleFrequency {
  if (value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'quarterly' || value === 'annually') {
    return value;
  }
  return 'monthly';
}

function buildRecurrenceConfig(frequency: ScheduleFrequency): Json {
  switch (frequency) {
    case 'daily':
      return { interval_days: 1 };
    case 'weekly':
      return { interval_weeks: 1, weekday: 1 };
    case 'monthly':
      return { interval_months: 1, day_of_month: 1 };
    case 'quarterly':
      return { interval_months: 3, day_of_month: 1 };
    case 'annually':
      return { interval_years: 1, day: 1, month: 1 };
    default:
      return { interval_months: 1, day_of_month: 1 };
  }
}

export default function FormSchedules() {
  const { profile, user } = useAuth();
  const [schedules, setSchedules] = useState<FormSchedule[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);
  const [vessels, setVessels] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    template_id: '',
    frequency: 'monthly' as ScheduleFrequency,
    vessel_id: '',
  });

  const templateNameById = useMemo(
    () => new Map(templates.map((template) => [template.id, template.name])),
    [templates],
  );

  useEffect(() => {
    if (!profile?.company_id) return;
    loadSchedules();
    loadTemplates();
    loadVessels();
  }, [profile?.company_id]);

  async function loadSchedules() {
    if (!profile?.company_id) {
      setSchedules([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('form_schedules')
        .select(`
          id,
          schedule_name,
          template_id,
          recurrence_type,
          is_active,
          next_due_date,
          last_generated_at,
          created_at,
          vessel_id,
          template:form_templates(template_name)
        `)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mapped = ((data || []) as Array<{
        id: string;
        schedule_name: string | null;
        template_id: string;
        recurrence_type: string;
        is_active: boolean | null;
        next_due_date: string | null;
        last_generated_at: string | null;
        created_at: string | null;
        vessel_id: string | null;
        template: { template_name: string } | null;
      }>).map((schedule) => ({
        id: schedule.id,
        name: schedule.schedule_name || schedule.id,
        template_id: schedule.template_id || '',
        template_name: schedule.template?.template_name || null,
        frequency: normalizeFrequency(schedule.recurrence_type),
        day_of_week: null,
        day_of_month: null,
        is_active: schedule.is_active ?? true,
        vessel_ids: schedule.vessel_id ? [schedule.vessel_id] : [],
        last_run: schedule.last_generated_at,
        next_run: schedule.next_due_date,
        created_at: schedule.created_at || '',
      }));

      setSchedules(mapped);
    } catch (error) {
      console.error('Failed to load schedules:', error);
      setSchedules([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadTemplates() {
    if (!profile?.company_id) {
      setTemplates([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, template_name')
        .eq('company_id', profile.company_id)
        .eq('status', 'PUBLISHED')
        .order('template_name');

      if (error) throw error;
      setTemplates((data || []).map((template) => ({ id: template.id, name: template.template_name })));
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  async function loadVessels() {
    if (!profile?.company_id) {
      setVessels([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('vessels')
        .select('id, name')
        .eq('company_id', profile.company_id)
        .or('status.is.null,status.neq.Sold')
        .order('name');

      if (error) throw error;
      setVessels(data || []);
    } catch (error) {
      console.error('Failed to load vessels:', error);
    }
  }

  async function handleToggleActive(id: string, currentState: boolean) {
    try {
      const { error } = await supabase
        .from('form_schedules')
        .update({ is_active: !currentState })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentState ? 'Schedule paused' : 'Schedule activated');
      loadSchedules();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
      toast.error('Failed to update schedule');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const { error } = await supabase
        .from('form_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Schedule deleted');
      loadSchedules();
    } catch (error) {
      console.error('Failed to delete schedule:', error);
      toast.error('Failed to delete schedule');
    }
  }

  async function handleCreateSchedule() {
    if (!newSchedule.name || !newSchedule.template_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!profile?.company_id || !user?.id) {
      toast.error('You must be logged in with a valid company context');
      return;
    }

    try {
      const startDate = new Date().toISOString().split('T')[0];
      const payload: Database['public']['Tables']['form_schedules']['Insert'] = {
        company_id: profile.company_id,
        created_by: user.id,
        schedule_name: newSchedule.name.trim(),
        template_id: newSchedule.template_id,
        recurrence_type: newSchedule.frequency,
        recurrence_config: buildRecurrenceConfig(newSchedule.frequency),
        start_date: startDate,
        next_due_date: startDate,
        is_active: true,
        vessel_id: newSchedule.vessel_id || null,
      };

      const { error } = await supabase
        .from('form_schedules')
        .insert(payload);

      if (error) throw error;

      toast.success('Schedule created');
      setIsDialogOpen(false);
      setNewSchedule({ name: '', template_id: '', frequency: 'monthly', vessel_id: '' });
      loadSchedules();
    } catch (error) {
      console.error('Failed to create schedule:', error);
      toast.error('Failed to create schedule');
    }
  }

  const filteredSchedules = schedules.filter(s => {
    const templateName = s.template_name || templateNameById.get(s.template_id) || '';
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(searchLower) ||
      templateName.toLowerCase().includes(searchLower)
    );
  });

  const activeSchedules = filteredSchedules.filter(s => s.is_active);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Calendar className="w-6 h-6" />
              Form Schedules
            </h1>
            <p className="text-muted-foreground">Manage recurring form schedules for vessels</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Form Schedule</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Schedule Name *</Label>
                  <Input
                    placeholder="e.g., Monthly Safety Inspection"
                    value={newSchedule.name}
                    onChange={(e) => setNewSchedule({ ...newSchedule, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Form Template *</Label>
                  <Select 
                    value={newSchedule.template_id}
                    onValueChange={(v) => setNewSchedule({ ...newSchedule, template_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select 
                    value={newSchedule.frequency}
                    onValueChange={(value) => setNewSchedule({ ...newSchedule, frequency: normalizeFrequency(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annually">Annually</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assign to Vessels</Label>
                  <Select
                    value={newSchedule.vessel_id || '__all__'}
                    onValueChange={(value) => setNewSchedule({ ...newSchedule, vessel_id: value === '__all__' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All vessels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Vessels</SelectItem>
                      {vessels.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateSchedule}>
                  Create Schedule
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Play className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeSchedules.length}</p>
                  <p className="text-sm text-muted-foreground">Active Schedules</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Pause className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {filteredSchedules.filter(s => !s.is_active).length}
                  </p>
                  <p className="text-sm text-muted-foreground">Paused</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <RefreshCw className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {filteredSchedules.filter(s => s.frequency === 'daily').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Daily</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FileText className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {new Set(filteredSchedules.map(s => s.template_id)).size}
                  </p>
                  <p className="text-sm text-muted-foreground">Form Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search schedules..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedules List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredSchedules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No schedules found</p>
              <Button className="mt-4" onClick={() => setIsDialogOpen(true)}>
                Create First Schedule
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSchedules.map((schedule) => (
              <Card key={schedule.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center ${
                      schedule.is_active ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {schedule.is_active ? (
                        <Play className="w-6 h-6 text-green-600" />
                      ) : (
                        <Pause className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{schedule.name}</p>
                        <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                          {schedule.is_active ? 'Active' : 'Paused'}
                        </Badge>
                        <Badge variant="outline">
                          {frequencyLabels[schedule.frequency]}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          {schedule.template_name || templateNameById.get(schedule.template_id) || 'Unknown template'}
                        </span>
                        {schedule.vessel_ids?.length > 0 && (
                          <span className="flex items-center gap-1">
                            <Ship className="w-3 h-3" />
                            {schedule.vessel_ids.length} vessel(s)
                          </span>
                        )}
                        {schedule.next_run && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Next: {format(new Date(schedule.next_run), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={schedule.is_active}
                        onCheckedChange={() => handleToggleActive(schedule.id, schedule.is_active)}
                      />
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-600"
                        onClick={() => handleDelete(schedule.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
