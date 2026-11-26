import React from 'react';
import { ArrowRight, Info, Loader2, Lock, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError, EmptyState } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { SearchField } from '@/shared/components/data';
import { notify } from '@/shared/lib/notify';
import { useDocumentTypes } from '@/modules/crew/hooks/useDocumentTypes';
import { complianceRefusalMessage, useRequirementsConfigActions } from '@/modules/crew/hooks/useRequirementsConfig';
import { CATALOGUE_MISSING_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import { SATISFACTION_KIND_LABEL, ruleExists, sortRules, type RuleLike } from '@/modules/crew/lib/complianceModel';
import type { CrewDocumentSatisfactionKind } from '@/modules/crew/types/db.pending';
import { DocumentTypeCombobox } from './DocumentTypeCombobox';
import { useSatisfactionRules } from './useSatisfactionRules';

const KINDS: readonly CrewDocumentSatisfactionKind[] = ['equivalent', 'supersedes', 'component'];

/** The short word on a rule's line. */
const KIND_WORD: Readonly<Record<CrewDocumentSatisfactionKind, string>> = {
  supersedes: 'Higher certificate',
  component: 'Combined certificate',
  equivalent: 'Accepted equivalent',
};

const COARSE = '[@media(pointer:coarse)]:h-11';

export interface EquivalenceDrawerProps {
  companyId: string;
  vesselId: string;
  /** crew_compliance.admin company wide (the server's answer and useCan): adds and removes the company's rules. */
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Which documents count for others (gap/04 C34, T-53, T-159, T-326): the
 * satisfaction rules the engine follows, STORM's (locked) and the
 * company's. A company administrator adds a rule ("holding A counts for B",
 * as an accepted equivalent, a higher certificate or a combined
 * certificate) or removes one of the company's; every vessel's compliance
 * of the company is refreshed after a confirmed change.
 */
export const EquivalenceDrawer: React.FC<EquivalenceDrawerProps> = ({ companyId, vesselId, canEdit, onOpenChange }) => {
  const catalogue = useDocumentTypes(companyId);
  const rules = useSatisfactionRules(companyId);
  const { saveRule } = useRequirementsConfigActions(companyId, vesselId);
  const [query, setQuery] = React.useState('');
  const [holder, setHolder] = React.useState<string | null>(null);
  const [satisfies, setSatisfies] = React.useState<string | null>(null);
  const [kind, setKind] = React.useState<CrewDocumentSatisfactionKind>('equivalent');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);

  const cat = catalogue.status === 'ready' ? catalogue.catalogue : null;
  const nameOf = React.useCallback((id: string) => cat?.byId.get(id)?.name ?? 'A document type no longer in the catalogue', [cat]);
  const list = React.useMemo(() => (rules.status === 'ready' ? sortRules(rules.rules, nameOf) : []), [rules, nameOf]);
  const shown = React.useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return list;
    return list.filter((r) => {
      const hay = `${nameOf(r.typeId)} ${nameOf(r.satisfiesTypeId)} ${KIND_WORD[r.kind]}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [list, query, nameOf]);
  const companyCount = list.filter((r) => r.companyId !== null).length;

  const add = async () => {
    setFormError(null);
    if (!holder || !satisfies) {
      setFormError('Choose both document types.');
      return;
    }
    if (holder === satisfies) {
      setFormError('A document type always counts for itself.');
      return;
    }
    if (ruleExists(list, holder, satisfies)) {
      setFormError('A rule for these two document types exists already.');
      return;
    }
    try {
      await saveRule.mutateAsync({ typeId: holder, satisfiesTypeId: satisfies, kind });
      notify.success('Rule added', { description: `${nameOf(holder)} now counts for ${nameOf(satisfies)} on every vessel of the company.` });
      setHolder(null);
      setSatisfies(null);
    } catch (error) {
      setFormError(complianceRefusalMessage(error));
    }
  };

  const remove = async (rule: RuleLike) => {
    setRemoving(rule.id);
    try {
      await saveRule.mutateAsync({ typeId: rule.typeId, satisfiesTypeId: rule.satisfiesTypeId, remove: true });
      notify.success('Rule removed', { description: `${nameOf(rule.typeId)} no longer counts for ${nameOf(rule.satisfiesTypeId)}.` });
    } catch (error) {
      notify.error(complianceRefusalMessage(error), { title: 'The rule was not removed' });
    } finally {
      setRemoving(null);
    }
  };

  let body: React.ReactNode;
  if (rules.status === 'idle' || rules.status === 'loading' || catalogue.status === 'loading' || catalogue.status === 'idle') {
    body = (
      <div className="space-y-2" aria-busy="true" aria-label="Loading the rules">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (rules.status === 'not_set_up' || catalogue.status === 'not_set_up') {
    body = (
      <Alert variant="info">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{CATALOGUE_MISSING_NOTICE}</AlertDescription>
      </Alert>
    );
  } else if (rules.status === 'error') {
    body = <PageError variant="inline" error={rules.error} onRetry={rules.retry} title="The rules could not load" treatMissingAsOff={false} headingLevel={3} />;
  } else if (catalogue.status === 'error') {
    body = <PageError variant="inline" error={catalogue.error} onRetry={catalogue.retry} title="The document types could not load" treatMissingAsOff={false} headingLevel={3} />;
  } else {
    body = (
      <div className="space-y-4">
        {canEdit && cat ? (
          <section className="space-y-3 rounded-lg border border-border p-3" aria-labelledby="equivalence-add">
            <h3 id="equivalence-add" className="type-subtitle text-foreground">
              Add a rule for the company
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="equivalence-holder">Holding this document</Label>
              <DocumentTypeCombobox id="equivalence-holder" catalogue={cat} value={holder} onChange={(t) => setHolder(t.id)} label="Holding this document" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equivalence-satisfies">counts for this one</Label>
              <DocumentTypeCombobox
                id="equivalence-satisfies"
                catalogue={cat}
                value={satisfies}
                onChange={(t) => setSatisfies(t.id)}
                label="counts for this one"
                exclude={holder ? new Set([holder]) : undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="equivalence-kind">How it counts</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as CrewDocumentSatisfactionKind)}>
                <SelectTrigger id="equivalence-kind" aria-label="How it counts">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {SATISFACTION_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formError ? (
              <p role="alert" className="type-caption text-critical">
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={() => void add()} disabled={saveRule.isPending} className={COARSE}>
                {saveRule.isPending && !removing ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
                Add rule
              </Button>
            </div>
          </section>
        ) : (
          <p className="type-caption text-muted-foreground">Only a company-wide crew compliance administrator can change these rules.</p>
        )}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="type-subtitle text-foreground">
              Rules <span className="type-caption tabular-nums text-muted-foreground">{list.length} · {companyCount} of the company</span>
            </h3>
            <SearchField value={query} onChange={setQuery} placeholder="Search the rules" className="sm:w-56" />
          </div>
          {shown.length === 0 ? (
            <EmptyState compact kind={query ? 'filtered' : 'first-use'} title={query ? 'No rule matches' : 'No rules yet'} headingLevel={4} />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border" aria-label="Satisfaction rules">
              {shown.map((r) => (
                <li key={r.id} className="flex min-w-0 items-start gap-3 px-3 py-2" data-rule={r.id} data-rule-scope={r.companyId ? 'company' : 'storm'}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 type-body-sm text-foreground">
                      <span className="min-w-0 break-words font-medium">{nameOf(r.typeId)}</span>
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="sr-only">counts for</span>
                      <span className="min-w-0 break-words">{nameOf(r.satisfiesTypeId)}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill tone="info" icon={null}>
                        {KIND_WORD[r.kind]}
                      </StatusPill>
                      {r.companyId === null ? (
                        <StatusPill tone="neutral" icon={Lock}>
                          STORM
                        </StatusPill>
                      ) : (
                        <StatusPill tone="signal" icon={null}>
                          Company
                        </StatusPill>
                      )}
                    </div>
                  </div>
                  {canEdit && r.companyId !== null ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => void remove(r)}
                      disabled={removing !== null}
                      aria-label={`Remove the rule: ${nameOf(r.typeId)} counts for ${nameOf(r.satisfiesTypeId)}`}
                      className="shrink-0 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    >
                      {removing === r.id ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" data-equivalence-drawer="">
        <SheetHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
          <SheetTitle className="type-title">Which documents count for others</SheetTitle>
          <SheetDescription>
            A requirement is met by any of its options, and by every document a rule below lets count for one of them. STORM's rules stay; your
            company can add its own.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">{body}</div>
      </SheetContent>
    </Sheet>
  );
};

export default EquivalenceDrawer;
