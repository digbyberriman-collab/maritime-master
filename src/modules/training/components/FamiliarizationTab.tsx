import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useTraining, isActiveFamiliarisation, FamiliarizationRecord, FamiliarizationChecklistItem } from '@/modules/training/hooks/useTraining';
import { checklistItemsFromSections, mapLegacyStatus } from '@/modules/crew/lib/familiarisation';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { DEFAULT_FAMILIARIZATION_SECTIONS } from '@/modules/training/constants';
import { StatusPill } from '@/shared/components/status';
import { format, addDays } from 'date-fns';
import { 
  ClipboardCheck, 
  Plus, 
  Eye, 
  Calendar, 
  User,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';

type ChecklistItemRow = FamiliarizationChecklistItem & {
  completed_by?: { first_name: string | null; last_name: string | null } | null;
};

/** Items in their saved order (item_order: section * 1000 + item for X1-10 records, section * 100 + item for legacy ones). */
const byOrder = (a: ChecklistItemRow, b: ChecklistItemRow) => (a.item_order ?? 0) - (b.item_order ?? 0);

/**
 * The legacy familiarisation list (the training page's tab before X1-10;
 * now the D-01 fallback of crew/familiarisation). X1-10 fixes C63 here
 * too: starting from a template copies that template's sections into the
 * checklist (it always copied the default sections), and with `vesselId`
 * the list and the start dialog keep to the route vessel. Statuses are read
 * in both vocabularies (legacy In_Progress, X1-10 in_progress, ...).
 */
const FamiliarizationTab: React.FC<{ vesselId?: string | null }> = ({ vesselId = null }) => {
  const { familiarizationRecords: allRecords, templates: allTemplates, startFamiliarization, updateChecklistItem, fetchChecklistItems, isLoading } = useTraining();
  const { crew } = useCrew();
  const { vessels } = useVessels();
  const { profile } = useAuth();

  const [showStartModal, setShowStartModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<FamiliarizationRecord | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>([]);
  const familiarizationRecords = vesselId ? allRecords.filter((r) => r.vessel_id === vesselId) : allRecords;
  const templates = allTemplates.filter((t) => t.is_active !== false && (!vesselId || t.vessel_id === vesselId || t.vessel_id === null));

  // Start familiarization form state
  const [formData, setFormData] = useState({
    user_id: '',
    vessel_id: vesselId ?? '',
    template_id: '',
    supervisor_id: '',
    duration_days: 14,
  });

  const today = format(new Date(), 'yyyy-MM-dd');
  const isPastDue = (r: FamiliarizationRecord) => Boolean(r.target_completion_date && r.target_completion_date.slice(0, 10) < today);
  const activeRecords = familiarizationRecords.filter(r => isActiveFamiliarisation(r.status));
  const completedRecords = familiarizationRecords.filter(r => mapLegacyStatus(r.status) === 'completed');
  const overdueRecords = familiarizationRecords.filter(r => r.status === 'Overdue' || (isActiveFamiliarisation(r.status) && isPastDue(r)));

  const loadChecklistItems = async (recordId: string) => {
    try {
      const items: ChecklistItemRow[] = await fetchChecklistItems(recordId);
      setChecklistItems([...items].sort(byOrder));
    } catch (error) {
      console.error('Failed to load checklist items:', error);
    }
  };

  const handleViewDetails = (record: FamiliarizationRecord) => {
    setSelectedRecord(record);
    loadChecklistItems(record.id);
    setShowDetailModal(true);
  };

  const handleToggleItem = async (item: FamiliarizationChecklistItem) => {
    const newCompleted = !item.completed;
    await updateChecklistItem.mutateAsync({
      id: item.id,
      completed: newCompleted,
      completed_date: newCompleted ? format(new Date(), 'yyyy-MM-dd') : null,
      completed_by_id: newCompleted ? profile?.user_id : null,
    });

    // Refresh items
    if (selectedRecord) {
      loadChecklistItems(selectedRecord.id);
    }
  };

  const handleStartFamiliarization = async () => {
    if (!formData.user_id || !formData.vessel_id) return;

    const today = new Date();
    const targetDate = addDays(today, formData.duration_days);

    // C63: the chosen template's sections become the checklist (the default sections only without one).
    const template = templates.find((t) => t.id === formData.template_id) ?? null;
    const fromTemplate = template ? checklistItemsFromSections(template.sections) : [];
    const checklistItems = (fromTemplate.length > 0 ? fromTemplate : checklistItemsFromSections(DEFAULT_FAMILIARIZATION_SECTIONS)).map((item) => ({
      ...item,
      completed: false,
    }));

    await startFamiliarization.mutateAsync({
      record: {
        user_id: formData.user_id,
        vessel_id: formData.vessel_id,
        template_id: formData.template_id || null,
        // Date-only strings in the viewer's calendar (not the UTC day).
        join_date: format(today, 'yyyy-MM-dd'),
        target_completion_date: format(targetDate, 'yyyy-MM-dd'),
        supervisor_id: formData.supervisor_id || null,
        status: 'In_Progress',
        completion_percentage: 0,
      },
      checklistItems,
    });

    setShowStartModal(false);
    setFormData({
      user_id: '',
      vessel_id: vesselId ?? '',
      template_id: '',
      supervisor_id: '',
      duration_days: 14,
    });
  };

  const chooseTemplate = (id: string) => {
    const template = templates.find((t) => t.id === id) ?? null;
    const days = template?.total_duration_days;
    setFormData((f) => ({
      ...f,
      template_id: id === 'none' ? '' : id,
      duration_days: typeof days === 'number' && [7, 14, 21, 30].includes(days) ? days : f.duration_days,
      vessel_id: vesselId ?? template?.vessel_id ?? f.vessel_id,
    }));
  };

  // Group checklist items by section
  const groupedItems = checklistItems.reduce((acc, item) => {
    if (!acc[item.section_name]) {
      acc[item.section_name] = [];
    }
    acc[item.section_name].push(item);
    return acc;
  }, {} as Record<string, typeof checklistItems>);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Crew Familiarization</h2>
          <p className="text-muted-foreground">Track new crew onboarding and familiarization progress</p>
        </div>
        <Button onClick={() => setShowStartModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Start Familiarization
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-info-muted rounded-lg">
                <Clock className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeRecords.length}</p>
                <p className="text-sm text-muted-foreground">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-success-muted rounded-lg">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedRecords.length}</p>
                <p className="text-sm text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-critical-muted rounded-lg">
                <AlertTriangle className="h-6 w-6 text-critical" />
              </div>
              <div>
                <p className="text-2xl font-bold">{overdueRecords.length}</p>
                <p className="text-sm text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Familiarizations */}
      <div>
        <h3 className="text-lg font-medium mb-4">Active Familiarizations</h3>
        {activeRecords.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Active Familiarizations</h3>
              <p className="text-muted-foreground mb-4">Start a familiarization when new crew joins</p>
              <Button onClick={() => setShowStartModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Start Familiarization
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeRecords.map(record => {
              const daysLeft = Math.ceil(
                (new Date(record.target_completion_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
              );
              const isOverdue = daysLeft < 0;

              return (
                <Card key={record.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {record.user?.first_name} {record.user?.last_name}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {record.user?.rank || 'Crew'} • {record.vessel?.name}
                        </p>
                      </div>
                      <StatusPill domain="familiarization" status={record.status === 'Overdue' ? 'overdue' : mapLegacyStatus(record.status)} size="sm" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{record.completion_percentage}%</span>
                      </div>
                      <Progress value={record.completion_percentage} className="h-2" />
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span>Started: {format(new Date(record.join_date), 'dd MMM yyyy')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span className={isOverdue ? 'text-critical font-medium' : ''}>
                          {isOverdue ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}
                        </span>
                      </div>
                    </div>

                    {record.supervisor && (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Supervisor: {record.supervisor.first_name} {record.supervisor.last_name}</span>
                      </div>
                    )}

                    <Button 
                      variant="outline" 
                      className="w-full" 
                      onClick={() => handleViewDetails(record)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Start Familiarization Modal */}
      <Dialog open={showStartModal} onOpenChange={setShowStartModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start Familiarization</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Crew Member</Label>
              <Select value={formData.user_id} onValueChange={(v) => setFormData({ ...formData, user_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select crew member" />
                </SelectTrigger>
                <SelectContent>
                  {crew.map(c => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.first_name} {c.last_name} - {c.rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Template</Label>
              <Select value={formData.template_id || 'none'} onValueChange={chooseTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Default checklist</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.template_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {vesselId ? null : (
              <div>
                <Label>Vessel</Label>
                <Select value={formData.vessel_id} onValueChange={(v) => setFormData({ ...formData, vessel_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vessel" />
                  </SelectTrigger>
                  <SelectContent>
                    {vessels.map(v => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Supervisor</Label>
              <Select value={formData.supervisor_id} onValueChange={(v) => setFormData({ ...formData, supervisor_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supervisor (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {crew.filter(c => ['master', 'chief_officer', 'chief_engineer'].includes(c.role)).map(c => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.first_name} {c.last_name} - {c.rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Duration (days)</Label>
              <Select 
                value={formData.duration_days.toString()} 
                onValueChange={(v) => setFormData({ ...formData, duration_days: parseInt(v) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="21">21 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowStartModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleStartFamiliarization}
                disabled={!formData.user_id || !formData.vessel_id || startFamiliarization.isPending}
              >
                {startFamiliarization.isPending ? 'Starting...' : 'Start Familiarization'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Familiarization Checklist - {selectedRecord?.user?.first_name} {selectedRecord?.user?.last_name}
            </DialogTitle>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-6">
              {/* Progress Summary */}
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Overall Progress</span>
                    <span>
                      {checklistItems.filter(i => i.completed).length}/{checklistItems.length} items
                    </span>
                  </div>
                  <Progress 
                    value={(checklistItems.filter(i => i.completed).length / Math.max(checklistItems.length, 1)) * 100} 
                    className="h-2" 
                  />
                </div>
              </div>

              {/* Checklist Sections */}
              {Object.entries(groupedItems).map(([sectionName, items]) => {
                const completedCount = items.filter(i => i.completed).length;
                const isComplete = completedCount === items.length;

                return (
                  <div key={sectionName} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium flex items-center gap-2">
                        {isComplete && <CheckCircle2 className="h-4 w-4 text-success" />}
                        {sectionName}
                      </h4>
                      <Badge variant={isComplete ? "default" : "outline"}>
                        {completedCount}/{items.length}
                      </Badge>
                    </div>
                    <div className="space-y-2 pl-4">
                      {items.map(item => (
                        <div key={item.id} className="flex items-start gap-3 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            checked={item.completed}
                            onCheckedChange={() => handleToggleItem(item)}
                            className="mt-0.5"
                          />
                          <div className="flex-1">
                            <p className={item.completed ? 'line-through text-muted-foreground' : ''}>
                              {item.item_text}
                            </p>
                            {item.completed && item.completed_date && (
                              <p className="text-xs text-muted-foreground">
                                Completed {format(new Date(item.completed_date), 'dd MMM yyyy')}
                                {item.completed_by && ` by ${item.completed_by.first_name} ${item.completed_by.last_name}`}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FamiliarizationTab;
