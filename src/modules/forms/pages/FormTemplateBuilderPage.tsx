/**
 * Fleet › Forms & Checklists › the template builder (`/fleet/forms/new?area=`,
 * `/fleet/forms/:templateId/edit`; gap/02 FC3, FC5, W2; DECISIONS C6, D-01,
 * D-04, D-X5-13, D-X5-20; X5 spec X5-06B).
 *
 * - Gates: `fleet.operations.fleet_checklists.create` for a new template,
 *   `.edit` for a draft (the route guards use the same keys). Nothing is
 *   read while the gate loads; denied is AccessDenied. Publishing needs
 *   `.admin` (the server's `form_template_gate`); without it the builder
 *   saves drafts and says an admin publishes them.
 * - The form (React Hook Form + zod, lib/templateSchema.ts): name, code
 *   (made from the name when blank), area (`?area=` preselects it), kind,
 *   cadence, description, signature on completion; all vessels including
 *   future ones (`FLEET`) or chosen vessels (`VESSEL_SPECIFIC` with the
 *   fleet filter's tick helpers); sections of items with type, Required,
 *   Comment box, Attachments, choices, and Add several.
 * - Save draft: a direct write the 040500 guard allows on drafts only (a
 *   new template is a company draft at version 1; an edit sends the
 *   `updated_at` it loaded and is refused if someone changed it since).
 *   The returned row is checked; a refused or empty write says why.
 * - Publish: the server's publish checks (lib/publishChecks.ts) run first,
 *   each problem with a way to its field; nothing is sent while one
 *   stands. Unsaved changes are saved, then `form_template_publish` with
 *   the version number typed (blank numbers it) and the `updated_at` just
 *   saved. A refusal is shown in words. Only while that definer is missing
 *   does today's publish write run instead (D-X5-20); a refusal never
 *   falls back.
 * - Preview: a sheet with what crews will see, unsaved changes included.
 * - A published, superseded or archived template is not edited in place:
 *   the page says so and offers the next version (or its open draft).
 * - D-01: without the catalogue columns, area, cadence and the signature
 *   cannot be saved (the fields say so); errors are PageError with Retry;
 *   an unknown template is the in-scope "Template not found".
 */
import React from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useFleetVesselsShown } from '@/modules/fleet';
import PageHeader from '@/shared/components/layout/PageHeader';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { AccessDenied, EmptyState, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { DetailsPanel, PublishDialog, TargetsPanel, type PublishProblem } from '../components/BuilderPanels';
import { SectionsEditor } from '../components/BuilderSections';
import { COARSE, FormsNotFound } from '../components/FormsParts';
import { TemplatePreview } from '../components/TemplatePreview';
import { useFormTemplateMutations } from '../hooks/useFormTemplateMutations';
import { codeEditable, useFormTemplateCatalogue, useFormTemplateDetail, useSaveTemplateDraft } from '../hooks/useFleetFormTemplates';
import { AREA_LABELS, FORM_KIND_LABELS } from '../lib/areaModel';
import { CADENCE_LABELS } from '../lib/cadence';
import { areaKeyFromSlug, areaKeySlug, plural, type CatalogueTemplate } from '../lib/catalogueModel';
import { formTemplateRefusal, versionDisplay } from '../lib/templateMachine';
import {
  builderIssues,
  emptyTemplateValues,
  itemCount,
  previewFields,
  suggestTemplateCode,
  templateFormSchema,
  valuesFromTemplate,
  type TemplateDetail,
  type TemplateFormValues,
} from '../lib/templateSchema';
import { FORMS_CAPS, FORMS_PARAMS, fleetFormsPath } from '../paths';

const FIX_FIELDS_FIRST = 'Some details need fixing first. Close this and check the fields marked in the form.';

const FormTemplateBuilderPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const access = useCapability(templateId ? FORMS_CAPS.edit : FORMS_CAPS.create);
  if (access.status === 'loading') return <PageLoading variant="detail" label="Loading the template builder" />;
  if (!access.allowed) {
    return <AccessDenied detail="Building templates needs fleet checklist editing. If you think you should have it, ask your account admin." />;
  }
  return templateId ? <EditTemplate key={templateId} templateId={templateId} /> : <NewTemplate />;
};

export default FormTemplateBuilderPage;

// ─── Entry points ───────────────────────────────────────────────────────

