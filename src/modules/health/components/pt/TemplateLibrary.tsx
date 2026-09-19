import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ClipboardList,
  Copy,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { HealthEmpty, HealthError, HealthLoading } from '@/modules/health/components/HealthStates';
import { AssignProgramDialog } from '@/modules/health/components/pt/AssignProgramDialog';
import { TemplateBuilder } from '@/modules/health/components/pt/TemplateBuilder';
import { TemplateFormDialog } from '@/modules/health/components/pt/TemplateFormDialog';
import { Fact } from '@/modules/health/components/pt/PtCommon';
import {
  bodyRegionLabel,
  difficultyLabel,
  rehabStageLabel,
  TEMPLATE_CATEGORIES,
  TEMPLATE_STATUSES,
  templateCategoryLabel,
  templateStatusLabel,
  useProgramTemplates,
  type PtTemplateEntry,
} from '@/modules/health/hooks/usePtLibrary';
import { formatDate } from '@/modules/health/lib/format';

interface TemplateLibraryProps {
  /** Rehabilitation protocols are the same table with `is_rehab` set. */
  rehab?: boolean;
  canEdit: boolean;
  /** Rendered above the list, for the page's own stat tiles. */
  children?: React.ReactNode;
}

const statusTone = (status: string): string =>
  status === 'active'
    ? 'bg-success/10 text-success border-success/20'
    : status === 'archived'
      ? 'bg-muted text-muted-foreground border-border'
      : 'bg-warning/10 text-warning border-warning/20';

/**
 * The template library and its builder. Shared by PT programming and the
 * Physiotherapy rehab protocols route, so nothing here assumes a PT reader.
 */
export const TemplateLibrary: React.FC<TemplateLibraryProps> = ({ rehab = false, canEdit, children }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PtTemplateEntry | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleting, setDeleting] = useState<PtTemplateEntry | null>(null);

  const library = useProgramTemplates({
    rehabOnly: rehab,
    search,
    category: category === 'all' ? null : category,
    status: status === 'all' ? null : status,
    includeInactive: true,
  });

  const templates = library.templates;
  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  useEffect(() => {
    if (!selectedId && templates.length) setSelectedId(templates[0].id);
  }, [selectedId, templates]);

  const noun = rehab ? 'protocol' : 'template';

  return (
    <div className="space-y-4">
      {children}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${noun}s`}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any category</SelectItem>
                {TEMPLATE_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any status</SelectItem>
                {TEMPLATE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {canEdit && (
            <Button
              className="w-full"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New {noun}
            </Button>
          )}

          {library.isLoading ? (
            <HealthLoading rows={3} />
          ) : library.isError ? (
            <HealthError error={library.error} title={`Could not load the ${noun}s`} />
          ) : templates.length === 0 ? (
            <HealthEmpty
              icon={ClipboardList}
              title={`No ${noun}s yet`}
              description={
                canEdit
                  ? `Create a ${noun}, add the weeks and days, then publish it so it can be assigned.`
                  : `Nothing has been published yet. A trainer or physiotherapist needs to build the first ${noun}.`
              }
            />
          ) : (
            <ScrollArea className="max-h-[32rem] rounded-md border">
              <ul className="divide-y">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(template.id)}
                      className={cn(
                        'w-full px-3 py-3 text-left transition-colors hover:bg-accent/50',
                        template.id === selectedId && 'bg-accent',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {template.name}
                        </span>
                        <Badge variant="outline" className={cn('shrink-0 text-[10px]', statusTone(template.status))}>
                          {templateStatusLabel(template.status)}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {[
                          templateCategoryLabel(template.category),
                          `${template.duration_weeks} weeks`,
                          `${template.dayCount} sessions`,
                        ].join(' · ')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </div>

        <div>
          {!selected ? (
            <HealthEmpty
              icon={ClipboardList}
              title={`Choose a ${noun}`}
              description={`Pick one from the list to see its weeks and edit the sessions inside it.`}
            />
          ) : (
            <Card>
              <CardHeader className="gap-3 pb-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">{selected.name}</CardTitle>
                    <CardDescription>
                      {selected.description || selected.goals || 'No description yet.'}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(selected);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            library.duplicate.mutate(selected.id, {
                              onSuccess: (newId) => setSelectedId(newId),
                            })
                          }
                          disabled={library.duplicate.isPending}
                        >
                          <Copy className="mr-1.5 h-4 w-4" />
                          Duplicate
                        </Button>
                        {selected.status === 'active' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => library.setStatus.mutate({ id: selected.id, status: 'archived' })}
                          >
                            <Archive className="mr-1.5 h-4 w-4" />
                            Archive
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => library.setStatus.mutate({ id: selected.id, status: 'active' })}
                          >
                            <Upload className="mr-1.5 h-4 w-4" />
                            Publish
                          </Button>
                        )}
                        <Button size="sm" onClick={() => setAssignOpen(true)} disabled={selected.status !== 'active'}>
                          <Send className="mr-1.5 h-4 w-4" />
                          Assign
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleting(selected)}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Fact label="Weeks" value={selected.duration_weeks} />
                  <Fact label="Sessions each week" value={selected.sessions_per_week} />
                  <Fact label="Difficulty" value={difficultyLabel(selected.difficulty)} />
                  <Fact label="Updated" value={formatDate(selected.updated_at)} />
                  {(rehab || selected.is_rehab) && (
                    <>
                      <Fact label="Body region" value={bodyRegionLabel(selected.body_region)} />
                      <Fact label="Stage" value={rehabStageLabel(selected.stage)} />
                    </>
                  )}
                  {selected.equipment_needed && (
                    <Fact label="Equipment" value={selected.equipment_needed} className="col-span-2" />
                  )}
                </div>

                {(rehab || selected.is_rehab) && selected.clinical_notes && (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Clinical notes</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                      {selected.clinical_notes}
                    </p>
                  </div>
                )}
              </CardHeader>

              <CardContent>
                <TemplateBuilder
                  templateId={selected.id}
                  durationWeeks={selected.duration_weeks}
                  canEdit={canEdit}
                  rehab={rehab || selected.is_rehab}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <TemplateFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        template={editing}
        rehab={rehab}
        saving={library.save.isPending}
        onSave={(values) =>
          library.save.mutate(values, {
            onSuccess: (id) => {
              setSelectedId(id);
              setFormOpen(false);
            },
          })
        }
      />

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its weeks and days go with it. Programmes already assigned keep their own copy and are
              not affected. Archive it instead if you only want it out of the way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) library.remove.mutate(deleting.id, { onSuccess: () => setSelectedId(null) });
                setDeleting(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AssignProgramDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        templateId={selected?.id ?? null}
        rehab={rehab}
      />
    </div>
  );
};

export default TemplateLibrary;
