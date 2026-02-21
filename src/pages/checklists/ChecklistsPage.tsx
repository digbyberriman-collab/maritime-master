import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CheckSquare, Plus, ChevronLeft, Clock, User, Calendar,
  Check, X, Minus, Camera,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { CHECKLIST_TEMPLATES, type ChecklistTemplate } from '@/data/seedData';
import { cn } from '@/lib/utils';

type View = 'list' | 'detail' | 'active';

function frequencyLabel(f: string): string {
  const labels: Record<string, string> = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly',
    annually: 'Annually', per_use: 'Per Use', per_port: 'Per Port',
    per_departure: 'Per Dep', per_watch: 'Per Watch', per_dive: 'Per Dive',
  };
  return labels[f] || f;
}

function isDue(template: ChecklistTemplate): 'overdue' | 'due' | 'ok' {
  if (!template.lastCompletedDate) return 'overdue';
  const days = differenceInDays(new Date(), new Date(template.lastCompletedDate));
  const thresholds: Record<string, number> = {
    daily: 1, weekly: 7, monthly: 30, quarterly: 90, annually: 365,
  };
  const threshold = thresholds[template.frequency];
  if (!threshold) return 'ok';
  if (days > threshold) return 'overdue';
  if (days > threshold * 0.8) return 'due';
  return 'ok';
}

const DEPARTMENT_TABS = [
  'all', 'bridge', 'deck', 'engineering', 'interior', 'galley', 'medical', 'dive', 'tech', 'safety',
];

