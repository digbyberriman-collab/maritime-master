import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { updateNonConformity } from '../services/workRestService';
import { useToast } from '@/shared/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { logAudit } from '../services/workRestService';

interface Props {
  ncs: any[];
  onRefresh: () => void;
  canReview: boolean;
  actorId: string;
  actorRole?: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-info/15 text-info border-info/40',
  medium: 'bg-warning/15 text-warning border-warning/40',
  high: 'bg-orange/15 text-orange border-orange/40',
  critical: 'bg-destructive/15 text-destructive border-destructive/40',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'justified', label: 'Justified' },
  { value: 'corrected', label: 'Corrected' },
  { value: 'accepted_by_captain', label: 'Accepted (Captain)' },
  { value: 'dismissed', label: 'Dismissed' },
];

export const NonConformityList: React.FC<Props> = ({
  ncs,
  onRefresh,
  canReview,
  actorId,
  actorRole,
}) => {
  const { toast } = useToast();
  const [editing, setEditing] = useState<Record<string, { status?: string; justification?: string }>>({});

  const save = async (n: any) => {
    const patch = editing[n.id] || {};
    try {
      await updateNonConformity(n.id, {
        ...patch,
        reviewer_id: actorId,
        reviewed_at: new Date().toISOString(),
      });
      await logAudit({
        submissionId: n.submission_id,
        crewId: n.crew_id,
        actorId,
        actorRole,
        action: 'nc_reviewed',
        entityType: 'work_rest_non_conformity',
        entityId: n.id,
        oldValue: { status: n.status, justification: n.justification },
        newValue: patch,
      });
      toast({ title: 'Non-conformity updated' });
      onRefresh();
    } catch (e) {
      toast({
        title: 'Update failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    }
  };

  if (!ncs.length) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground flex items-center gap-2">
          <Badge className="bg-success/15 text-success border-success/40">All clear</Badge>
          No non-conformities for this period.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Non-conformities ({ncs.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {ncs.map((n) => (
          <div
            key={n.id}
            className="border rounded p-3 space-y-2 bg-muted/30"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge className={SEVERITY_STYLES[n.severity] || ''}>
                  {n.severity}
                </Badge>
                <span className="font-medium text-sm">{n.rule_description}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {format(parseISO(n.window_start), 'd MMM HH:mm')} →{' '}
                {format(parseISO(n.window_end), 'd MMM HH:mm')}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Measured: <strong>{n.measured_value}</strong> · Threshold:{' '}
              <strong>{n.threshold_value}</strong>
              {n.suggested_correction && (
                <> · Suggested: {n.suggested_correction}</>
              )}
            </div>
            {canReview ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={editing[n.id]?.status ?? n.status}
                    onValueChange={(v) =>
                      setEditing((s) => ({ ...s, [n.id]: { ...s[n.id], status: v } }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Justification / notes</Label>
                  <Textarea
                    rows={2}
                    defaultValue={n.justification ?? ''}
                    onBlur={(e) =>
                      setEditing((s) => ({
                        ...s,
                        [n.id]: { ...s[n.id], justification: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="md:col-span-2 flex justify-end">
                  <Button size="sm" onClick={() => save(n)}>
                    Save review
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{n.status}</Badge>
                {n.justification && (
                  <span className="text-muted-foreground">{n.justification}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
