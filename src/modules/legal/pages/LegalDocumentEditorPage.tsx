import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Archive, CheckCircle2, ClipboardList, GitBranch, PenLine, Save, Settings2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { PersonChip } from '@/modules/legal/components/PersonChip';
import { TemplateStatusBadge, VersionStatusBadge } from '@/modules/legal/components/badges';
import { MarkdownEditor } from '@/modules/legal/components/documents/MarkdownEditor';
import { VersionDiff } from '@/modules/legal/components/documents/VersionDiff';
import { FormBuilder } from '@/modules/legal/components/forms/FormBuilder';
import { SubmissionsTable } from '@/modules/legal/components/forms/SubmissionsTable';
import { SubmissionReviewSheet } from '@/modules/legal/components/forms/SubmissionReviewSheet';
import { useLegalDocument, useLegalDocuments, type LegalVersionRow } from '@/modules/legal/hooks/useLegalDocuments';
import { useDocumentVersions } from '@/modules/legal/hooks/useDocumentVersions';
import { useFormSubmissions, type LegalSubmissionRow } from '@/modules/legal/hooks/useFormSubmissions';
import { useLegalPeople, useLegalVessels } from '@/modules/legal/hooks/useLegalLookups';
import { categoryDef, DOCUMENT_CATEGORIES, TEMPLATE_DEPARTMENTS, TEMPLATE_STATUSES } from '@/modules/legal/lib/constants';
import { emptySchema, parseFormSchema, type FormSchema } from '@/modules/legal/lib/forms';
import { errorMessage } from '@/modules/legal/lib/storage';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const schemaJson = (s: FormSchema | null) => JSON.stringify(s ?? emptySchema());

const LegalDocumentEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const access = useLegalAccess();
  const template = useLegalDocument(id);
  const { updateTemplate } = useLegalDocuments({ enabled: false });
  const { versions, isLoading: versionsLoading, saveVersion, updateVersionContent, approveVersion } = useDocumentVersions(id);
  const { vessels } = useLegalVessels();
  const { people } = useLegalPeople();

  const row = template.data;
  const isForm = row?.document_type === 'form';
  const canEdit = !access.loading && access.canEdit;
  const submissions = useFormSubmissions(isForm ? id : null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [schema, setSchema] = useState<FormSchema>(emptySchema());
  const [compareId, setCompareId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [reviewing, setReviewing] = useState<LegalSubmissionRow | null>(null);

  const selected = useMemo<LegalVersionRow | null>(() => versions.find((v) => v.id === selectedId) ?? versions[0] ?? null, [versions, selectedId]);
  const approved = useMemo(() => versions.find((v) => v.status === 'approved') ?? null, [versions]);

  // Seed the editor from the selected version.
  useEffect(() => {
    if (!selected) return;
    setContent(selected.content ?? '');
    setSchema(parseFormSchema(selected.form_schema) ?? emptySchema(row?.name ?? ''));
  }, [selected?.id, selected?.content, selected?.form_schema, row?.name, selected]);

  const dirty = selected ? (isForm ? schemaJson(schema) !== schemaJson(parseFormSchema(selected.form_schema)) : content !== (selected.content ?? '')) : false;
  const selectedIsDraft = selected?.status === 'draft';
  const tab = params.get('tab') ?? 'content';
  const setTab = (t: string) => setParams((p) => {
    const next = new URLSearchParams(p);
    next.set('tab', t);
    return next;
  });

  const references = useMemo(
    () => ({ vessel: vessels.map((v) => ({ id: v.id, label: v.name })), crew: people.map((p) => ({ id: p.id, label: p.displayName })) }),
    [vessels, people],
  );

  const compareTarget = useMemo(() => versions.find((v) => v.id === compareId) ?? null, [versions, compareId]);
  const compareBase = approved && approved.id !== compareTarget?.id ? approved : versions.find((v) => v.id !== compareTarget?.id) ?? null;

  const saveDraft = async () => {
    if (!selected) return;
    await updateVersionContent.mutateAsync(isForm ? { versionId: selected.id, form_schema: schema } : { versionId: selected.id, content });
  };
  const saveAsNew = async () => {
    const created = await saveVersion.mutateAsync(isForm ? { content: '', form_schema: schema, change_summary: summary } : { content, form_schema: null, change_summary: summary });
    setSaveOpen(false);
    setSummary('');
    setSelectedId(created.id);
  };

  if (template.isLoading) {
    return (
      <LegalShell title="Loading document" backTo={{ label: 'Back to documents', path: LEGAL_PATHS.documents }}>
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-96 w-full" />
      </LegalShell>
    );
  }
  if (template.error || !row) {
    return (
      <LegalShell title="Document not found" backTo={{ label: 'Back to documents', path: LEGAL_PATHS.documents }}>
        <Alert variant="destructive">
          <AlertTitle>Could not open this document</AlertTitle>
          <AlertDescription>{template.error ? errorMessage(template.error) : 'It may have been deleted.'}</AlertDescription>
        </Alert>
      </LegalShell>
    );
  }

  const cat = categoryDef(row.category);
  const busy = saveVersion.isPending || updateVersionContent.isPending || approveVersion.isPending;

  return (
    <LegalShell
      title={row.name}
      description={`${cat.label} · ${row.department} · ${isForm ? 'Form' : 'Document template'} · v${row.current_version}`}
      backTo={{ label: 'Back to documents', path: LEGAL_PATHS.documents }}
      actions={
        <>
          {isForm && (approved || canEdit) && (
            <Button asChild variant="outline">
              <Link to={LEGAL_PATHS.formFill(row.id)}>
                <ClipboardList className="mr-2 h-4 w-4" /> Fill in
              </Link>
            </Button>
          )}
          {canEdit && selected && selectedIsDraft && (
            <Button variant="outline" onClick={saveDraft} disabled={busy || !dirty}>
              <Save className="mr-2 h-4 w-4" /> Save draft
            </Button>
          )}
          {canEdit && (
            <Button variant="outline" onClick={() => setSaveOpen(true)} disabled={busy}>
              <GitBranch className="mr-2 h-4 w-4" /> Save as new version
            </Button>
          )}
          {canEdit && selected && selectedIsDraft && (
            <Button onClick={() => approveVersion.mutate(selected.id)} disabled={busy || dirty} title={dirty ? 'Save the draft first' : undefined}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Approve v{selected.version_number}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <TemplateStatusBadge status={row.status} />
        {selected && (
          <>
            <span className="text-muted-foreground">Viewing</span>
            <Select value={selected.id} onValueChange={(v) => setSelectedId(v)}>
              <SelectTrigger className="h-8 w-52" aria-label="Version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version_number} · {v.status}
                    {v.change_summary ? ` · ${v.change_summary}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <VersionStatusBadge status={selected.status} />
            {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
          </>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="content">
            <PenLine className="mr-2 h-4 w-4" /> {isForm ? 'Builder' : 'Content'}
          </TabsTrigger>
          <TabsTrigger value="versions">
            <GitBranch className="mr-2 h-4 w-4" /> Versions
          </TabsTrigger>
          {isForm && (
            <TabsTrigger value="submissions">
              <ClipboardList className="mr-2 h-4 w-4" /> Submissions
            </TabsTrigger>
          )}
          {canEdit && (
            <TabsTrigger value="settings">
              <Settings2 className="mr-2 h-4 w-4" /> Settings
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="content" className="mt-4">
          {versionsLoading || !selected ? (
            <Skeleton className="h-96 w-full" />
          ) : isForm ? (
            canEdit && selectedIsDraft ? (
              <FormBuilder schema={schema} onChange={setSchema} references={references} />
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="mb-4 text-sm text-muted-foreground">
                    {selected.status === 'approved' ? 'Approved versions are read-only. Save as a new version to change the form.' : 'This version is read-only.'}
                  </p>
                  <FormBuilder schema={schema} onChange={() => undefined} references={references} disabled />
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {!selectedIsDraft && canEdit && <p className="mb-2 text-sm text-muted-foreground">Approved versions are read-only. Save as a new version to make changes.</p>}
              <MarkdownEditor value={content} onChange={setContent} readOnly={!canEdit || !selectedIsDraft} />
            </>
          )}
        </TabsContent>

        <TabsContent value="versions" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setCompareId(v.id)}
                        className={cn('flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/60', compareId === v.id && 'bg-muted')}
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Version {v.version_number}</span>
                          <VersionStatusBadge status={v.status} />
                        </span>
                        <span className="text-xs text-muted-foreground">{v.change_summary || 'No change summary'}</span>
                        <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <PersonChip userId={v.authored_by} emptyLabel="Unknown author" /> · {format(new Date(v.created_at), 'd MMM yyyy')}
                          {v.approved_at && ` · approved ${format(new Date(v.approved_at), 'd MMM yyyy')}`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <div>
              {!compareTarget ? (
                <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Select a version to compare it with the current {approved ? 'approved' : 'latest'} version.</div>
              ) : isForm ? (
                <VersionDiff
                  oldLabel={`v${compareTarget.version_number}`}
                  oldText={JSON.stringify(parseFormSchema(compareTarget.form_schema) ?? emptySchema(), null, 2)}
                  newLabel={compareBase ? `v${compareBase.version_number}` : 'current'}
                  newText={JSON.stringify(parseFormSchema(compareBase?.form_schema) ?? emptySchema(), null, 2)}
                />
              ) : (
                <VersionDiff
                  oldLabel={`v${compareTarget.version_number}`}
                  oldText={compareTarget.content ?? ''}
                  newLabel={compareBase ? `v${compareBase.version_number}` : 'current'}
                  newText={compareBase?.content ?? ''}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {isForm && (
          <TabsContent value="submissions" className="mt-4">
            <SubmissionsTable rows={submissions.submissions} templateName={() => row.name} isLoading={submissions.isLoading} onOpen={setReviewing} emptyText="No one has filled in this form yet." />
            <SubmissionReviewSheet
              submission={reviewing}
              templateName={row.name}
              onOpenChange={(o) => !o && setReviewing(null)}
              canReview={canEdit}
              onReview={async (args) => {
                await submissions.reviewSubmission.mutateAsync(args);
                setReviewing(null);
              }}
              isReviewing={submissions.reviewSubmission.isPending}
            />
          </TabsContent>
        )}

        {canEdit && (
          <TabsContent value="settings" className="mt-4">
            <TemplateSettings
              row={row}
              isPending={updateTemplate.isPending}
              onSave={(patch) => updateTemplate.mutateAsync({ id: row.id, patch })}
              onArchive={async () => {
                await updateTemplate.mutateAsync({ id: row.id, patch: { status: 'archived' } });
                navigate(LEGAL_PATHS.documents);
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as new version</DialogTitle>
            <DialogDescription>Creates version {(versions[0]?.version_number ?? 0) + 1} as a draft from what you see in the editor. Approve it to make it live.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="change-summary">What changed?</Label>
            <Textarea id="change-summary" value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="e.g. Updated governing law clause to Cayman Islands" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={saveVersion.isPending}>
              Cancel
            </Button>
            <Button onClick={saveAsNew} disabled={saveVersion.isPending || !summary.trim()}>
              {saveVersion.isPending ? 'Saving…' : 'Create version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LegalShell>
  );
};

const TemplateSettings: React.FC<{
  row: NonNullable<ReturnType<typeof useLegalDocument>['data']>;
  isPending: boolean;
  onSave: (patch: Partial<NonNullable<ReturnType<typeof useLegalDocument>['data']>>) => Promise<unknown>;
  onArchive: () => Promise<void>;
}> = ({ row, isPending, onSave, onArchive }) => {
  const [name, setName] = useState(row.name);
  const [category, setCategory] = useState(row.category);
  const [department, setDepartment] = useState(row.department);
  const [status, setStatus] = useState(row.status);
  const [description, setDescription] = useState(row.description ?? '');
  const [tags, setTags] = useState((row.tags ?? []).join(', '));
  const [gate, setGate] = useState(row.is_prerequisite_gate);
  const [validity, setValidity] = useState(row.validity_months?.toString() ?? '');
  const [linkedTable, setLinkedTable] = useState(row.linked_table ?? '');
  const [linkedKey, setLinkedKey] = useState(row.linked_data_key ?? '');

  const save = () =>
    onSave({
      name: name.trim() || row.name,
      category,
      department,
      status,
      description: description.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      is_prerequisite_gate: gate,
      validity_months: validity.trim() === '' ? null : Number(validity),
      linked_table: linkedTable.trim() || null,
      linked_data_key: linkedKey.trim() || null,
    });

  return (
    <Card>
      <CardContent className="grid gap-4 p-6 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="ts-name">Name</Label>
          <Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Department</Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger aria-label="Department">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_DEPARTMENTS.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLATE_STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Approving a version sets the template to Active automatically.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ts-validity">Re-sign every (months)</Label>
          <Input id="ts-validity" inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Never" />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="ts-description">Description</Label>
          <Textarea id="ts-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="ts-tags">Tags (comma separated)</Label>
          <Input id="ts-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ts-linked-table">Linked table</Label>
          <Input id="ts-linked-table" value={linkedTable} onChange={(e) => setLinkedTable(e.target.value)} placeholder="e.g. profiles" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ts-linked-key">Linked data key</Label>
          <Input id="ts-linked-key" value={linkedKey} onChange={(e) => setLinkedKey(e.target.value)} placeholder="e.g. id" />
        </div>
        <div className="flex items-center gap-2 md:col-span-2">
          <Switch id="ts-gate" checked={gate} onCheckedChange={setGate} />
          <Label htmlFor="ts-gate">Prerequisite gate: signing this is required before another part of the app unlocks</Label>
        </div>
        <div className="flex flex-wrap justify-between gap-2 md:col-span-2">
          <Button variant="outline" onClick={onArchive} disabled={isPending || row.status === 'archived'}>
            <Archive className="mr-2 h-4 w-4" /> Archive
          </Button>
          <Button onClick={save} disabled={isPending}>
            <Save className="mr-2 h-4 w-4" /> Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default LegalDocumentEditorPage;
