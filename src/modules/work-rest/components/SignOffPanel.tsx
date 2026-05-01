import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, FileSignature, Lock, Unlock } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useToast } from '@/shared/hooks/use-toast';
import {
  logAudit,
  MonthlySubmission,
  signSubmission,
  updateSubmissionStatus,
} from '../services/workRestService';

type Role = 'crew' | 'hod' | 'captain' | 'purser' | 'dpa';

interface Props {
  submission: MonthlySubmission;
  signatures: any[];
  ncOpenCount: number;
  isCompliant: boolean;
  actorId: string;
  actorRoles: Role[];
  isOwner: boolean;
  onChange: () => void;
}

export const SignOffPanel: React.FC<Props> = ({
  submission,
  signatures,
  ncOpenCount,
  isCompliant,
  actorId,
  actorRoles,
  isOwner,
  onChange,
}) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const sigByRole = (role: Role) => signatures.find((s) => s.signer_role === role);

  const canCrewSign = isOwner && submission.status !== 'locked';
  const canHodSign =
    actorRoles.includes('hod') &&
    submission.status !== 'locked' &&
    submission.status !== 'draft';
  const canCaptainReview = actorRoles.includes('captain') && submission.status !== 'locked';
  const canLock =
    actorRoles.some((r) => ['captain', 'dpa'].includes(r)) &&
    submission.status !== 'locked' &&
    !!sigByRole('hod');

  const canReopen =
    submission.status === 'locked' &&
    actorRoles.some((r) => ['captain', 'dpa'].includes(r));

  const submitForReview = async () => {
    if (submission.status !== 'draft') return;
    setBusy(true);
    try {
      await updateSubmissionStatus(submission.id, 'submitted', {
        submitted_at: new Date().toISOString(),
      });
      await logAudit({
        submissionId: submission.id,
        crewId: submission.crew_id,
        actorId,
        action: 'submitted',
      });
      toast({ title: 'Submitted for review' });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const sign = async (role: Role, nextStatus: MonthlySubmission['status'], signedAtField: string) => {
    setBusy(true);
    try {
      await signSubmission({ submissionId: submission.id, signerId: actorId, signerRole: role });
      await updateSubmissionStatus(submission.id, nextStatus, {
        [signedAtField]: new Date().toISOString(),
      } as any);
      await logAudit({
        submissionId: submission.id,
        crewId: submission.crew_id,
        actorId,
        actorRole: role,
        action: `signed_${role}`,
      });
      toast({ title: `Signed as ${role}` });
      onChange();
    } catch (e) {
      toast({
        title: 'Signing failed',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const lockNow = async () => {
    setBusy(true);
    try {
      await updateSubmissionStatus(submission.id, 'locked', {
        locked_at: new Date().toISOString(),
      });
      await logAudit({
        submissionId: submission.id,
        crewId: submission.crew_id,
        actorId,
        action: 'locked',
      });
      toast({ title: 'Submission locked' });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    const reason = prompt('Reason for reopening (auditable):');
    if (!reason) return;
    setBusy(true);
    try {
      await updateSubmissionStatus(submission.id, 'reopened', {
        reopened_at: new Date().toISOString(),
        reopened_by: actorId,
        reopen_reason: reason,
      });
      await logAudit({
        submissionId: submission.id,
        crewId: submission.crew_id,
        actorId,
        action: 'reopened',
        metadata: { reason },
      });
      toast({ title: 'Submission reopened' });
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileSignature className="h-5 w-5" />
          Sign-off & workflow
          <Badge variant="outline" className="ml-auto uppercase">
            {submission.status.replace('_', ' ')}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SignatureRow label="Crew" sig={sigByRole('crew')} />
        <SignatureRow label="Head of Department" sig={sigByRole('hod')} />
        <SignatureRow label="Captain" sig={sigByRole('captain')} />

        {ncOpenCount > 0 && submission.status === 'draft' && (
          <p className="text-xs text-warning">
            Note: {ncOpenCount} open non-conformity(ies). You may still submit, but
            justifications will be required during review.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          {submission.status === 'draft' && isOwner && (
            <Button onClick={submitForReview} disabled={busy}>
              Submit monthly record
            </Button>
          )}
          {canCrewSign && !sigByRole('crew') && (
            <Button
              onClick={() => sign('crew', 'crew_signed', 'crew_signed_at')}
              disabled={busy || submission.status === 'draft'}
            >
              Sign as crew
            </Button>
          )}
          {canHodSign && !sigByRole('hod') && (
            <Button
              variant="secondary"
              onClick={() => sign('hod', 'hod_signed', 'hod_signed_at')}
              disabled={busy}
            >
              Sign as HoD
            </Button>
          )}
          {canCaptainReview && !sigByRole('captain') && (
            <Button
              variant="secondary"
              onClick={() => sign('captain', 'captain_reviewed', 'captain_reviewed_at')}
              disabled={busy}
            >
              Captain review
            </Button>
          )}
          {canLock && (
            <Button variant="default" onClick={lockNow} disabled={busy}>
              <Lock className="h-4 w-4 mr-1" /> Lock
            </Button>
          )}
          {canReopen && (
            <Button variant="outline" onClick={reopen} disabled={busy}>
              <Unlock className="h-4 w-4 mr-1" /> Reopen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

const SignatureRow: React.FC<{ label: string; sig: any }> = ({ label, sig }) => (
  <div className="flex items-center justify-between border rounded p-2">
    <span className="text-sm font-medium">{label}</span>
    {sig ? (
      <span className="text-xs text-success flex items-center gap-1">
        <CheckCircle2 className="h-4 w-4" />
        {sig.profiles?.first_name} {sig.profiles?.last_name} ·{' '}
        {format(parseISO(sig.signed_at), 'd MMM yyyy HH:mm')}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">Pending</span>
    )}
  </div>
);
