import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Award, Globe2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import { useProfileDocuments, useRtwExpiryItems, useRtwMutations, useWorkAuthorisations } from '@/modules/hris/hooks/useRightToWork';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { formatDate } from '@/modules/hris/lib/format';
import {
  ITINERARY_REGION_LABELS,
  REQUIRED_AUTHORISATION_RULES,
  authorisationTypeLabel,
  requiredAuthorisationsFor,
  statusFromDays,
  type AuthorisationType,
  type ItineraryRegion,
  type WorkAuthorisationRow,
} from '@/modules/hris/lib/rightToWork';
import { AuthorisationFormDialog } from './AuthorisationFormDialog';
import { AuthorisationsTable } from './AuthorisationsTable';
import { IdentityDocumentsCard } from './IdentityDocumentsCard';
import { StatusChip } from './StatusChip';

interface CrewRtwDetailProps {
  crew: HrCrewDirectoryEntry;
  /** HR editor. */
  canEdit: boolean;
  isOwnRecord: boolean;
}

const REGIONS = REQUIRED_AUTHORISATION_RULES.map((r) => r.region);

/** Per-crew compliance: identity documents, authorisations, itinerary hint and certificate expiries. */
export const CrewRtwDetail: React.FC<CrewRtwDetailProps> = ({ crew, canEdit, isOwnRecord }) => {
  const documents = useProfileDocuments(crew.id);
  const authorisations = useWorkAuthorisations(crew.id);
  const expiry = useRtwExpiryItems({ profileId: crew.id });
  const m = useRtwMutations();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<WorkAuthorisationRow | null>(null);
  const [presetType, setPresetType] = useState<AuthorisationType | null>(null);
  const [deleting, setDeleting] = useState<WorkAuthorisationRow | null>(null);
  const [regions, setRegions] = useState<ItineraryRegion[]>([]);

  const canWrite = canEdit || isOwnRecord;
  const busy = m.updateAuthorisation.isPending || m.deleteAuthorisation.isPending || m.verifyAuthorisation.isPending || m.uploadDocument.isPending;
  const crewUserId = crew.user_id ?? crew.id;

  const certificates = useMemo(() => expiry.items.filter((i) => i.item_type === 'certificate'), [expiry.items]);
  const nationality = documents.documents?.nationality ?? crew.nationality;
  const required = useMemo(() => requiredAuthorisationsFor({ regions, nationality, authorisations: authorisations.authorisations }), [regions, nationality, authorisations.authorisations]);

  const openCreate = (type: AuthorisationType | null = null) => {
    setEditing(null);
    setPresetType(type);
    setFormOpen(true);
  };
  const openEdit = (row: WorkAuthorisationRow) => {
    setEditing(row);
    setPresetType(null);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <IdentityDocumentsCard
            documents={documents.documents}
            isLoading={documents.isLoading}
            canEdit={canEdit}
            saving={m.updateProfileDocuments.isPending}
            onSave={(before, patch) => m.updateProfileDocuments.mutateAsync({ profileId: crew.id, before, patch })}
          />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Globe2 className="h-4 w-4 text-primary" /> Itinerary check</CardTitle>
              <CardDescription>Pick where the vessel is heading to see which authorisations {isOwnRecord ? 'you' : crew.displayName} may need{nationality ? ` as a ${nationality} national` : ''}.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <ToggleGroup type="multiple" value={regions} onValueChange={(v) => setRegions(v as ItineraryRegion[])} className="flex-wrap justify-start">
                {REGIONS.map((r) => (
                  <ToggleGroupItem key={r} value={r} size="sm" variant="outline" className="text-xs">{ITINERARY_REGION_LABELS[r]}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              {regions.length === 0 ? (
                <p className="text-xs text-muted-foreground">A simple heuristic, not legal advice: always confirm with the agent for the port of entry.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {required.map((r) => (
                    <li key={r.rule.region} className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{ITINERARY_REGION_LABELS[r.rule.region]}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.status === 'exempt'
                            ? 'Not required for this nationality.'
                            : r.status === 'ok' && r.satisfiedBy
                              ? `Covered by ${authorisationTypeLabel(r.satisfiedBy.authorisation_type)} · ${r.satisfiedBy.country}${r.satisfiedBy.expiry_date ? ` until ${formatDate(r.satisfiedBy.expiry_date)}` : ''}`
                              : r.status === 'lapsed' && r.satisfiedBy
                                ? `${authorisationTypeLabel(r.satisfiedBy.authorisation_type)} on file is no longer valid.`
                                : r.rule.note}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            'text-xs font-medium',
                            r.status === 'ok' ? 'text-green-600 dark:text-green-400' : r.status === 'exempt' ? 'text-muted-foreground' : 'text-destructive',
                          )}
                        >
                          {r.status === 'ok' ? 'Covered' : r.status === 'exempt' ? 'Exempt' : r.status === 'lapsed' ? 'Lapsed' : 'Missing'}
                        </span>
                        {canWrite && (r.status === 'missing' || r.status === 'lapsed') && (
                          <Button size="sm" variant="outline" className="text-xs" onClick={() => openCreate(r.rule.anyOf[0])}>Add</Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <AuthorisationsTable
            authorisations={authorisations.authorisations}
            isLoading={authorisations.isLoading}
            canWrite={canWrite}
            canVerify={canEdit}
            busy={busy}
            onAdd={() => openCreate()}
            onEdit={openEdit}
            onDelete={setDeleting}
            onVerify={(row, verified) => m.verifyAuthorisation.mutate({ row, verified })}
            onUpload={(row, file) => m.uploadDocument.mutate({ row, file, crewUserId })}
          />

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><Award className="h-4 w-4 text-primary" /> Certificate expiries</CardTitle>
                <CardDescription>STCW and professional certificates with an expiry date, soonest first.</CardDescription>
              </div>
              <Button asChild size="sm" variant="ghost" className="gap-1 text-xs">
                <Link to={`${HRIS_PATHS.documents}?crew=${crew.id}&module=hris`}>Manage <ArrowUpRight className="h-3.5 w-3.5" /></Link>
              </Button>
            </CardHeader>
            <CardContent>
              {expiry.isLoading ? (
                <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
              ) : certificates.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{crew.user_id ? 'No certificates with an expiry date.' : 'Certificates are linked to a login account; this crew member has not been invited yet.'}</p>
              ) : (
                <ul className="divide-y">
                  {certificates.map((c) => (
                    <li key={`${c.record_id}-${c.label}`} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{c.label}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(c.due_date)}</p>
                      </div>
                      <StatusChip status={statusFromDays(c.days_remaining)} label={c.days_remaining !== null && c.days_remaining < 0 ? `Expired ${Math.abs(c.days_remaining)}d ago` : c.days_remaining !== null ? `${c.days_remaining}d` : undefined} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <AuthorisationFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        authorisation={editing}
        presetType={presetType}
        submitting={m.createAuthorisation.isPending || m.updateAuthorisation.isPending}
        onSubmit={(payload) => (editing ? m.updateAuthorisation.mutateAsync({ row: editing, payload }) : m.createAuthorisation.mutateAsync({ profileId: crew.id, payload }))}
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this authorisation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${authorisationTypeLabel(deleting.authorisation_type)} · ${deleting.country}`} will be removed permanently, along with its uploaded document.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={m.deleteAuthorisation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={m.deleteAuthorisation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!deleting) return;
                m.deleteAuthorisation.mutate(deleting, { onSettled: () => setDeleting(null) });
              }}
            >
              {m.deleteAuthorisation.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CrewRtwDetail;
