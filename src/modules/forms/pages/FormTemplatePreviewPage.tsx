/**
 * Fleet › Forms & Checklists › one template's preview
 * (`/fleet/forms/:templateId/preview`; gap/02 FC3 "Preview", W2; X5 spec
 * X5-06B): what crews will see, drawn by the form renderer a run uses,
 * with the template's facts (area, kind, version, cadence, status, where it
 * applies, origin).
 *
 * - Gate `fleet.operations.fleet_checklists.view`; nothing is read while
 *   it loads, denied is AccessDenied; an unknown or unreadable template is
 *   the in-scope "Template not found".
 * - Actions by status and rights: a draft opens in the builder (edit); a
 *   published template offers its next version (or its open draft) and,
 *   for admins, Customise; the area page is one link away.
 * - D-01: without the catalogue columns the facts say "Unsorted" and leave
 *   out what is not stored yet. Errors are PageError with Retry.
 */
import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Copy, FilePen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCan, useCapability } from '@/lib/permissions/useCan';
import { useFleetVesselsShown } from '@/modules/fleet';
import PageHeader from '@/shared/components/layout/PageHeader';
import { usePageLocationOverride } from '@/shared/components/layout/pageLocationOverride';
import { AccessDenied, PageError, PageLoading } from '@/shared/components/states';
import { StatusPill } from '@/shared/components/status';
import { COARSE, FormsNotFound, OriginChip } from '../components/FormsParts';
import { TemplatePreview } from '../components/TemplatePreview';
import { useFormTemplateMutations } from '../hooks/useFormTemplateMutations';
import { useFormTemplateCatalogue, useFormTemplateDetail } from '../hooks/useFleetFormTemplates';
import { FORM_KIND_LABELS } from '../lib/areaModel';
import { CADENCE_LABELS } from '../lib/cadence';
import { areaKeyLabel, areaKeySlug, plural } from '../lib/catalogueModel';
import { versionDisplay } from '../lib/templateMachine';
import { kindOfFormType, type TemplateDetail } from '../lib/templateSchema';
import { FORMS_CAPS, fleetFormsPath } from '../paths';

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const FormTemplatePreviewPage: React.FC = () => {
  const { templateId } = useParams<{ templateId: string }>();
  const access = useCapability(FORMS_CAPS.view);
  if (access.status === 'loading') return <PageLoading variant="detail" label="Loading the preview" />;
  if (!access.allowed) {
    return <AccessDenied detail="Forms & Checklists needs fleet checklist access. If you think you should see it, ask your account admin." />;
  }
  return <PreviewBody key={templateId} templateId={templateId ?? ''} />;
};

export default FormTemplatePreviewPage;

function PreviewBody({ templateId }: { templateId: string }) {
  const detail = useFormTemplateDetail(templateId || null);
  if (detail.status === 'loading') return <PageLoading variant="detail" label="Loading the preview" />;
  if (detail.status === 'not_found') {
    return <FormsNotFound title="Template not found" body="There is no template at this address, or it is a draft you cannot see." />;
  }
  if (detail.status === 'error') return <PageError error={detail.error} title="The template could not be loaded" onRetry={detail.retry} treatMissingAsOff={false} />;
  return <Preview template={detail.template} areasSetUp={detail.areasSetUp} />;
}

function Preview({ template, areasSetUp }: { template: TemplateDetail; areasSetUp: boolean }) {
  usePageLocationOverride({ title: template.name, crumbs: 'page' });
  const navigate = useNavigate();
  const canEdit = useCan(FORMS_CAPS.edit);
  const canAdmin = useCan(FORMS_CAPS.admin);
  const catalogue = useFormTemplateCatalogue();
  const fleet = useFleetVesselsShown();
  const mutations = useFormTemplateMutations();
  const family = catalogue.status === 'ready' ? catalogue.templates.filter((t) => t.code === template.code) : [];
  const draft = family.find((t) => t.status === 'DRAFT' && t.id !== template.id);
  const fields = isObject(template.formSchema) && Array.isArray(template.formSchema.fields) ? template.formSchema.fields : [];
  const kind = template.kind ?? kindOfFormType(template.formType);
  const facts = [
    areaKeyLabel(template.area),
    FORM_KIND_LABELS[kind],
    versionDisplay({ version: template.version, version_label: template.versionLabel }),
    template.cadence && template.cadence !== 'none' ? CADENCE_LABELS[template.cadence] : null,
  ].filter((f): f is string => !!f);
  const vesselNames =
    fleet.status === 'ready' ? template.vesselIds.map((id) => fleet.vessels.find((v) => v.id === id)?.name).filter((n): n is string => !!n) : [];
  const targets =
    template.vesselScope === 'FLEET'
      ? 'Offered on every vessel, including ones added later.'
      : vesselNames.length
        ? `Offered on ${vesselNames.join(', ')}.`
        : `Offered on ${plural(template.vesselIds.length, 'chosen vessel')}.`;
  const areaHref = fleetFormsPath.area(areaKeySlug(areasSetUp ? template.area : null));

  const customise = () => mutations.customise.mutateAsync(template.id).then((row) => navigate(fleetFormsPath.edit(row.id)), () => undefined);
  const startVersion = () => mutations.newVersion.mutateAsync(template.id).then((row) => navigate(fleetFormsPath.edit(row.id)), () => undefined);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        eyebrow={
          <Link to={areaHref} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
            <ArrowLeft aria-hidden="true" className="h-3 w-3" />
            {areaKeyLabel(areasSetUp ? template.area : null)}
          </Link>
        }
        title={template.name}
        reference={template.code || undefined}
        description="What crews see when they open it on board."
        actions={
          <>
            {template.status === 'DRAFT' && canEdit ? (
              <Button asChild size="sm" className={COARSE}>
                <Link to={fleetFormsPath.edit(template.id)}>
                  <FilePen aria-hidden="true" className="h-4 w-4" />
                  Edit draft
                </Link>
              </Button>
            ) : null}
            {template.status === 'PUBLISHED' && canAdmin && areasSetUp ? (
              <Button type="button" variant="outline" size="sm" className={COARSE} onClick={() => void customise()} disabled={mutations.customise.isPending}>
                <Copy aria-hidden="true" className="h-4 w-4" />
                Customise
              </Button>
            ) : null}
            {template.status !== 'DRAFT' && canAdmin && draft ? (
              <Button asChild size="sm" className={COARSE}>
                <Link to={fleetFormsPath.edit(draft.id)}>{`Open the draft of v${draft.version}`}</Link>
              </Button>
            ) : null}
            {(template.status === 'PUBLISHED' || template.status === 'ARCHIVED') && canAdmin && !draft && template.origin !== 'platform' ? (
              <Button type="button" size="sm" className={COARSE} onClick={() => void startVersion()} disabled={mutations.newVersion.isPending}>
                <FilePen aria-hidden="true" className="h-4 w-4" />
                Edit as a new version
              </Button>
            ) : null}
          </>
        }
      >
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill domain="form_template" status={template.status.toLowerCase()} />
          {areasSetUp ? <OriginChip template={template} /> : null}
        </span>
      </PageHeader>
      <div className="rounded-lg border border-border bg-card p-4 sm:p-6">
        <TemplatePreview name={template.name} description={template.description} facts={facts} fields={fields} requiresSignature={template.requiresSignature} targets={targets} />
      </div>
    </div>
  );
}
