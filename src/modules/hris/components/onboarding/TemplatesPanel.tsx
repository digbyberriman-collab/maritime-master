import React, { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, ListChecks, Pencil, Plus, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import { useOnboardingTemplateMutations, useOnboardingTemplates, type TemplatePayload } from '@/modules/hris/hooks/useOnboarding';
import { countTemplateItems, parseTemplateSections, type OnboardingTemplateRow } from '@/modules/hris/lib/onboarding';
import { TemplateEditorDialog } from './TemplateEditorDialog';

interface TemplatesPanelProps {
  canEdit: boolean;
}

/** Company onboarding templates: list, edit, set default, archive. */
export const TemplatesPanel: React.FC<TemplatesPanelProps> = ({ canEdit }) => {
  const { all, isLoading } = useOnboardingTemplates({ includeInactive: true });
  const { vesselName } = useCompanyVessels();
  const mutations = useOnboardingTemplateMutations();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<OnboardingTemplateRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const templates = useMemo(() => (showArchived ? all : all.filter((t) => t.is_active)), [all, showArchived]);
  const archivedCount = all.length - all.filter((t) => t.is_active).length;

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (t: OnboardingTemplateRow) => {
    setEditing(t);
    setEditorOpen(true);
  };
  const submit = async (payload: TemplatePayload) => {
    if (editing) await mutations.update.mutateAsync({ id: editing.id, payload });
    else await mutations.create.mutateAsync(payload);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" /> Onboarding templates</CardTitle>
          <CardDescription>Checklists exploded per joiner. A vessel-specific template wins over the company default.</CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1 shrink-0" onClick={openCreate}><Plus className="h-4 w-4" /> New template</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        ) : templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No templates yet. Create one so onboarding can be started for joiners.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {templates.map((t) => {
              const sections = parseTemplateSections(t.sections);
              const counts = countTemplateItems(sections);
              return (
                <li key={t.id} className={cn('flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between', !t.is_active && 'opacity-60')}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{t.name}</span>
                      {t.is_default && <Badge className="gap-1 text-[10px]"><Star className="h-3 w-3" /> Default</Badge>}
                      {!t.is_active && <Badge variant="outline" className="text-[10px]">Archived</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.vessel_id ? vesselName(t.vessel_id) ?? 'Vessel' : 'Any vessel'}
                      {t.applicable_departments.length > 0 && ` · ${t.applicable_departments.join(', ')}`}
                      {` · ${sections.length} section${sections.length === 1 ? '' : 's'}, ${counts.total} items (${counts.required} required)`}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      {t.is_active && !t.is_default && (
                        <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => mutations.setDefault.mutate(t.id)} disabled={mutations.setDefault.isPending}>
                          <Star className="h-3.5 w-3.5" /> Make default
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-xs"
                        onClick={() => mutations.setActive.mutate({ id: t.id, active: !t.is_active })}
                        disabled={mutations.setActive.isPending}
                      >
                        {t.is_active ? <><Archive className="h-3.5 w-3.5" /> Archive</> : <><ArchiveRestore className="h-3.5 w-3.5" /> Restore</>}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {archivedCount > 0 && (
          <Button variant="link" size="sm" className="px-0 text-xs" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : `Show ${archivedCount} archived`}
          </Button>
        )}
      </CardContent>

      <TemplateEditorDialog open={editorOpen} onOpenChange={setEditorOpen} template={editing} submitting={mutations.create.isPending || mutations.update.isPending} onSubmit={submit} />
    </Card>
  );
};

export default TemplatesPanel;
