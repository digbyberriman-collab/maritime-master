import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Plus, Send } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import { StatGrid, StatTile } from '@/modules/health/components/StatTile';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { ReferralCard } from '@/modules/health/components/physio/ReferralCard';
import {
  RaiseReferralDialog,
  RespondToReferralDialog,
} from '@/modules/health/components/physio/ReferralDialogs';
import {
  REFERRAL_STATUSES,
  URGENCIES,
  useReferrals,
  type ReferralEntry,
} from '@/modules/health/hooks/useReferrals';
import { usePhysioAccess, useProfileNames } from '@/modules/health/hooks/usePhysio';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';

const ALL = '__all__';

/**
 * Referrals in and out of physiotherapy. Incoming work is what the physio has
 * been asked to pick up; outgoing is what they have passed on, most often to
 * the medic when an assessment turns up something clinical.
 */
const ReferralsPage: React.FC = () => {
  const access = usePhysioAccess();
  const { personId, setPersonId, myPerson, selfOnly } = useSelectedPerson('wellness');

  const [urgencyFilter, setUrgencyFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [responding, setResponding] = useState<ReferralEntry | null>(null);

  // Physiotherapy records are clinical: without physio view access a reader
  // only ever sees referrals about themselves.
  const restrictedToSelf = !access.loading && (!access.canView || selfOnly);
  const effectivePersonId = restrictedToSelf ? myPerson?.id ?? null : personId;

  const query = useReferrals({ personId: effectivePersonId });
  const { byUserId } = useProfileNames(query.referrals.map((r) => r.referred_by));

  const filtered = useMemo(
    () =>
      query.referrals.filter(
        (r) =>
          (urgencyFilter === ALL || r.urgency === urgencyFilter) &&
          (statusFilter === ALL || r.status === statusFilter),
      ),
    [query.referrals, urgencyFilter, statusFilter],
  );

  const incoming = useMemo(
    () => filtered.filter((r) => r.to_discipline === 'physio'),
    [filtered],
  );
  const outgoing = useMemo(
    () => filtered.filter((r) => r.from_discipline === 'physio'),
    [filtered],
  );

  const pressing = useMemo(
    () =>
      incoming.filter(
        (r) =>
          (r.urgency === 'urgent' || r.urgency === 'emergency') &&
          (r.status === 'open' || r.status === 'accepted'),
      ),
    [incoming],
  );

  const stats = useMemo(() => {
    const openIncoming = incoming.filter((r) => r.status === 'open').length;
    const openOutgoing = outgoing.filter((r) => r.status === 'open').length;
    const completed = [...incoming, ...outgoing].filter((r) => r.status === 'completed').length;
    return { openIncoming, openOutgoing, completed };
  }, [incoming, outgoing]);

  if (restrictedToSelf && !access.loading && !myPerson) {
    return (
      <div className="space-y-6">
        <HealthPageHeader
          icon={Send}
          title="Physiotherapy referrals"
          description="Work sent to physiotherapy and passed on from it."
        />
        <NoSubjectRecord />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Send}
        title="Physiotherapy referrals"
        description={
          restrictedToSelf
            ? 'Referrals about you, read-only.'
            : 'What has been sent to physiotherapy, and what physiotherapy has passed on.'
        }
        actions={
          access.canEdit ? (
            <Button size="sm" onClick={() => setRaiseOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Raise a referral
            </Button>
          ) : undefined
        }
        toolbar={
          <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-3xl">
            {!restrictedToSelf && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Person</Label>
                <PersonPicker value={personId} onChange={(id) => setPersonId(id)} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Urgency</Label>
              <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any urgency</SelectItem>
                  {URGENCIES.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any status</SelectItem>
                  {REFERRAL_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
      />

      <StatGrid>
        <StatTile
          icon={ArrowDownLeft}
          label="Incoming open"
          value={query.isLoading ? null : stats.openIncoming}
          hint="Waiting on physiotherapy"
          tone={stats.openIncoming > 0 ? 'warning' : 'good'}
        />
        <StatTile
          icon={ArrowUpRight}
          label="Outgoing open"
          value={query.isLoading ? null : stats.openOutgoing}
          hint="Waiting on someone else"
        />
        <StatTile
          icon={AlertTriangle}
          label="Urgent or emergency"
          value={query.isLoading ? null : pressing.length}
          hint="Incoming and still open"
          tone={pressing.length > 0 ? 'critical' : 'good'}
        />
        <StatTile
          icon={CheckCircle2}
          label="Completed"
          value={query.isLoading ? null : stats.completed}
          tone="good"
        />
      </StatGrid>

      {pressing.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {pressing.length} urgent referral{pressing.length === 1 ? '' : 's'} waiting
          </AlertTitle>
          <AlertDescription>
            {pressing
              .slice(0, 3)
              .map((r) => r.person_name ?? 'Unknown person')
              .join(', ')}
            . Answer these before the routine list.
          </AlertDescription>
        </Alert>
      )}

      {query.isLoading || access.loading ? (
        <HealthLoading rows={4} />
      ) : query.isError ? (
        <HealthError title="Could not load referrals" error={query.error} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Incoming ({incoming.length})</CardTitle>
              <CardDescription>Sent to physiotherapy by another discipline.</CardDescription>
            </CardHeader>
            <CardContent>
              {incoming.length === 0 ? (
                <HealthEmpty
                  icon={ArrowDownLeft}
                  title="Nothing waiting"
                  description="Nobody has referred anyone to physiotherapy under these filters. Clear the urgency and status filters to see the whole history."
                  className="p-6"
                />
              ) : (
                <ul className="space-y-3">
                  {incoming.map((referral) => (
                    <ReferralCard
                      key={referral.id}
                      referral={referral}
                      direction="incoming"
                      canEdit={access.canEdit}
                      authorName={referral.referred_by ? byUserId.get(referral.referred_by) : null}
                      onRespond={setResponding}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Outgoing ({outgoing.length})</CardTitle>
              <CardDescription>Raised by physiotherapy and passed on.</CardDescription>
            </CardHeader>
            <CardContent>
              {outgoing.length === 0 ? (
                <HealthEmpty
                  icon={ArrowUpRight}
                  title="Nothing passed on"
                  description={
                    access.canEdit
                      ? 'Raise a referral when an assessment needs a medic, a trainer, a nutritionist or a shoreside clinic.'
                      : 'Physiotherapy has not referred anyone on under these filters.'
                  }
                  action={
                    access.canEdit ? (
                      <Button size="sm" onClick={() => setRaiseOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Raise a referral
                      </Button>
                    ) : undefined
                  }
                  className="p-6"
                />
              ) : (
                <ul className="space-y-3">
                  {outgoing.map((referral) => (
                    <ReferralCard
                      key={referral.id}
                      referral={referral}
                      direction="outgoing"
                      canEdit={access.canEdit}
                      authorName={referral.referred_by ? byUserId.get(referral.referred_by) : null}
                      onCancel={(r) => query.respond.mutate({ id: r.id, status: 'cancelled' })}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <RaiseReferralDialog
        open={raiseOpen}
        onOpenChange={setRaiseOpen}
        defaultPersonId={effectivePersonId}
        lockPerson={restrictedToSelf}
      />

      <RespondToReferralDialog
        open={Boolean(responding)}
        onOpenChange={(next) => !next && setResponding(null)}
        referral={responding}
        isPending={query.respond.isPending}
        onRespond={async (input) => {
          await query.respond.mutateAsync(input);
          setResponding(null);
        }}
      />
    </div>
  );
};

export default ReferralsPage;
