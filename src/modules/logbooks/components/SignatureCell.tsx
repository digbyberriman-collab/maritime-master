import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { canAcknowledge, canAttestWitness, canCountersign, canVerify, missingSigners } from '../lib/formRules';
import { CAPACITY_LABELS, EXTERNAL_CAPACITY_LABELS, type CrewCapacity } from '../lib/roles';
import type { EntryView, SignatureKind } from '../lib/types';
import type { SignKind } from '../lib/logbookApi';
import { stamp } from '../lib/format';

interface Props {
  entry: EntryView | null;
  isOwnDraft: boolean;
  dirty: boolean;
  missingCount: number;
  capacity: CrewCapacity | null;
  userId: string | null;
  busy: boolean;
  onAttest: (kind: SignKind, witness?: { name: string; capacity: string }) => void;
}

const KIND_LABEL: Record<SignatureKind, string> = {
  author: 'Signed', countersign: 'Countersigned', verify: 'Master review', acknowledge: 'Acknowledged', attested: 'Witness attested',
};

/** Signatures beside the line, the review acknowledgement and the actions this user may take. */
const SignatureCell: React.FC<Props> = ({ entry, isOwnDraft, dirty, missingCount, capacity, userId, busy, onAttest }) => {
  const [reviewed, setReviewed] = React.useState(false);
  const [witnessName, setWitnessName] = React.useState('');
  const [attesting, setAttesting] = React.useState(false);
  React.useEffect(() => { setReviewed(false); setAttesting(false); }, [entry?.version, dirty]);

  if (!entry) return <span className="text-xs italic text-muted-foreground">Unsigned</span>;
  const signatures = entry.signatures.filter((s) => s.kind !== 'acknowledge');
  const acknowledgements = entry.signatures.filter((s) => s.kind === 'acknowledge');
  const policy = entry.schema_snapshot?.signing;
  const outstanding = entry.status !== 'draft' ? missingSigners(policy, entry.signatures) : [];
  const witness = canAttestWitness(entry, entry.signatures, capacity);

  const actions: Array<{ kind: SignKind; label: string; primary?: boolean }> = [];
  if (isOwnDraft) actions.push({ kind: 'author', label: 'Sign line', primary: true });
  if (canCountersign(entry, entry.signatures, capacity, userId)) actions.push({ kind: 'countersign', label: 'Countersign' });
  if (witness) actions.push({ kind: 'attested', label: `Attest ${EXTERNAL_CAPACITY_LABELS[witness].toLowerCase()}` });
  if (canVerify(entry, capacity)) actions.push({ kind: 'verify', label: 'Master review' });
  if (canAcknowledge(entry, entry.signatures, capacity, userId)) actions.push({ kind: 'acknowledge', label: 'Acknowledge order' });

  const reviewDisabled = dirty || missingCount > 0;

  return (
    <div className="space-y-2 text-xs">
      {signatures.length === 0 ? (
        <span className="italic text-muted-foreground">Unsigned</span>
      ) : (
        <ul className="space-y-1">
          {signatures.map((s) => (
            <li key={s.id} className="leading-tight">
              <strong className="font-serif text-[13px] text-foreground">{s.kind === 'attested' ? s.witness_name : s.actor_name}</strong>
              <span className="block text-muted-foreground">
                {KIND_LABEL[s.kind]}{s.kind === 'attested' && s.witness_capacity ? ` · ${EXTERNAL_CAPACITY_LABELS[s.witness_capacity as keyof typeof EXTERNAL_CAPACITY_LABELS] ?? s.witness_capacity}, attested by ${s.actor_name}` : s.actor_capacity ? ` · ${CAPACITY_LABELS[s.actor_capacity as keyof typeof CAPACITY_LABELS] ?? s.actor_capacity}` : ''}
                {s.page_id ? ' · page review' : ''} · {stamp(s.signed_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {acknowledgements.length > 0 && (
        <p className="text-muted-foreground">{acknowledgements.map((a) => a.actor_name).join(', ')} · acknowledged</p>
      )}
      {outstanding.length > 0 && <p className="text-warning">Awaiting {outstanding.join(', ')}</p>}
      {actions.length > 0 && (
        <div className="space-y-1.5 border-t border-border pt-2">
          <label className="flex items-start gap-2">
            <Checkbox checked={reviewed} disabled={reviewDisabled} onCheckedChange={(v) => setReviewed(v === true)} aria-label="I have reviewed this line" className="mt-0.5" />
            <span className={reviewDisabled ? 'text-muted-foreground' : 'text-foreground'}>
              I have reviewed this line{entry.source_snapshot ? ' and captured values' : ''}.
            </span>
          </label>
          <div className="flex flex-wrap gap-1">
            {actions.map((action) => (
              <Button
                key={action.kind}
                type="button"
                size="sm"
                variant={action.primary ? 'default' : 'outline'}
                className="h-7 px-2 text-xs"
                disabled={!reviewed || busy}
                onClick={() => {
                  if (action.kind === 'attested') { setAttesting(true); return; }
                  onAttest(action.kind);
                }}
              >
                {action.kind === 'verify' ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                {action.label}
              </Button>
            ))}
          </div>
          {attesting && witness && (
            <div className="space-y-1 rounded border border-border bg-muted/40 p-2">
              <label className="block text-[11px] text-muted-foreground" htmlFor={`witness-${entry.id}`}>
                {EXTERNAL_CAPACITY_LABELS[witness]} · full name as signed on the record
              </label>
              <Input id={`witness-${entry.id}`} value={witnessName} onChange={(e) => setWitnessName(e.target.value)} className="h-7 text-xs" maxLength={200} />
              <div className="flex gap-1">
                <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={!witnessName.trim() || busy} onClick={() => onAttest('attested', { name: witnessName.trim(), capacity: witness })}>
                  Master · attest witness
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setAttesting(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SignatureCell;