function NewTemplate() {
  const [params] = useSearchParams();
  const catalogue = useFormTemplateCatalogue();
  if (catalogue.status === 'loading') return <PageLoading variant="detail" label="Loading the template builder" />;
  if (catalogue.status === 'error') return <PageError error={catalogue.error} title="The builder could not load" onRetry={catalogue.retry} treatMissingAsOff={false} />;
  const area = areaKeyFromSlug(params.get(FORMS_PARAMS.area));
  return <Builder template={null} areasSetUp={catalogue.areasSetUp} initialArea={area} usedCodes={catalogue.templates.map((t) => t.code)} />;
}

function EditTemplate({ templateId }: { templateId: string }) {
  const detail = useFormTemplateDetail(templateId);
  const catalogue = useFormTemplateCatalogue();
  if (detail.status === 'loading' || catalogue.status === 'loading') return <PageLoading variant="detail" label="Loading the template" />;
  if (detail.status === 'not_found') {
    return <FormsNotFound title="Template not found" body="There is no template at this address, or it is a draft you cannot see." />;
  }
  if (detail.status === 'error') return <PageError error={detail.error} title="The template could not be loaded" onRetry={detail.retry} treatMissingAsOff={false} />;
  if (catalogue.status === 'error') return <PageError error={catalogue.error} title="The templates could not be loaded" onRetry={catalogue.retry} treatMissingAsOff={false} />;
  const template = detail.template;
  const family = catalogue.templates.filter((t) => t.code === template.code);
  if (template.status !== 'DRAFT') return <NotADraft template={template} family={family} />;
  return <Builder template={template} areasSetUp={detail.areasSetUp} initialArea={template.area} usedCodes={catalogue.templates.map((t) => t.code)} />;
}

/** A published, superseded or archived template: changed by a new version, never in place. */
function NotADraft({ template, family }: { template: TemplateDetail; family: CatalogueTemplate[] }) {
  usePageLocationOverride({ title: template.name, crumbs: 'page' });
  const navigate = useNavigate();
  const canAdmin = useCan(FORMS_CAPS.admin);
  const mutations = useFormTemplateMutations();
  const draft = family.find((t) => t.status === 'DRAFT');
  const current = family.find((t) => t.status === 'PUBLISHED');
  const status = template.status;
  const body =
    status === 'PUBLISHED'
      ? 'A published template is changed by starting its next version. The published version keeps running until the new one is published.'
      : status === 'SUPERSEDED'
        ? 'This is an older version, kept for the runs that used it.'
        : 'This template is archived. Starting a new version brings it back as a draft.';
  const canVersion = canAdmin && !draft && template.origin !== 'platform' && (status === 'PUBLISHED' || status === 'ARCHIVED');
  return (
    <EmptyState
      headingLevel={1}
      title={`${template.name} is ${status === 'PUBLISHED' ? 'published' : status === 'SUPERSEDED' ? 'an older version' : 'archived'}`}
      body={body}
      action={
        <span className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm" className={COARSE}>
            <Link to={fleetFormsPath.preview(template.id)}>Preview</Link>
          </Button>
          {draft ? (
            <Button asChild size="sm" className={COARSE}>
              <Link to={fleetFormsPath.edit(draft.id)}>{`Open the draft of v${draft.version}`}</Link>
            </Button>
          ) : null}
          {!draft && status === 'SUPERSEDED' && current ? (
            <Button asChild size="sm" className={COARSE}>
              <Link to={fleetFormsPath.edit(current.id)}>Go to the current version</Link>
            </Button>
          ) : null}
          {canVersion ? (
            <Button
              type="button"
              size="sm"
              className={COARSE}
              disabled={mutations.newVersion.isPending}
              onClick={() => mutations.newVersion.mutateAsync(template.id).then((row) => navigate(fleetFormsPath.edit(row.id)), () => undefined)}
            >
              Edit as a new version
            </Button>
          ) : null}
        </span>
      }
    />
  );
}

// ─── The builder ────────────────────────────────────────────────────────

interface BuilderProps {
  template: TemplateDetail | null;
  areasSetUp: boolean;
  initialArea: CatalogueTemplate['area'] | undefined;
  usedCodes: readonly string[];
}

