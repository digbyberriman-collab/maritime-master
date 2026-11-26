import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { FileText, History, KeyRound, Pencil, Plus, Trash2, UserRound, type LucideIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AccessDenied, EmptyState, PageError } from '@/shared/components/states';
import { useCapability } from '@/lib/permissions/useCan';
import { crewKeys } from '@/modules/crew/hooks/crewKeys';
import type { ProfileTabProps } from '@/modules/crew/lib/profileTabs';

/**
 * The profile's Activity tab (gap/04 C22; X1-03B): one timeline of the
 * recorded changes to the person, merged by time from the two logs that
 * read the same audit table today:
 *
 * - the crew log (the legacy CrewAuditLog): every row keyed on the person's
 *   login id;
 * - the HR trail (HRIS ProfileAuditTrail): profile rows keyed on the
 *   profiles.id or the login id;
 * - plus the document rows of the person's crew documents (keyed on each
 *   document's id).
 *
 * A row in two sources shows once. The tab shows who changed which fields
 * and when, never the values: profile rows hold personal data, and the
 * crew profile's own writer logs field names only (X1-03).
 *
 * Gate: hris.employee_records.personal_details.view on the vessel (the
 * mirror of the audit table's HR read rule). Nothing is read while it
 * loads or when it is no; the tab then says who sees the history.
 */

export const ACTIVITY_DENIED_TITLE = 'The change history is kept for HR';
export const ACTIVITY_DENIED_DETAIL = 'Who changed this profile, and when, is shown to HR. Ask your HR manager if you need it.';
export const HISTORY_CAPABILITY = 'hris.employee_records.personal_details.view';

/** How many rows each source reads (newest first). */
export const ACTIVITY_LIMIT = 200;

/** Audit entity types that describe the person's profile itself (HRIS PROFILE_AUDIT_ENTITY_TYPES). */
const PROFILE_TYPES = new Set(['crew_profile', 'profile', 'crew_member']);

export type ActivityKind = 'profile' | 'documents' | 'employment' | 'other';

export interface ActivityEntry {
  id: string;
  /** ISO timestamp, or null when the row has none (sorted last). */
  at: string | null;
  action: string;
  entityType: string;
  kind: ActivityKind;
  actorEmail: string | null;
  actorRole: string | null;
  /** Names of the changed fields (never their values). */
  fields: string[];
  /** A document's name, for document rows that carry it. */
  subject: string | null;
}

/** One audit_logs row as the tab selects it. */
export interface AuditRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_email: string | null;
  actor_role: string | null;
  changed_fields: Json | null;
  timestamp: string | null;
}

export interface DocumentAuditRow extends AuditRow {
  new_values: Json | null;
}

const KIND_OF: Record<string, ActivityKind> = {
  crew_profile: 'profile',
  profile: 'profile',
  crew_member: 'profile',
  crew_next_of_kin: 'profile',
  crew_certificate: 'documents',
  crew_attachment: 'documents',
  crew_document: 'documents',
  crew_work_authorisation: 'documents',
  crew_assignment: 'employment',
  crew_contract: 'employment',
};

const ENTITY_LABEL: Record<string, string> = {
  crew_profile: 'Profile',
  profile: 'Profile',
  crew_member: 'Profile',
  crew_next_of_kin: 'Next of kin',
  crew_certificate: 'Document',
  crew_attachment: 'Attachment',
  crew_document: 'Document',
  crew_work_authorisation: 'Right to work',
  crew_assignment: 'Assignment',
  crew_contract: 'Contract',
  crew_bank_details: 'Bank details',
};

const ACTION_LABEL: Record<string, string> = { CREATE: 'Added', INSERT: 'Added', UPDATE: 'Changed', DELETE: 'Removed', ANONYMISE: 'Anonymised', ANONYMIZE: 'Anonymised' };

/** "date_of_birth" → "Date of birth". */
const humaniseField = (name: string): string => {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z])(\d)/g, '$1 $2').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : name;
};

/** Legacy role names as people say them (acronyms stay upper case). */
const ROLE_LABEL: Record<string, string> = { dpa: 'DPA', hod: 'HoD' };
const roleLabel = (role: string): string => ROLE_LABEL[role.trim().toLowerCase()] ?? humaniseField(role);

/** Changed field names from `changed_fields`: an array of names, or an object of flags (both are written today). */
function changedFieldNames(value: Json | null | undefined): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, flagged]) => Boolean(flagged))
      .map(([name]) => name);
  }
  return [];
}

const subjectOf = (values: Json | null | undefined): string | null => {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const name = (values as Record<string, Json | undefined>).certificate_name ?? (values as Record<string, Json | undefined>).document_name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
};

