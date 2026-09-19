import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { useLegalIncidents, useLegalPeople, useLegalVessels } from '@/modules/legal/hooks/useLegalLookups';
import { requestTypeDef } from '@/modules/legal/lib/constants';
import type { LegalRequestRow } from '@/modules/legal/lib/requests';

const fmtDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : format(d, withTime ? 'd MMM yyyy, HH:mm' : 'd MMM yyyy');
};

const money = (value: number | null, currency: string | null) => {
  if (value === null) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency ?? ''} ${value}`;
  }
};

const Item: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
  </div>
);

/** Full read-out of a request's fields. */
export const RequestSummary: React.FC<{ request: LegalRequestRow }> = ({ request }) => {
  const type = requestTypeDef(request.request_type);
  const { vesselName } = useLegalVessels();
  const { incidentLabel } = useLegalIncidents(Boolean(request.incident_id));
  const { people } = useLegalPeople();
  const crew = request.profile_id ? people.find((p) => p.id === request.profile_id) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.description || <span className="text-muted-foreground">No description given.</span>}</dd>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Item label="Type">{type?.label ?? request.request_type}</Item>
          <Item label="Submitted by">
            <PersonChip userId={request.submitted_by} />
          </Item>
          <Item label="Department">{request.requester_department ?? '—'}</Item>
          {type?.showsCounterparty && <Item label="Counterparty">{request.counterparty ?? '—'}</Item>}
          {type?.showsValue && <Item label="Contract value">{money(request.contract_value, request.currency)}</Item>}
          <Item label="Jurisdiction">{request.jurisdiction ?? '—'}</Item>
          <Item label="Vessel">{vesselName(request.vessel_id) || '—'}</Item>
          <Item label="Related incident">{incidentLabel(request.incident_id) || '—'}</Item>
          <Item label="Crew member">{crew?.displayName ?? (request.cfm_employee_id ? `Inkfleet #${request.cfm_employee_id}` : '—')}</Item>
          <Item label="Requested deadline">{fmtDate(request.requested_deadline)}</Item>
          <Item label="SLA deadline">{fmtDate(request.sla_deadline, true)}</Item>
          <Item label="Submitted">{fmtDate(request.created_at, true)}</Item>
          {request.resolved_at && <Item label="Resolved">{fmtDate(request.resolved_at, true)}</Item>}
          <Item label="Tags">
            {request.tags?.length ? (
              <span className="flex flex-wrap gap-1">
                {request.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
              </span>
            ) : (
              '—'
            )}
          </Item>
        </dl>
        {request.resolution_summary && (
          <div className="rounded-lg border border-success/30 bg-success/5 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-success">Resolution</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-foreground">{request.resolution_summary}</dd>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default RequestSummary;