function Builder({ template, areasSetUp, initialArea, usedCodes }: BuilderProps) {
  const navigate = useNavigate();
  const canAdmin = useCan(FORMS_CAPS.admin);
  const fleet = useFleetVesselsShown();
  const save = useSaveTemplateDraft();
  const mutations = useFormTemplateMutations();
  const defaults = React.useMemo(() => (template ? valuesFromTemplate(template) : emptyTemplateValues(initialArea)), [template, initialArea]);
  const form = useForm<TemplateFormValues>({ resolver: zodResolver(templateFormSchema({ areasSetUp })), defaultValues: defaults, mode: 'onSubmit' });
  const updatedAtRef = React.useRef<string | null>(template?.updatedAt ?? null);
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [showIssues, setShowIssues] = React.useState(false);

  const values = useWatch({ control: form.control }) as TemplateFormValues;
  const name = values.name ?? '';
  const title = template ? name.trim() || template.name : name.trim() || 'New template';
  usePageLocationOverride({ title: template ? title : 'New template', crumbs: 'page' });

  const issues = builderIssues({ name, sections: values.sections ?? [], vesselScope: values.vesselScope, vesselIds: values.vesselIds ?? [] });
  const issueKeys = new Set(showIssues ? issues.flatMap((i) => (i.key ? [i.key] : [])) : []);
  const editableCode = codeEditable(template);
  const suggestion = suggestTemplateCode(name, values.area ?? '', usedCodes.filter((c) => c !== template?.code));
  const dirty = form.formState.isDirty;
  const saving = save.isPending;
  const nextVersion = template ? `v${template.version}` : 'v1';
  const kind = values.kind ?? 'checklist';
  const vessels = fleet.status === 'ready' ? fleet.vessels : null;
  const targetsText =
    values.vesselScope === 'FLEET'
      ? 'Offered on every vessel, including ones added later'
      : `Offered on ${plural((values.vesselIds ?? []).length, 'chosen vessel')}`;

  // A reload or a closed tab loses unsaved changes: the browser asks first.
  React.useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  /** Save the draft; resolves with its id and `updated_at`, or rejects (already toasted). */
  const saveDraft = async (current: TemplateFormValues): Promise<{ id: string; updatedAt: string | null }> => {
    const saved = await save.mutateAsync({
      templateId: template?.id ?? null,
      values: current,
      areasSetUp,
      current: template,
      expectedUpdatedAt: updatedAtRef.current,
      usedCodes,
    });
    updatedAtRef.current = saved.updatedAt;
    form.reset(current.code.trim() || !editableCode ? current : { ...current, code: saved.code });
    return { id: saved.id, updatedAt: saved.updatedAt };
  };

  const onSaveDraft = form.handleSubmit(async (current) => {
    try {
      const saved = await saveDraft(current);
      if (!template) navigate(fleetFormsPath.edit(saved.id), { replace: true });
    } catch {
      // Toasted by the save hook; the form keeps the changes.
    }
  });

  const openPublish = () => {
    setShowIssues(true);
    void form.trigger();
    setPublishOpen(true);
  };

  const publish = async (versionLabel: string | null) => {
    if (!(await form.trigger())) throw new Error(FIX_FIELDS_FIRST);
    const current = form.getValues();
    let id = template?.id ?? null;
    let expected = updatedAtRef.current;
    if (!id || form.formState.isDirty) {
      const saved = await saveDraft(current);
      id = saved.id;
      expected = saved.updatedAt;
    }
    await mutations.publish.mutateAsync({ templateId: id as string, versionLabel, expectedUpdatedAt: expected });
    setPublishOpen(false);
    const area = current.area === '' ? null : current.area;
    navigate(fleetFormsPath.area(areaKeySlug(areasSetUp ? area : null)), { replace: true });
  };

  const focusIssue = (key: string | null, code: string) => {
    if (code === 'name_required') return form.setFocus('name');
    if (code === 'targets_required') return document.getElementById('targets-chosen')?.focus();
    if (code === 'no_section') return document.querySelector<HTMLElement>('[data-section-key] input')?.focus();
    if (key) {
      const el = document.getElementById(`item-${key}`) ?? document.getElementById(`section-${key}`);
      el?.scrollIntoView({ block: 'center' });
      el?.focus();
    }
  };
  const problems: PublishProblem[] = issues.map((issue, i) => ({
    key: `${issue.code}-${issue.key ?? i}`,
    sentence: formTemplateRefusal(issue.code) ?? issue.code,
    onShow: () => focusIssue(issue.key, issue.code),
  }));

  const facts = [
    values.area ? AREA_LABELS[values.area] : null,
    FORM_KIND_LABELS[kind],
    template ? versionDisplay({ version: template.version, version_label: template.versionLabel }) : 'v1',
    values.cadence && values.cadence !== 'none' ? CADENCE_LABELS[values.cadence] : null,
  ].filter((f): f is string => !!f);

  const actions = (
    <>
      <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => setPreviewOpen(true)}>
        <Eye aria-hidden="true" className="h-4 w-4" />
        Preview
      </Button>
      <Button type="button" variant={canAdmin ? 'outline' : 'default'} size="sm" className={COARSE} onClick={() => void onSaveDraft()} disabled={saving || (!dirty && !!template)}>
        <Save aria-hidden="true" className="h-4 w-4" />
        {saving ? 'Saving…' : dirty || !template ? 'Save draft' : 'Saved'}
      </Button>
      {canAdmin ? (
        <Button type="button" size="sm" className={COARSE} onClick={openPublish} disabled={saving}>
          <Send aria-hidden="true" className="h-4 w-4" />
          Publish
        </Button>
      ) : null}
    </>
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={(e) => e.preventDefault()} noValidate className="mx-auto max-w-4xl space-y-4">
        <PageHeader
          eyebrow={
            <Link to={fleetFormsPath.index()} className="hover:text-foreground hover:underline">
              Forms & Checklists
            </Link>
          }
          title={title}
          description={template ? (template.supersedesTemplateId ? `Draft of the next version (v${template.version}).` : 'A draft: crews do not see it until it is published.') : 'Build the form or checklist crews fill in on board.'}
          actions={actions}
        >
          <span className="mt-2 flex flex-wrap items-center gap-2">
            <StatusPill domain="form_template" status="draft" />
            {dirty ? <span className="type-caption text-muted-foreground">Unsaved changes</span> : null}
          </span>
        </PageHeader>

        {!canAdmin ? (
          <p role="note" className="rounded-md border border-border bg-muted/40 px-3 py-2 type-body-sm text-muted-foreground">
            You can build and save drafts. A fleet checklist admin publishes them to the vessels.
          </p>
        ) : null}

        <DetailsPanel areasSetUp={areasSetUp} codeEditable={editableCode} codeSuggestion={suggestion} disabled={saving} />
        <TargetsPanel
          vessels={vessels}
          fleetGroups={fleet.status === 'ready' ? fleet.fleetGroups : []}
          vesselsError={fleet.status === 'error' ? fleet.error.message : null}
          flagged={showIssues && issues.some((i) => i.code === 'targets_required')}
          disabled={saving}
        />

        <section aria-labelledby="template-sections-title" className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="template-sections-title" className="font-display text-base font-semibold text-foreground">
                Sections and items
              </h2>
              <p className="type-body-sm text-muted-foreground">{`${plural(itemCount(values.sections ?? []), 'item')} in ${plural((values.sections ?? []).length, 'section')}.`}</p>
            </div>
            {issues.length ? (
              <p className="type-body-sm text-muted-foreground" data-testid="builder-readiness">
                {`${plural(issues.length, 'thing')} to fix before publishing`}
              </p>
            ) : (
              <p className="type-body-sm text-success" data-testid="builder-readiness">
                Ready to publish
              </p>
            )}
          </div>
          <SectionsEditor kind={kind} disabled={saving} issueKeys={issueKeys} />
        </section>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">{actions}</div>
      </form>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        problems={problems}
        nextVersion={nextVersion}
        targets={targetsText}
        willSave={dirty || !template}
        onPublish={publish}
      />

      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl" aria-describedby="builder-preview-description">
          <SheetHeader>
            <SheetTitle>Preview</SheetTitle>
            <SheetDescription id="builder-preview-description">What crews will see, with your unsaved changes.</SheetDescription>
          </SheetHeader>
          <TemplatePreview
            className="mt-4"
            name={name.trim()}
            description={values.description}
            facts={facts}
            fields={previewFields({ sections: values.sections ?? [] })}
            requiresSignature={!!values.requiresSignature}
            targets={targetsText}
          />
        </SheetContent>
      </Sheet>
    </FormProvider>
  );
}