function toActivityEntry(row: AuditRow & { new_values?: Json | null }): ActivityEntry {
  const kind = KIND_OF[row.entity_type] ?? 'other';
  return {
    id: row.id,
    at: row.timestamp,
    action: row.action,
    entityType: row.entity_type,
    kind,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    fields: changedFieldNames(row.changed_fields),
    subject: kind === 'documents' ? subjectOf(row.new_values ?? null) : null,
  };
}

const timeOf = (at: string | null): number => {
  if (!at) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(at);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
};

/**
 * The sources merged into one timeline: newest first, a row present in
 * several sources once, rows without a time last, ties in a stable order
 * (by id) so the list never jumps between renders.
 */
function mergeActivity(...sources: ReadonlyArray<readonly ActivityEntry[]>): ActivityEntry[] {
  const byId = new Map<string, ActivityEntry>();
  for (const source of sources) {
    for (const entry of source) {
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => timeOf(b.at) - timeOf(a.at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const AUDIT_COLUMNS = 'id, entity_type, entity_id, action, actor_email, actor_role, changed_fields, timestamp';

/** The three reads behind the tab, merged. */
async function fetchProfileActivity(profileId: string, userId: string | null): Promise<ActivityEntry[]> {
  const ids = [profileId, ...(userId ? [userId] : [])];
  // The HR trail and the crew log: every row keyed on the person (the HR read rule limits the entity types).
  const personRows = supabase.from('audit_logs').select(AUDIT_COLUMNS).in('entity_id', ids).order('timestamp', { ascending: false }).limit(ACTIVITY_LIMIT);
  // The person's crew documents, then their rows.
  const documentIds = userId
    ? supabase.from('crew_certificates').select('id').eq('user_id', userId).limit(ACTIVITY_LIMIT)
    : Promise.resolve({ data: [] as { id: string }[], error: null });
  const [people, docs] = await Promise.all([personRows, documentIds]);
  if (people.error) throw people.error;
  if (docs.error) throw docs.error;
  const docIds = (docs.data ?? []).map((d) => d.id);
  let documentRows: DocumentAuditRow[] = [];
  if (docIds.length > 0) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select(`${AUDIT_COLUMNS}, new_values`)
      .eq('entity_type', 'crew_certificate')
      .in('entity_id', docIds)
      .order('timestamp', { ascending: false })
      .limit(ACTIVITY_LIMIT);
    if (error) throw error;
    documentRows = (data ?? []) as DocumentAuditRow[];
  }
  const all = (people.data ?? []) as AuditRow[];
  const hrTrail = all.filter((r) => PROFILE_TYPES.has(r.entity_type)).map((r) => toActivityEntry(r));
  const crewLog = all.filter((r) => userId !== null && r.entity_id === userId).map((r) => toActivityEntry(r));
  const rest = all.filter((r) => !PROFILE_TYPES.has(r.entity_type) && r.entity_id !== userId).map((r) => toActivityEntry(r));
  return mergeActivity(hrTrail, crewLog, rest, documentRows.map((r) => toActivityEntry(r)));
}

const FILTERS: readonly { value: 'all' | ActivityKind; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'profile', label: 'Profile' },
  { value: 'documents', label: 'Documents' },
  { value: 'employment', label: 'Employment' },
  { value: 'other', label: 'Other' },
];

const ACTION_ICON: Record<string, LucideIcon> = { CREATE: Plus, INSERT: Plus, UPDATE: Pencil, DELETE: Trash2 };
const KIND_ICON: Record<ActivityKind, LucideIcon> = { profile: UserRound, documents: FileText, employment: History, other: KeyRound };

const dayKey = (at: string | null): string => {
  if (!at) return 'unknown';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? 'unknown' : format(d, 'yyyy-MM-dd');
};
const dayLabel = (key: string): string => {
  if (key === 'unknown') return 'Date not recorded';
  const [y, m, d] = key.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'EEEE d MMMM yyyy');
};

const FIELDS_SHOWN = 6;

const ActivityTab: React.FC<ProfileTabProps> = ({ profile, vessel }) => {
  const gate = useCapability(HISTORY_CAPABILITY, { vesselId: vessel.id });
  const allowed = gate.status !== 'loading' && gate.allowed;
  const query = useQuery({
    queryKey: [...crewKeys.vessel(vessel.companyId, vessel.id), 'profile', profile.profileId, 'activity', profile.userId],
    queryFn: () => fetchProfileActivity(profile.profileId, profile.userId),
    enabled: allowed,
    retry: 1,
    staleTime: 30_000,
  });
  const [filter, setFilter] = useState<'all' | ActivityKind>('all');
  const entries = query.data;
  const shown = useMemo(() => (entries ?? []).filter((e) => filter === 'all' || e.kind === filter), [entries, filter]);
  const groups = useMemo(() => {
    const out: { key: string; entries: ActivityEntry[] }[] = [];
    for (const e of shown) {
      const key = dayKey(e.at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.entries.push(e);
      else out.push({ key, entries: [e] });
    }
    return out;
  }, [shown]);

  if (gate.status === 'loading' || (allowed && query.isPending)) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }
  if (!gate.allowed) return <AccessDenied headingLevel={2} title={ACTIVITY_DENIED_TITLE} detail={ACTIVITY_DENIED_DETAIL} backTo={null} />;
  if (query.error) {
    return <PageError error={query.error} onRetry={() => void query.refetch()} title="The activity could not load" headingLevel={2} />;
  }

  const total = entries?.length ?? 0;
  return (
    <div className="min-w-0 space-y-4" data-activity-state="ready">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[min(18rem,100%)] flex-1">
          <h2 className="type-title text-foreground">Activity</h2>
          <p className="type-body text-muted-foreground">
            Recorded changes to {profile.displayName}&rsquo;s profile, documents and employment, newest first. Values are not shown.
          </p>
        </div>
        {total > 0 ? (
          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => setFilter((v || 'all') as 'all' | ActivityKind)}
            aria-label="Show activity of"
            variant="outline"
            size="sm"
            className="flex-wrap justify-start"
          >
            {FILTERS.map((f) => (
              <ToggleGroupItem key={f.value} value={f.value} className="[@media(pointer:coarse)]:h-11">
                {f.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
      </div>

      {total === 0 ? (
        <EmptyState kind="first-use" icon={History} title="No changes recorded yet" body="Changes to this profile appear here as they are saved." bordered />
      ) : shown.length === 0 ? (
        <EmptyState kind="filtered" title="Nothing of this kind" body="Choose All to see every recorded change." bordered compact />
      ) : (
        <Card className="min-w-0">
          <CardContent className="min-w-0 p-0">
            <ol aria-label="Recorded changes" className="divide-y divide-border">
              {groups.map((g) => (
                <li key={g.key} className="min-w-0">
                  <h3 className="px-4 pb-1 pt-3 type-eyebrow text-muted-foreground">{dayLabel(g.key)}</h3>
                  <ol className="px-4 pb-2">
                    {g.entries.map((e) => (
                      <ActivityItem key={e.id} entry={e} />
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const ActivityItem: React.FC<{ entry: ActivityEntry }> = ({ entry }) => {
  const Icon = ACTION_ICON[entry.action.toUpperCase()] ?? KIND_ICON[entry.kind];
  const action = ACTION_LABEL[entry.action.toUpperCase()] ?? humaniseField(entry.action.toLowerCase());
  const what = ENTITY_LABEL[entry.entityType] ?? humaniseField(entry.entityType);
  const time = entry.at && !Number.isNaN(Date.parse(entry.at)) ? format(new Date(entry.at), 'HH:mm') : null;
  const extra = entry.fields.length - FIELDS_SHOWN;
  return (
    <li className="flex min-w-0 gap-3 py-2.5" data-activity-entry={entry.id} data-activity-kind={entry.kind}>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground',
          entry.action.toUpperCase() === 'DELETE' && 'border-critical/25 bg-critical-muted text-critical',
        )}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
          <p className="min-w-0 break-words type-body text-foreground">
            <span className="font-medium">
              {what} {action.toLowerCase()}
            </span>
            {entry.subject ? <span className="text-muted-foreground"> · {entry.subject}</span> : null}
          </p>
          {time ? <time className="type-caption tabular-nums text-muted-foreground" dateTime={entry.at ?? undefined}>{time}</time> : null}
        </div>
        <p className="break-words type-caption text-muted-foreground">
          {entry.actorEmail ?? 'Unknown person'}
          {entry.actorRole ? ` · ${roleLabel(entry.actorRole)}` : ''}
        </p>
        {entry.fields.length > 0 ? (
          <ul className="mt-1.5 flex flex-wrap gap-1" aria-label="Changed fields">
            {entry.fields.slice(0, FIELDS_SHOWN).map((f) => (
              <li key={f} className="rounded-sm border border-border px-1.5 py-0.5 type-caption text-muted-foreground">
                {humaniseField(f)}
              </li>
            ))}
            {extra > 0 ? <li className="px-1 py-0.5 type-caption text-muted-foreground">+{extra} more</li> : null}
          </ul>
        ) : null}
      </div>
    </li>
  );
};

export default ActivityTab;