const ChecklistsPage: React.FC = () => {
  const [view, setView] = useState<View>('list');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistTemplate | null>(null);
  const [activeItems, setActiveItems] = useState<Record<number, 'pending' | 'passed' | 'failed' | 'na'>>({});
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const filteredChecklists = selectedDepartment === 'all'
    ? CHECKLIST_TEMPLATES
    : CHECKLIST_TEMPLATES.filter(t => t.department === selectedDepartment);

  const groupedChecklists = filteredChecklists.reduce<Record<string, ChecklistTemplate[]>>((acc, t) => {
    const dept = t.department.charAt(0).toUpperCase() + t.department.slice(1);
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(t);
    return acc;
  }, {});

  const openChecklist = (t: ChecklistTemplate) => {
    setSelectedChecklist(t);
    setView('detail');
  };

  const startChecklist = () => {
    if (!selectedChecklist) return;
    const items: Record<number, 'pending' | 'passed' | 'failed' | 'na'> = {};
    selectedChecklist.items.forEach((_, i) => { items[i] = 'pending'; });
    setActiveItems(items);
    setView('active');
  };

  const setItemStatus = (idx: number, status: 'passed' | 'failed' | 'na') => {
    setActiveItems(prev => ({ ...prev, [idx]: status }));
  };

  const totalItems = selectedChecklist?.items.length || 0;
  const completedItems = Object.values(activeItems).filter(s => s !== 'pending').length;
  const allResolved = completedItems === totalItems && totalItems > 0;

  // LIST VIEW
  if (view === 'list') {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <CheckSquare className="w-6 h-6" />
                Checklists
              </h1>
              <p className="text-muted-foreground">Department-based operational checklists</p>
            </div>
            <Button className="gap-1 bg-[#3B82F6]">
              <Plus className="w-4 h-4" /> Create New Checklist
            </Button>
          </div>

          <Tabs value={selectedDepartment} onValueChange={setSelectedDepartment}>
            <TabsList className="bg-[#111D33] border border-[#1A2740] flex-wrap h-auto">
              {DEPARTMENT_TABS.map(dept => (
                <TabsTrigger
                  key={dept}
                  value={dept}
                  className="data-[state=active]:bg-[#1A2740] data-[state=active]:text-white capitalize"
                >
                  {dept === 'all' ? 'All' : dept}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="space-y-8">
            {Object.entries(groupedChecklists).map(([dept, checklists]) => (
              <div key={dept}>
                <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-wider mb-3">
                  {dept} Department
                </h2>
                <div className="space-y-1">
                  {checklists.map((checklist, i) => {
                    const status = isDue(checklist);
                    return (
                      <button
                        key={i}
                        onClick={() => openChecklist(checklist)}
                        className="w-full flex items-center justify-between p-3 rounded-lg bg-[#111D33] border border-[#1A2740] hover:bg-[#1A2740]/50 transition text-left"
                      >
                        <div className="flex items-center gap-3">
                          <CheckSquare className={cn(
                            'w-5 h-5',
                            status === 'overdue' ? 'text-[#EF4444]' :
                            status === 'due' ? 'text-[#F59E0B]' :
                            'text-[#94A3B8]'
                          )} />
                          <span className="text-white font-medium">{checklist.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="outline" className="text-[#94A3B8] border-[#1A2740]">
                            {frequencyLabel(checklist.frequency)}
                          </Badge>
                          <span className="text-[#94A3B8] text-sm">
                            Last: {checklist.lastCompletedDate
                              ? format(new Date(checklist.lastCompletedDate), 'dd MMM')
                              : 'Never'}
                          </span>
                          {status === 'overdue' && (
                            <Badge className="bg-[#EF4444] text-white">Overdue</Badge>
                          )}
                          {status === 'due' && (
                            <Badge className="bg-[#F59E0B] text-black">Due Soon</Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // DETAIL VIEW
  if (view === 'detail' && selectedChecklist) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <button onClick={() => setView('list')} className="flex items-center gap-1 text-[#94A3B8] hover:text-white transition">
            <ChevronLeft className="w-4 h-4" /> Back to Checklists
          </button>

          <div>
            <h1 className="text-2xl font-bold text-foreground">{selectedChecklist.name}</h1>
            <div className="flex items-center gap-4 mt-2">
              <Badge variant="outline" className="text-[#94A3B8] border-[#1A2740] capitalize">
                {selectedChecklist.department} Department
              </Badge>
              <span className="text-[#94A3B8] text-sm flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {frequencyLabel(selectedChecklist.frequency)}
              </span>
              <span className="text-[#94A3B8] text-sm">~{selectedChecklist.estimatedMinutes} min</span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button className="gap-2 bg-[#3B82F6]" onClick={startChecklist}>
              <CheckSquare className="w-4 h-4" /> Start New Checklist
            </Button>
            <Button variant="outline" className="gap-2 border-[#1A2740] text-[#94A3B8]">
              <Calendar className="w-4 h-4" /> View History
            </Button>
          </div>

          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader>
              <CardTitle className="text-white">Checklist Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {selectedChecklist.items.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-[#1A2740]">
                    <span className="text-[#94A3B8] text-sm font-mono w-6">{i + 1}.</span>
                    <span className="text-white text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Completion History */}
          <Card className="bg-[#111D33] border-[#1A2740]">
            <CardHeader>
              <CardTitle className="text-white">Completion History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { date: selectedChecklist.lastCompletedDate || '2026-02-15', time: '14:30', who: selectedChecklist.lastCompletedBy || 'Unknown', passed: selectedChecklist.items.length, total: selectedChecklist.items.length },
                  { date: '2026-02-08', time: '09:15', who: selectedChecklist.lastCompletedBy === 'Emil Schwarz' ? 'Luke Petzer' : 'Emil Schwarz', passed: selectedChecklist.items.length, total: selectedChecklist.items.length },
                  { date: '2026-02-01', time: '11:00', who: selectedChecklist.lastCompletedBy || 'Emil Schwarz', passed: selectedChecklist.items.length, total: selectedChecklist.items.length },
                  { date: '2026-01-25', time: '16:45', who: 'Oliver Kincart', passed: selectedChecklist.items.length, total: selectedChecklist.items.length },
                ].map((entry, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-[#1A2740] hover:bg-[#1A2740]/80 cursor-pointer">
                    <div className="flex items-center gap-4">
                      <span className="text-white text-sm">{format(new Date(entry.date), 'dd MMM yyyy')}</span>
                      <span className="text-[#94A3B8] text-sm">{entry.time}</span>
                      <span className="text-white text-sm flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-[#94A3B8]" />
                        {entry.who}
                      </span>
                    </div>
                    <Badge className="bg-[#22C55E] text-white">
                      {entry.passed}/{entry.total}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ACTIVE CHECKLIST VIEW
  if (view === 'active' && selectedChecklist) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <button onClick={() => setView('detail')} className="flex items-center gap-1 text-[#94A3B8] hover:text-white transition">
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{selectedChecklist.name}</h1>
              <p className="text-[#94A3B8] text-sm">Active Checklist — {completedItems} of {totalItems} complete</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-[#1A2740] text-[#94A3B8]">Save Progress</Button>
              <Button
                className="bg-[#22C55E]"
                disabled={!allResolved}
                onClick={() => setShowCompleteModal(true)}
              >
                Complete
              </Button>
            </div>
          </div>

          <Progress value={(completedItems / totalItems) * 100} className="h-2" />

          <div className="space-y-2">
            {selectedChecklist.items.map((item, i) => {
              const status = activeItems[i] || 'pending';
              return (
                <Card key={i} className={cn(
                  'bg-[#111D33] border-[#1A2740]',
                  status === 'passed' && 'border-l-4 border-l-[#22C55E]',
                  status === 'failed' && 'border-l-4 border-l-[#EF4444]',
                  status === 'na' && 'border-l-4 border-l-[#94A3B8]',
                )}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <span className="text-[#94A3B8] text-sm font-mono w-6 pt-0.5">{i + 1}.</span>
                        <span className={cn('text-sm', status === 'pending' ? 'text-white' : 'text-[#94A3B8]')}>
                          {item}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => setItemStatus(i, 'passed')}
                          className={cn(
                            'w-9 h-9 rounded flex items-center justify-center transition',
                            status === 'passed' ? 'bg-[#22C55E] text-white' : 'bg-[#1A2740] text-[#94A3B8] hover:bg-[#22C55E]/20'
                          )}
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setItemStatus(i, 'failed')}
                          className={cn(
                            'w-9 h-9 rounded flex items-center justify-center transition',
                            status === 'failed' ? 'bg-[#EF4444] text-white' : 'bg-[#1A2740] text-[#94A3B8] hover:bg-[#EF4444]/20'
                          )}
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setItemStatus(i, 'na')}
                          className={cn(
                            'w-9 h-9 rounded flex items-center justify-center transition',
                            status === 'na' ? 'bg-[#94A3B8] text-white' : 'bg-[#1A2740] text-[#94A3B8] hover:bg-[#94A3B8]/20'
                          )}
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                        <button className="w-9 h-9 rounded flex items-center justify-center bg-[#1A2740] text-[#94A3B8] hover:bg-[#1A2740]/80 transition">
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Complete Modal */}
          <Dialog open={showCompleteModal} onOpenChange={setShowCompleteModal}>
            <DialogContent className="bg-[#111D33] border-[#1A2740]">
              <DialogHeader>
                <DialogTitle className="text-white">Complete Checklist</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label className="text-[#94A3B8]">Signature (Type your name)</Label>
                  <Input className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="Full name..." />
                </div>
                <div>
                  <Label className="text-[#94A3B8]">Overall Notes</Label>
                  <Textarea className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="Any additional comments..." />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 rounded bg-[#1A2740]">
                    <p className="text-2xl font-bold text-[#22C55E]">{Object.values(activeItems).filter(s => s === 'passed').length}</p>
                    <p className="text-xs text-[#94A3B8]">Passed</p>
                  </div>
                  <div className="p-3 rounded bg-[#1A2740]">
                    <p className="text-2xl font-bold text-[#EF4444]">{Object.values(activeItems).filter(s => s === 'failed').length}</p>
                    <p className="text-xs text-[#94A3B8]">Failed</p>
                  </div>
                  <div className="p-3 rounded bg-[#1A2740]">
                    <p className="text-2xl font-bold text-[#94A3B8]">{Object.values(activeItems).filter(s => s === 'na').length}</p>
                    <p className="text-xs text-[#94A3B8]">N/A</p>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCompleteModal(false)} className="border-[#1A2740] text-[#94A3B8]">Cancel</Button>
                <Button className="bg-[#22C55E]" onClick={() => { setShowCompleteModal(false); setView('detail'); }}>
                  Confirm & Complete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </DashboardLayout>
    );
  }

  return null;
};

export default ChecklistsPage;
