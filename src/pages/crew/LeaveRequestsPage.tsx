import { useState, useEffect, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useVessel } from '@/contexts/VesselContext';
import { LEAVE_STATUS_CODES, STATUS_CODE_MAP, CREW_SEED_DATA, type CrewLeaveRequest } from '@/lib/leaveConstants';
import {
  CalendarDays, Plus, Search, Check, X, Loader2, ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, eachDayOfInterval, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const statusBadgeColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
};

export default function LeaveRequestsPage() {
  const { profile, user } = useAuth();
  const { selectedVessel } = useVessel();
  const companyId = profile?.company_id;
  const navigate = useNavigate();

  const [requests, setRequests] = useState<(CrewLeaveRequest & { crewName?: string; crewPosition?: string; crewDepartment?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [form, setForm] = useState({
    crew_id: '',
    leave_type: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    let query = supabase
      .from('crew_leave_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('submitted_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data } = await query;
    
    // Enrich with crew names from seed data or profiles
    const enriched = (data || []).map((r: any) => {
      const seed = CREW_SEED_DATA.find(s => {
        const seedId = `seed-${s.lastName}-${s.firstName}`.replace(/\s/g, '-').toLowerCase();
        return seedId === r.crew_id;
      });
      return {
        ...r,
        crewName: seed ? `${seed.lastName}, ${seed.firstName}` : r.crew_id,
        crewPosition: seed?.position || '',
        crewDepartment: seed?.department || '',
      };
    }) as any[];
    
    setRequests(enriched);
    setLoading(false);
  }, [companyId, statusFilter]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleSubmit = async () => {
    if (!form.crew_id || !form.leave_type || !form.start_date || !form.end_date || !companyId) {
      toast.error('Please fill in all required fields');
      return;
    }

    const { error } = await supabase.from('crew_leave_requests').insert({
      crew_id: form.crew_id,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      notes: form.notes || null,
      status: 'pending',
      company_id: companyId,
      vessel_id: selectedVessel?.id || null,
    });

    if (error) {
      toast.error('Failed to submit request');
      return;
    }

    toast.success('Leave request submitted');
    setDialogOpen(false);
    setForm({ crew_id: '', leave_type: '', start_date: '', end_date: '', notes: '' });
    loadRequests();
  };

  const handleApprove = async (req: CrewLeaveRequest) => {
    if (!companyId) return;

    // Create leave entries for the date range
    const days = eachDayOfInterval({ start: new Date(req.start_date), end: new Date(req.end_date) });
    
    // Check locked months
    const { data: lockedMonths } = await supabase
      .from('crew_leave_locked_months')
      .select('month, year')
      .eq('company_id', companyId);

    const lockedSet = new Set((lockedMonths || []).map((lm: any) => `${lm.year}-${lm.month}`));
    
    let skippedCount = 0;
    const inserts = days.filter(d => {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (lockedSet.has(key)) { skippedCount++; return false; }
      return true;
    }).map(d => ({
      crew_id: req.crew_id,
      date: format(d, 'yyyy-MM-dd'),
      status_code: req.leave_type,
      company_id: companyId,
      vessel_id: selectedVessel?.id || null,
    }));

    // Delete existing entries in this range first
    for (const ins of inserts) {
      await supabase.from('crew_leave_entries').delete().eq('crew_id', ins.crew_id).eq('date', ins.date);
    }

    if (inserts.length > 0) {
      await supabase.from('crew_leave_entries').insert(inserts);
    }

    // Update request status
    await supabase.from('crew_leave_requests').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
    }).eq('id', req.id);

    if (skippedCount > 0) {
      toast.warning(`Approved. ${skippedCount} days in locked months were skipped.`);
    } else {
      toast.success(`Approved. ${inserts.length} days applied to calendar.`);
    }
    loadRequests();
  };

  const handleDecline = async (id: string) => {
    await supabase.from('crew_leave_requests').update({
      status: 'declined',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
    }).eq('id', id);

    toast.success('Request declined');
    loadRequests();
  };

  const filtered = requests.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.crewName?.toLowerCase().includes(s) || r.crewPosition?.toLowerCase().includes(s);
  });

  const counts = {
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    declined: requests.filter(r => r.status === 'declined').length,
  };

  // Build crew dropdown from seed data
  const crewOptions = CREW_SEED_DATA.map(s => ({
    value: `seed-${s.lastName}-${s.firstName}`.replace(/\s/g, '-').toLowerCase(),
    label: `${s.lastName}, ${s.firstName} — ${s.position}`,
  })).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/crew/leave')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <CalendarDays className="w-6 h-6" />
                Leave Requests
              </h1>
              <p className="text-sm text-muted-foreground">Submit & review leave requests</p>
            </div>
          </div>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'declined'] as const).map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-8"
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">
                {counts[s]}
              </Badge>
            </Button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[200px] pl-7 text-xs"
            />
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CalendarDays className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No leave requests found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(req => {
              const codeInfo = STATUS_CODE_MAP[req.leave_type];
              const dayCount = differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1;
              return (
                <Card key={req.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-sm">{req.crewName}</span>
                          {req.crewPosition && (
                            <span className="text-xs text-muted-foreground">({req.crewPosition})</span>
                          )}
                          <Badge className={statusBadgeColors[req.status] || ''}>
                            {req.status}
                          </Badge>
                          {codeInfo && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: codeInfo.bgColor, color: codeInfo.color }}
                            >
                              {codeInfo.code} — {codeInfo.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{format(new Date(req.start_date), 'MMM d')} — {format(new Date(req.end_date), 'MMM d, yyyy')}</span>
                          <span>•</span>
                          <span>{dayCount} day{dayCount !== 1 ? 's' : ''}</span>
                          {req.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[200px]">{req.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      {req.status === 'pending' && (
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" className="text-green-600 h-8" onClick={() => handleApprove(req)}>
                            <Check className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 h-8" onClick={() => handleDecline(req.id)}>
                            <X className="w-4 h-4 mr-1" /> Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* New Request Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>New Leave Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Crew Member *</Label>
                <Select value={form.crew_id} onValueChange={v => setForm({ ...form, crew_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select crew member" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {crewOptions.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Leave Type *</Label>
                <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_STATUS_CODES.map(s => (
                      <SelectItem key={s.code} value={s.code}>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: s.bgColor, border: `1px solid ${s.color}` }} />
                          {s.code} — {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Start Date *</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Date *</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="Additional details..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
