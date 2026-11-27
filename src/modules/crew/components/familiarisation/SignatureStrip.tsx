import React from 'react';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { notify } from '@/shared/lib/notify';
import { actionHint } from '@/modules/crew/lib/familiarisation';
import {
  familiarisationRefusalMessage,
  useSignFamiliarisation,
  type FamiliarisationRecordDetail,
} from '@/modules/crew/hooks/useFamiliarisation';
import { formatStamp } from './format';

export interface SignatureStripProps {
  vessel: { id: string; companyId: string };
  record: FamiliarisationRecordDetail;
  personName: string;
}

interface SlotProps {
  role: 'crew' | 'supervisor';
  title: string;
  signedAt: string | null;
  signedBy: string | null;
  right: string;
  waitingFor: string;
  pending: boolean;
  onSign: () => void;
}

const Slot: React.FC<SlotProps> = ({ role, title, signedAt, signedBy, right, waitingFor, pending, onSign }) => {
  const hint = actionHint(right);
  const signed = Boolean(signedAt);
  return (
    <li
      className={cn('flex min-w-0 flex-col gap-2 rounded-md border p-3', signed ? 'border-success/40 bg-success-muted' : 'border-border bg-card')}
      data-signature={role}
      data-signed={signed ? 'yes' : 'no'}
    >
      <p className="type-body font-medium text-foreground">{title}</p>
      {signed ? (
        <p className="flex min-w-0 items-start gap-2 type-body text-success">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="min-w-0">
            Signed by {signedBy ?? 'a former crew member'}
            <span className="block type-caption text-muted-foreground">{formatStamp(signedAt)}</span>
          </span>
        </p>
      ) : (
        <>
          <p className="type-body text-muted-foreground">{waitingFor}</p>
          {right === 'ok' ? (
            <Button type="button" size="sm" className="self-start [@media(pointer:coarse)]:h-11" onClick={onSign} disabled={pending}>
              {pending ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <PenLine aria-hidden="true" className="mr-2 h-4 w-4" />}
              Sign
            </Button>
          ) : hint && right !== 'not_permitted' && right !== 'items_open' ? (
            // items_open is already the waiting line; the other reasons say why this person cannot sign.
            <p className="type-caption text-muted-foreground" data-sign-hint={right}>
              {hint}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
};

/**
 * The record's sign-off (gap/04 C63): the crew member's signature and the
 * supervisor's, each when the template asks for it. Signing is open once
 * every item is ticked; the crew member signs their own record, a
 * supervisor in their department (or the Master, command or the fleet
 * office) signs anyone else's. Each control says why it is closed.
 */
export const SignatureStrip: React.FC<SignatureStripProps> = ({ vessel, record, personName }) => {
  const sign = useSignFamiliarisation(vessel);
  const [signing, setSigning] = React.useState<'crew' | 'supervisor' | null>(null);
  if (!record.requiresCrewSignature && !record.requiresSupervisorSignature) {
    return (
      <p className="type-body text-muted-foreground" data-signatures="none">
        This familiarisation needs no signatures: it completes when every item is ticked.
      </p>
    );
  }
  const run = async (as: 'crew' | 'supervisor') => {
    setSigning(as);
    try {
      await sign.mutateAsync({ recordId: record.id, as });
      notify.success(as === 'crew' ? 'Your signature is on the record.' : 'Signed as supervisor.');
    } catch (error) {
      notify.error(error, { title: 'The signature was not saved', fallback: familiarisationRefusalMessage(error) });
    } finally {
      setSigning(null);
    }
  };
  const itemsOpen = record.itemsDone < record.itemsTotal;
  return (
    <ul className="grid min-w-0 gap-3 sm:grid-cols-2" data-signatures="">
      {record.requiresCrewSignature ? (
        <Slot
          role="crew"
          title="Crew member"
          signedAt={record.crewSignedAt}
          signedBy={record.crewSignedByName}
          right={record.rights.signCrew}
          waitingFor={itemsOpen ? `${personName} signs once every item is ticked.` : `Waiting for ${personName} to sign.`}
          pending={signing === 'crew'}
          onSign={() => void run('crew')}
        />
      ) : null}
      {record.requiresSupervisorSignature ? (
        <Slot
          role="supervisor"
          title="Supervisor"
          signedAt={record.supervisorSignedAt}
          signedBy={record.supervisorSignedByName}
          right={record.rights.signSupervisor}
          waitingFor={itemsOpen ? 'A supervisor signs once every item is ticked.' : 'Waiting for a supervisor to sign.'}
          pending={signing === 'supervisor'}
          onSign={() => void run('supervisor')}
        />
      ) : null}
    </ul>
  );
};

export default SignatureStrip;
