import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CheckCircle2, CircleDashed, HelpCircle, Loader2, Send, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useJoinerReadiness } from '@/modules/hris/hooks/useOnboarding';
import { computeReadinessScore, type ReadinessCheck } from '@/modules/hris/lib/onboarding';

interface JoinerReadinessProps {
  profileId: string;
  crewName: string;
  crewEmail?: string | null;
  canEdit: boolean;
  isOwnRecord: boolean;
  sendingInvitation?: boolean;
  onSendInvitation: (profileId: string, email: string | null) => void;
}

const CheckIcon: React.FC<{ check: ReadinessCheck }> = ({ check }) => {
  if (check.unknown) return <HelpCircle className="h-4 w-4 text-muted-foreground" />;
  if (check.ok) return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
};

/** Read-only stitched checklist of the joiner's HR readiness with deep links to fix gaps. */
export const JoinerReadiness: React.FC<JoinerReadinessProps> = ({ profileId, crewName, crewEmail, canEdit, isOwnRecord, sendingInvitation, onSendInvitation }) => {
  const readiness = useJoinerReadiness(profileId);
  const score = useMemo(() => computeReadinessScore(readiness.checks), [readiness.checks]);
  const missing = readiness.checks.filter((c) => !c.ok && !c.unknown).length;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><CircleDashed className="h-4 w-4 text-primary" /> Joiner readiness</CardTitle>
            <CardDescription>{isOwnRecord ? 'What HR still needs from you before you join.' : `What is still outstanding for ${crewName}, pulled from across HRIS.`}</CardDescription>
          </div>
          {!readiness.isLoading && (
            <div className="text-right">
              <p className={cn('text-2xl font-semibold leading-none tabular-nums', score === 100 ? 'text-green-600 dark:text-green-400' : score < 50 ? 'text-destructive' : 'text-foreground')}>{score}%</p>
              <p className="text-xs text-muted-foreground">{missing === 0 ? 'ready' : `${missing} to resolve`}</p>
            </div>
          )}
        </div>
        {!readiness.isLoading && <Progress value={score} className="h-2" />}
      </CardHeader>
      <CardContent>
        {readiness.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : readiness.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load readiness</AlertTitle>
            <AlertDescription>{readiness.error instanceof Error ? readiness.error.message : 'Unknown error'}</AlertDescription>
          </Alert>
        ) : (
          <ul className="divide-y">
            {readiness.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-3 py-2">
                <CheckIcon check={c} />
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', c.ok ? 'text-foreground' : c.unknown ? 'text-muted-foreground' : 'font-medium text-foreground')}>{c.label}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.detail}</p>
                </div>
                {c.action === 'send_invitation' && canEdit && (
                  <Button size="sm" variant="outline" className="gap-1 shrink-0" disabled={sendingInvitation} onClick={() => onSendInvitation(profileId, crewEmail ?? null)}>
                    {sendingInvitation ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send invitation
                  </Button>
                )}
                {c.link && !c.ok && (canEdit || isOwnRecord) && (
                  <Button asChild size="sm" variant="ghost" className="gap-1 shrink-0 text-xs">
                    <Link to={c.link}>Open <ArrowUpRight className="h-3.5 w-3.5" /></Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

export default JoinerReadiness;
