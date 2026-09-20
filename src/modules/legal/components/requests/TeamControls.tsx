import React, { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLegalTeam } from '@/modules/legal/hooks/useLegalLookups';
import { PRIORITIES, RISK_LEVELS, STATUSES, statusDef, type LegalPriority, type LegalRisk, type LegalStatus } from '@/modules/legal/lib/constants';
import type { LegalRequestRow } from '@/modules/legal/lib/requests';
import { PeopleSelect } from './PeopleSelect';

export interface TeamChange {
  patch: Partial<Pick<LegalRequestRow, 'status' | 'risk_level' | 'priority' | 'assigned_to' | 'resolution_summary'>>;
  /** Auto-logged comment describing the change (status_change / assignment). */
  log?: { content: string; comment_type: 'status_change' | 'assignment'; metadata: Record<string, string | null> };
}

interface TeamControlsProps {
  request: LegalRequestRow;
  onChange: (change: TeamChange) => Promise<void>;
  isPending?: boolean;
}

/** Legal-team-only controls: status, risk, priority, assignment, resolution. */
export const TeamControls: React.FC<TeamControlsProps> = ({ request, onChange, isPending }) => {
  const { members, isLoading: teamLoading } = useLegalTeam();
  const [resolution, setResolution] = useState(request.resolution_summary ?? '');
  useEffect(() => setResolution(request.resolution_summary ?? ''), [request.resolution_summary, request.id]);

  const teamOptions = useMemo(
    () => members.map((m) => ({ ...m, key: m.user_id, subtitle: m.rank ?? m.position ?? null, badge: m.level === 'admin' ? 'admin' : null })),
    [members],
  );
  const memberName = (userId: string | null) => teamOptions.find((m) => m.key === userId)?.displayName ?? (userId ? 'a team member' : 'no one');

  const setStatus = (status: LegalStatus) => {
    if (status === request.status) return;
    void onChange({
      patch: { status },
      log: { content: `Status changed from ${statusDef(request.status).label} to ${statusDef(status).label}`, comment_type: 'status_change', metadata: { from: request.status, to: status } },
    });
  };
  const setRisk = (risk_level: LegalRisk) => void onChange({ patch: { risk_level } });
  const setPriority = (priority: LegalPriority) => void onChange({ patch: { priority } });
  const setAssignee = (assigned_to: string | null) => {
    if (assigned_to === request.assigned_to) return;
    void onChange({
      patch: { assigned_to },
      log: { content: assigned_to ? `Assigned to ${memberName(assigned_to)}` : 'Assignment cleared', comment_type: 'assignment', metadata: { from: request.assigned_to, to: assigned_to } },
    });
  };
  const saveResolution = () => void onChange({ patch: { resolution_summary: resolution.trim() || null } });
  const closed = request.status === 'completed' || request.status === 'cancelled';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Legal team</CardTitle>
        <CardDescription>Changes are logged in the thread and the audit trail.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={request.status} onValueChange={(v) => setStatus(v as LegalStatus)} disabled={isPending}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Risk</Label>
            <Select value={request.risk_level ?? 'medium'} onValueChange={(v) => setRisk(v as LegalRisk)} disabled={isPending}>
              <SelectTrigger aria-label="Risk level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RISK_LEVELS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={request.priority} onValueChange={(v) => setPriority(v as LegalPriority)} disabled={isPending || closed}>
              <SelectTrigger aria-label="Priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label} · {p.slaLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Changing priority recalculates the SLA from the submission time.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Assigned to</Label>
          <PeopleSelect value={request.assigned_to} options={teamOptions} onChange={(key) => setAssignee(key)} placeholder="Unassigned" isLoading={teamLoading} disabled={isPending} emptyText="No legal team members found. Grant the Legal Counsel role in Roles & Permissions." />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="legal-resolution">Resolution summary</Label>
          <Textarea id="legal-resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} rows={4} placeholder="Outcome, advice given, documents issued." disabled={isPending} />
          <div className="flex justify-end">
            <Button size="sm" onClick={saveResolution} disabled={isPending || resolution.trim() === (request.resolution_summary ?? '').trim()}>
              <Save className="mr-2 h-4 w-4" /> Save summary
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamControls;
