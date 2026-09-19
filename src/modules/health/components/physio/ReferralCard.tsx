import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToneBadge } from '@/modules/health/components/physio/PhysioBadges';
import {
  disciplineName,
  referralStatusLabel,
  type ReferralEntry,
} from '@/modules/health/hooks/useReferrals';
import { SEVERITY_TONE, formatDateTime } from '@/modules/health/lib/format';

interface ReferralCardProps {
  referral: ReferralEntry;
  direction: 'incoming' | 'outgoing';
  canEdit: boolean;
  authorName?: string | null;
  onRespond?: (referral: ReferralEntry) => void;
  onCancel?: (referral: ReferralEntry) => void;
}

const statusTone = (status: string): 'good' | 'warning' | 'critical' | 'default' => {
  if (status === 'completed') return 'good';
  if (status === 'declined' || status === 'cancelled') return 'critical';
  if (status === 'accepted') return 'warning';
  return 'default';
};

const urgencyLabel: Record<string, string> = {
  routine: 'Routine',
  soon: 'Soon',
  urgent: 'Urgent',
  emergency: 'Emergency',
};

/** One referral in or out of physiotherapy, with what was asked and answered. */
export const ReferralCard: React.FC<ReferralCardProps> = ({
  referral,
  direction,
  canEdit,
  authorName,
  onRespond,
  onCancel,
}) => {
  const pressing = referral.urgency === 'urgent' || referral.urgency === 'emergency';
  const isOpen = referral.status === 'open' || referral.status === 'accepted';

  return (
    <li
      className={cn(
        'rounded-lg border bg-card p-4',
        pressing && isOpen && 'border-destructive/50 bg-destructive/5',
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {referral.person_name ?? 'Unknown person'}
            </span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {disciplineName(referral.from_discipline)}
              <ArrowRight className="h-3 w-3" />
              {disciplineName(referral.to_discipline)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <ToneBadge tone={SEVERITY_TONE[referral.urgency] ?? 'default'}>
              {pressing && <AlertTriangle className="mr-1 h-3 w-3" />}
              {urgencyLabel[referral.urgency] ?? referral.urgency}
            </ToneBadge>
            <ToneBadge tone={statusTone(referral.status)}>
              {referralStatusLabel(referral.status)}
            </ToneBadge>
          </div>

          <p className="whitespace-pre-line text-sm text-foreground">{referral.reason}</p>

          {/* Only medical referrals carry clinical background, so it is
              rendered when it exists rather than as an empty labelled block. */}
          {referral.clinical_notes && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5" />
                Clinical background
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {referral.clinical_notes}
              </p>
            </div>
          )}

          {(referral.response_notes || referral.outcome) && (
            <div className="rounded-md border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">Response</p>
              {referral.response_notes && (
                <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                  {referral.response_notes}
                </p>
              )}
              {referral.outcome && (
                <p className="mt-1 text-sm text-muted-foreground">Outcome: {referral.outcome}</p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Raised {formatDateTime(referral.created_at)}
            {authorName ? ` by ${authorName}` : ''}
            {referral.practitioner_name ? ` · assigned to ${referral.practitioner_name}` : ''}
            {referral.responded_at ? ` · answered ${formatDateTime(referral.responded_at)}` : ''}
          </p>
        </div>

        {canEdit && isOpen && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {direction === 'incoming' && onRespond && (
              <Button size="sm" onClick={() => onRespond(referral)}>
                Respond
              </Button>
            )}
            {direction === 'outgoing' && onCancel && (
              <Button variant="outline" size="sm" onClick={() => onCancel(referral)}>
                Cancel referral
              </Button>
            )}
          </div>
        )}
      </div>
    </li>
  );
};

export default ReferralCard;
