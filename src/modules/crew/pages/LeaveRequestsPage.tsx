import { useState, useEffect, useCallback, useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';
import {
  LEAVE_STATUS_CODES, STATUS_CODE_MAP, type CrewLeaveRequest,
} from '@/modules/crew/leaveConstants';
import {
  CalendarDays, Plus, Search, Check, X, Loader2, ArrowLeft,
  Ban, Download, AlertTriangle,
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
import { logLeaveAudit } from '@/modules/crew/services/leaveAudit';
import { overlapsAny } from '@/modules/crew/services/leaveCalculator';

const statusBadgeColors: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
  draft: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-800',
};

interface CrewOption {
  user_id: string;
  label: string;
  position: string;
  department: string;
  vessel_id: string | null;
  vessel_name: string | null;
}

const APPROVE_ROLES = ['dpa', 'shore_management', 'master', 'chief_engineer', 'chief_officer'];

const csvEscape = (v: any): string => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

export default function LeaveRequestsPage() {
  const { profile, user } = useAuth();
  const { selectedVessel, isAllVessels } = useVessel();
  const companyId = profile?.company_id;
  const navigate = useNavigate();

  const canApprove = APPROVE_ROLES.includes(profile?.role || '');
  const actor = user && profile ? { user_id: user.id, email: profile.email, role: profile.role } : null;

  const [requests, setRequests] = useState<(CrewLeaveRequest & {
    crewName?: string;
    crewPosition?: string;
    crewDepartment?: string;
    vesselName?: string;
    cancellation_reason?: string | null;
  })[]>([]);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CrewLeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [declineTarget, setDeclineTarget] = useState<CrewLeaveRequest | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const [form, setForm] = useState({
    crew_id: '',
    leave_type: '',
    start_date: '',
    end_date: '',
    notes: '',
  });

  const loadCrewOptions = useCallback(async () => {
    if (!companyId) return;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name, rank, department, position, status, imported_vessel_id, is_imported')
      .eq('company_id', companyId);

    const userIds = (profiles ?? []).map((p) => p.user_id).filter((id): id is string => !!id);
    let assignments: any[] = [];
    if (userIds.length > 0) {
      const { data } = await supabase
        .from('crew_assignments')
        .select('user_id, vessel_id, position, vessels:vessel_id (id, name)')
        .in('user_id', userIds)
        .eq('is_current', true);
      assignments = data ?? [];
    }
    const vesselIds = (profiles ?? [])
      .filter((p: any) => p.is_imported && p.imported_vessel_id)
      .map((p: any) => p.imported_vessel_id as string);
    let vesselMap: Record<string, string> = {};
    if (vesselIds.length > 0) {
      const { data: vesselsData } = await supabase
        .from('vessels')
        .select('id, name')
        .in('id', Array.from(new Set(vesselIds)));
      vesselMap = Object.fromEntries((vesselsData ?? []).map((v) => [v.id, v.name]));
    }

    const list: CrewOption[] = (profiles ?? [])
      .filter((p: any) => !!p.user_id)
      .map((p: any) => {
        const a = assignments.find((x) => x.user_id === p.user_id);
        const vesselId = a?.vessel_id ?? p.imported_vessel_id ?? null;
        const vesselName = (a?.vessels as any)?.name ?? (p.imported_vessel_id ? vesselMap[p.imported_vessel_id] : null) ?? null;
        return {
          user_id: p.user_id,
          label: `${p.last_name}, ${p.first_name} — ${a?.position ?? p.position ?? p.rank ?? 'Crew'}`,
          position: a?.position ?? p.position ?? p.rank ?? 'Crew',
          department: p.department ?? '',
          vessel_id: vesselId,
          vessel_name: vesselName,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
    setCrewOptions(list);
  }, [companyId]);

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    let query = supabase
      .from('crew_leave_requests')
      .select('*')
      .eq('company_id', companyId)
      .order('submitted_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data } = await query;
    const rows = (data ?? []) as any[];

    const userIds = Array.from(new Set(rows.map((r) => r.crew_id).filter(Boolean)));
    let profileMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name, rank, department, position')
        .in('user_id', userIds);
      profileMap = Object.fromEntries((profs ?? []).map((p) => [p.user_id, p]));
    }
    const vIds = Array.from(new Set(rows.map((r) => r.vessel_id).filter(Boolean)));
    let vesselMap: Record<string, string> = {};
    if (vIds.length > 0) {
      const { data: vs } = await supabase.from('vessels').select('id, name').in('id', vIds);
      vesselMap = Object.fromEntries((vs ?? []).map((v) => [v.id, v.name]));
    }

    const enriched = rows.map((r) => {
      const p = profileMap[r.crew_id];
      return {
        ...r,
        crewName: p ? `${p.last_name}, ${p.first_name}` : r.crew_id,
        crewPosition: p?.position ?? p?.rank ?? '',
        crewDepartment: p?.department ?? '',
        vesselName: r.vessel_id ? vesselMap[r.vessel_id] ?? null : null,
      };
    });

    setRequests(enriched);
    setLoading(false);
  }, [companyId, statusFilter]);

  useEffect(() => { loadCrewOptions(); }, [loadCrewOptions]);
  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleSubmit = async () => {
    if (!form.crew_id || !form.leave_type || !form.start_date || !form.end_date || !companyId) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error('End date cannot be before start date.');
      return;
    }
    const overlaps = overlapsAny(
      form.start_date,
      form.end_date,
      requests
        .filter((r) => r.crew_id === form.crew_id && ['pending', 'approved'].includes(r.status))
        .map((r) => ({ start_date: r.start_date, end_date: r.end_date })),
    );
    if (overlaps) {
      toast.warning('This date range overlaps an existing pending/approved request. Submitting anyway — please review.');
    }

    const crewOption = crewOptions.find((c) => c.user_id === form.crew_id);
    const vesselId = crewOption?.vessel_id ?? selectedVessel?.id ?? null;

    const { data, error } = await supabase
      .from('crew_leave_requests')
      .insert({
        crew_id: form.crew_id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || null,
        status: 'pending',
        company_id: companyId,
        vessel_id: vesselId,
      })
      .select()
      .single();

    if (error) {
      console.error('[leave-requests] insert failed:', error);
      toast.error(`Failed to submit request: ${error.message}`);
      return;
    }

    if (data && actor) {
      await logLeaveAudit({
        entityType: 'leave_request',
        entityId: (data as any).id,
        action: 'SUBMIT',
        actor,
        crewId: form.crew_id,
        vesselId,
        newValues: {
          leave_type: form.leave_type,
          start_date: form.start_date,
          end_date: form.end_date,
          notes: form.notes,
        },
      });
    }

    toast.success('Leave request submitted');
    setDialogOpen(false);
    setForm({ crew_id: '', leave_type: '', start_date: '', end_date: '', notes: '' });
    loadRequests();
  };

  const handleApprove = async (req: CrewLeaveRequest) => {
    if (!companyId || !canApprove) return;

    const days = eachDayOfInterval({ start: new Date(req.start_date), end: new Date(req.end_date) });

    const { data: lockedMonths } = await supabase
      .from('crew_leave_locked_months')
      .select('month, year')
      .eq('company_id', companyId);
    const lockedSet = new Set((lockedMonths || []).map((lm: any) => `${lm.year}-${lm.month}`));

    let skippedCount = 0;
    const inserts = days.filter((d) => {
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
      if (lockedSet.has(key)) { skippedCount++; return false; }
      return true;
    }).map((d) => ({
      crew_id: req.crew_id,
      date: format(d, 'yyyy-MM-dd'),
      status_code: req.leave_type,
      company_id: companyId,
      vessel_id: req.vessel_id ?? null,
    }));

    // Replace existing entries in range
    const dateList = inserts.map((i) => i.date);
    if (dateList.length > 0) {
      await supabase
        .from('crew_leave_entries')
        .delete()
        .eq('crew_id', req.crew_id)
        .in('date', dateList);
      const { error: insertErr } = await supabase.from('crew_leave_entries').insert(inserts);
      if (insertErr) {
        toast.error(`Failed to apply leave to calendar: ${insertErr.message}`);
        return;
      }
    }

    const { error } = await supabase.from('crew_leave_requests').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
    }).eq('id', req.id);

    if (error) {
      toast.error(`Approval failed: ${error.message}`);
      return;
    }

    if (actor) {
      await logLeaveAudit({
        entityType: 'leave_request',
        entityId: req.id,
        action: 'APPROVE',
        actor,
        crewId: req.crew_id,
        vesselId: req.vessel_id ?? null,
        oldValues: { status: req.status },
        newValues: { status: 'approved', applied_days: inserts.length, skipped_days: skippedCount },
      });
    }

    if (skippedCount > 0) {
      toast.warning(`Approved. ${skippedCount} days in locked months were skipped.`);
    } else {
      toast.success(`Approved. ${inserts.length} days applied to calendar.`);
    }
    loadRequests();
  };

  const handleDecline = async () => {
    if (!declineTarget || !canApprove) return;
    const { error } = await supabase.from('crew_leave_requests').update({
      status: 'declined',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
      cancellation_reason: declineReason || null,
    }).eq('id', declineTarget.id);

    if (error) {
      toast.error(`Decline failed: ${error.message}`);
      return;
    }
    if (actor) {
      await logLeaveAudit({
        entityType: 'leave_request',
        entityId: declineTarget.id,
        action: 'DECLINE',
        actor,
        crewId: declineTarget.crew_id,
        vesselId: declineTarget.vessel_id ?? null,
        oldValues: { status: declineTarget.status },
        newValues: { status: 'declined' },
        note: declineReason || undefined,
      });
    }
    toast.success('Request declined');
    setDeclineTarget(null);
    setDeclineReason('');
    loadRequests();
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const owner = cancelTarget.crew_id === user?.id;
    if (!owner && !canApprove) {
      toast.error('You do not have permission to cancel this request.');
      return;
    }

    // Reverse calendar entries created when the request was approved.
    let reversedDays = 0;
    if (cancelTarget.status === 'approved') {
      const { data: existing } = await supabase
        .from('crew_leave_entries')
        .select('id, date, status_code')
        .eq('crew_id', cancelTarget.crew_id)
        .eq('status_code', cancelTarget.leave_type)
        .gte('date', cancelTarget.start_date)
        .lte('date', cancelTarget.end_date);
      if (existing && existing.length > 0) {
        const ids = existing.map((e: any) => e.id);
        await supabase.from('crew_leave_entries').delete().in('id', ids);
        reversedDays = existing.length;
      }
    }

    const { error } = await supabase.from('crew_leave_requests').update({
      status: 'cancelled',
      cancellation_reason: cancelReason || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user?.id || null,
    }).eq('id', cancelTarget.id);

    if (error) {
      toast.error(`Cancellation failed: ${error.message}`);
      return;
    }

    if (actor) {
      await logLeaveAudit({
        entityType: 'leave_request',
        entityId: cancelTarget.id,
        action: 'CANCEL',
        actor,
        crewId: cancelTarget.crew_id,
        vesselId: cancelTarget.vessel_id ?? null,
        oldValues: { status: cancelTarget.status },
        newValues: { status: 'cancelled', reversed_calendar_days: reversedDays },
        note: cancelReason || undefined,
      });
    }

    toast.success(reversedDays > 0
      ? `Cancelled. ${reversedDays} calendar entries reversed.`
      : 'Request cancelled.');
    setCancelTarget(null);
    setCancelReason('');
    loadRequests();
  };

  const filtered = useMemo(() => {
    let result = requests;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r) =>
        r.crewName?.toLowerCase().includes(s) ||
        r.crewPosition?.toLowerCase().includes(s) ||
        r.vesselName?.toLowerCase().includes(s),
      );
    }
    if (selectedVessel?.id && !isAllVessels) {
      result = result.filter((r) => r.vessel_id === selectedVessel.id);
    }
    return result;
  }, [requests, search, selectedVessel?.id, isAllVessels]);

  const counts = useMemo(() => ({
    all: filtered.length,
    pending: filtered.filter((r) => r.status === 'pending').length,
    approved: filtered.filter((r) => r.status === 'approved').length,
    declined: filtered.filter((r) => r.status === 'declined').length,
    cancelled: filtered.filter((r) => r.status === 'cancelled').length,
  }), [filtered]);

  const exportCsv = () => {
    const header = [
      'Crew', 'Vessel', 'Department', 'Position', 'Leave Type',
      'Start', 'End', 'Days', 'Status', 'Submitted', 'Reviewed', 'Notes',
    ];
    const lines = [header.map(csvEscape).join(',')];
    filtered.forEach((r) => {
      const days = differenceInDays(new Date(r.end_date), new Date(r.start_date)) + 1;
      lines.push([
        r.crewName ?? '',
        r.vesselName ?? '',
        r.crewDepartment ?? '',
        r.crewPosition ?? '',
        r.leave_type,
        r.start_date,
        r.end_date,
        days,
        r.status,
        r.submitted_at,
        r.reviewed_at ?? '',
        r.notes ?? '',
      ].map(csvEscape).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `leave-requests-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
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
              <p className="text-sm text-muted-foreground">
                Submit & review leave requests
                {selectedVessel && !isAllVessels && ` — ${selectedVessel.name}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> CSV
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              New Request
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'pending', 'approved', 'declined', 'cancelled'] as const).map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-8"
              onClick={() => setStatusFilter(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
              <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">{counts[s]}</Badge>
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
            {filtered.map((req) => {
              const codeInfo = STATUS_CODE_MAP[req.leave_type];
              const dayCount = differenceInDays(new Date(req.end_date), new Date(req.start_date)) + 1;
              const owner = req.crew_id === user?.id;
              const canCancel = (owner || canApprove) && ['pending', 'approved'].includes(req.status);
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
                          {req.vesselName && (
                            <span className="text-xs text-muted-foreground">· {req.vesselName}</span>
                          )}
                          <Badge className={statusBadgeColors[req.status] || ''}>{req.status}</Badge>
                          {codeInfo && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: codeInfo.bgColor, color: codeInfo.color }}
                            >
                              {codeInfo.code} — {codeInfo.label}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span>{format(new Date(req.start_date), 'MMM d')} — {format(new Date(req.end_date), 'MMM d, yyyy')}</span>
                          <span>•</span>
                          <span>{dayCount} day{dayCount !== 1 ? 's' : ''}</span>
                          {req.notes && (
                            <>
                              <span>•</span>
                              <span className="truncate max-w-[200px]" title={req.notes ?? ''}>{req.notes}</span>
                            </>
                          )}
                          {req.cancellation_reason && (
                            <>
                              <span>•</span>
                              <span className="text-red-700">Reason: {req.cancellation_reason}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {req.status === 'pending' && canApprove && (
                          <>
                            <Button size="sm" variant="outline" className="text-green-600 h-8" onClick={() => handleApprove(req)}>
                              <Check className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 h-8" onClick={() => setDeclineTarget(req)}>
                              <X className="w-4 h-4 mr-1" /> Decline
                            </Button>
                          </>
                        )}
                        {canCancel && (
                          <Button size="sm" variant="outline" className="h-8 text-muted-foreground" onClick={() => setCancelTarget(req)}>
                            <Ban className="w-4 h-4 mr-1" /> Cancel
                          </Button>
                        )}
                      </div>
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
                <Select value={form.crew_id} onValueChange={(v) => setForm({ ...form, crew_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select crew member" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {crewOptions.length === 0 && (
                      <div className="text-xs text-muted-foreground p-2 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> No crew profiles available.
                      </div>
                    )}
                    {crewOptions.map((c) => (
                      <SelectItem key={c.user_id} value={c.user_id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Leave Type *</Label>
                <Select value={form.leave_type} onValueChange={(v) => setForm({ ...form, leave_type: v })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_STATUS_CODES.map((s) => (
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
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">End Date *</Label>
                  <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  placeholder="Additional details..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
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

        {/* Cancel dialog */}
        <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Cancel Leave Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                {cancelTarget?.status === 'approved'
                  ? 'This will reverse calendar entries already applied for this request.'
                  : 'This will mark the request as cancelled.'}
              </p>
              <Textarea
                placeholder="Reason for cancellation"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelTarget(null)}>Back</Button>
              <Button variant="destructive" onClick={handleCancel}>Confirm Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Decline dialog */}
        <Dialog open={!!declineTarget} onOpenChange={(open) => !open && setDeclineTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Decline Leave Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Textarea
                placeholder="Reason for decline (optional, recommended)"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineTarget(null)}>Back</Button>
              <Button variant="destructive" onClick={handleDecline}>Decline Request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
