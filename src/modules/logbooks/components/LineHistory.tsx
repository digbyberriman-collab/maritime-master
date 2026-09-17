import React from 'react';
import { useLogbookEntryAudit } from '../hooks/useLogbookEntryAudit';
import LogbookAttachments from './LogbookAttachments';
import type { EntryView } from '../lib/types';
import { stamp } from '../lib/format';

interface Props {
  entry: EntryView;
  canManageAttachments: boolean;
}

/** History, signature digests, captured-source evidence and attachments beneath a saved line. */
const LineHistory: React.FC<Props> = ({ entry, canManageAttachments }) => {
  const [open, setOpen] = React.useState(false);
  const audit = useLogbookEntryAudit(open ? entry.id : null);
  return (
    <details className="text-xs" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">History &amp; evidence · {entry.signatures.length} signature{entry.signatures.length === 1 ? '' : 's'}</summary>
      <div className="mt-2 space-y-3 rounded border border-border bg-muted/30 p-3">
        <p>Entered by {entry.recorded_by_name ?? '—'} · {stamp(entry.created_at)} · revision {entry.version} · {entry.template_revision ?? 'no template'} · {entry.flag_profile ?? '—'}</p>
        {entry.source_snapshot ? (
          <div className="space-y-1">
            <p>Captured {entry.source_snapshot.source} · {stamp(entry.source_snapshot.observed_at, true)} · {entry.source_snapshot.mode}</p>
            <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[11px]">{JSON.stringify(entry.source_snapshot, null, 2)}</pre>
            <p>{entry.override_reason ? `Changed captured values: ${entry.override_reason}` : 'Captured values retained.'}</p>
          </div>
        ) : (
          <p>Manually entered values</p>
        )}
        {entry.digest && <p className="break-all">Content digest <code className="text-[11px]">{entry.digest}</code></p>}
        {entry.signatures.length > 0 && (
          <ul className="space-y-1">
            {entry.signatures.map((s) => (
              <li key={s.id}>
                <strong>{s.kind}</strong> · {s.kind === 'attested' ? `${s.witness_name} (${s.witness_capacity}) attested by ${s.actor_name}` : s.actor_name} · {stamp(s.signed_at, true)} · v{s.entry_version}
                <span className="block break-all text-[11px] text-muted-foreground">{s.digest}</span>
                {s.statement && <span className="block text-[11px] text-muted-foreground">{s.statement}</span>}
              </li>
            ))}
          </ul>
        )}
        {open && (
          <ol className="space-y-1 border-t border-border pt-2">
            {(audit.data ?? []).slice().reverse().map((event) => (
              <li key={event.id}>
                <strong>{event.action}</strong> · {event.actor_name ?? 'System'} <span className="text-muted-foreground">{stamp(event.created_at, true)}</span>
                {event.changed_fields?.length ? <span className="text-muted-foreground"> · {event.changed_fields.join(', ')}</span> : null}
              </li>
            ))}
            {audit.isLoading && <li className="text-muted-foreground">Loading audit trail…</li>}
          </ol>
        )}
        <LogbookAttachments entryId={entry.id} logbookId={entry.logbook_id} companyId={entry.company_id} vesselId={entry.vessel_id} canManage={canManageAttachments} />
      </div>
    </details>
  );
};

export default LineHistory;
