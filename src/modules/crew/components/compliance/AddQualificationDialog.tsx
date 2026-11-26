import React from 'react';
import { useForm, type FieldPath } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight, Info, Loader2, Plus, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { notify } from '@/shared/lib/notify';
import { useDocumentTypes, type DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import {
  complianceRefusalField,
  complianceRefusalMessage,
  useRequirementsConfigActions,
  type RequirementsConfig,
} from '@/modules/crew/hooks/useRequirementsConfig';
import { CATALOGUE_MISSING_NOTICE } from '@/modules/crew/lib/crewDocumentSchema';
import { REQUIREMENT_GROUP_LABEL, requirementGroupForCategory } from '@/modules/crew/lib/compliance';
import {
  DOCUMENT_REQUIREMENT_GROUPS,
  MAX_REQUIREMENT_OPTIONS,
  REQUIREMENT_LABEL_MAX,
  companyDocumentTypeSchema,
  requirementRowSchema,
  toRequirementRowPayload,
  type CompanyDocumentTypeValues,
  type RequirementRowValues,
} from '@/modules/crew/lib/complianceModel';
import { DocumentTypeCombobox } from './DocumentTypeCombobox';
import { typeDetail } from './cellLook';
import { Segmented } from './Segmented';

const COARSE = '[@media(pointer:coarse)]:h-11';

/** The server's HINT field names for a refused row, as the form's fields. */
const ROW_FIELD: Readonly<Record<string, FieldPath<RequirementRowValues>>> = {
  label: 'label',
  group_key: 'groupKey',
  options: 'optionIds',
  kind: 'kind',
};
const TYPE_FIELD: Readonly<Record<string, FieldPath<CompanyDocumentTypeValues>>> = {
  category_key: 'categoryKey',
  name: 'name',
  code: 'code',
  abbreviation: 'abbreviation',
  default_validity_months: 'defaultValidityMonths',
};

export interface AddQualificationDialogProps {
  config: RequirementsConfig;
  vesselName: string;
  onOpenChange: (open: boolean) => void;
}

/**
 * Add a requirement to the vessel (gap/04 C33, C36): one or more document
 * types (any one satisfies it, and the satisfaction rules add theirs) or
 * familiarisations, a name and a group, and whether every listed position
 * requires it at once (else tick positions in the matrix). A company-wide
 * administrator can add a company document type here when the catalogue has
 * none for it. React Hook Form + zod (lib/complianceModel.ts); the server's
 * refusal lands on the field it names.
 */
export const AddQualificationDialog: React.FC<AddQualificationDialogProps> = ({ config, vesselName, onOpenChange }) => {
  const catalogue = useDocumentTypes(config.companyId);
  const { saveRow, createDocumentType } = useRequirementsConfigActions(config.companyId, config.vesselId);
  const listed = React.useMemo(() => config.positions.filter((p) => p.isListed).map((p) => p.positionId), [config.positions]);
  const templates = React.useMemo(() => config.templates.filter((t) => t.isActive), [config.templates]);
  const [labelTouched, setLabelTouched] = React.useState(false);
  const [created, setCreated] = React.useState<Map<string, DocumentType>>(() => new Map());
  const [newTypeOpen, setNewTypeOpen] = React.useState(false);
  const [rootError, setRootError] = React.useState<string | null>(null);

  const form = useForm<RequirementRowValues>({
    resolver: zodResolver(requirementRowSchema),
    defaultValues: { kind: 'document', groupKey: 'custom', label: '', optionIds: [], requireAll: listed.length > 0 },
  });
  const kind = form.watch('kind');
  const optionIds = form.watch('optionIds');
  const saving = form.formState.isSubmitting;
  const cat = catalogue.status === 'ready' ? catalogue.catalogue : null;
  const typeOf = (id: string) => cat?.byId.get(id) ?? created.get(id) ?? null;

  const setKind = (next: 'document' | 'familiarisation') => {
    if (next === kind) return;
    form.setValue('kind', next);
    form.setValue('optionIds', []);
    form.setValue('groupKey', next === 'familiarisation' ? 'familiarisation' : 'custom');
    if (!labelTouched) form.setValue('label', '');
    form.clearErrors();
  };

  const addOption = (id: string, name: string, groupFrom?: string | null) => {
    const current = form.getValues('optionIds');
    if (current.includes(id) || current.length >= MAX_REQUIREMENT_OPTIONS) return;
    form.setValue('optionIds', [...current, id], { shouldValidate: form.formState.isSubmitted });
    if (current.length === 0) {
      if (!labelTouched) form.setValue('label', name.slice(0, REQUIREMENT_LABEL_MAX));
      if (kind === 'document') form.setValue('groupKey', requirementGroupForCategory(groupFrom ?? null));
    }
  };
  const removeOption = (id: string) => form.setValue('optionIds', form.getValues('optionIds').filter((o) => o !== id));

  const submit = form.handleSubmit(async (values) => {
    setRootError(null);
    try {
      const row = await saveRow.mutateAsync({ vesselId: config.vesselId, rowId: null, payload: toRequirementRowPayload(values, listed) });
      notify.success(`${row.label} added`, {
        description: values.requireAll ? `Required for the ${listed.length} listed positions on ${vesselName}.` : 'Tick the positions that need it in the matrix.',
      });
      onOpenChange(false);
    } catch (error) {
      const field = complianceRefusalField(error);
      const message = complianceRefusalMessage(error);
      if (field && ROW_FIELD[field]) form.setError(ROW_FIELD[field], { message }, { shouldFocus: true });
      else setRootError(message);
    }
  });

  const close = (open: boolean) => {
    if (!open && saving) return;
    onOpenChange(open);
  };

  let options: React.ReactNode;
  if (kind === 'familiarisation') {
    options =
      templates.length === 0 ? (
        <p className="type-caption text-muted-foreground">No familiarisations are set up for this vessel yet. Add them on the Familiarisation page first.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2" aria-label="Familiarisations">
          {templates.map((t) => {
            const checked = optionIds.includes(t.id);
            const id = `fam-${t.id}`;
            return (
              <li key={t.id} className="flex items-center gap-2 [@media(pointer:coarse)]:min-h-11">
                <Checkbox id={id} checked={checked} onCheckedChange={(v) => (v ? addOption(t.id, t.name) : removeOption(t.id))} />
                <Label htmlFor={id} className="font-normal">
                  {t.name || 'Unnamed familiarisation'}
                </Label>
              </li>
            );
          })}
        </ul>
      );
  } else if (catalogue.status === 'idle' || catalogue.status === 'loading') {
    options = <Skeleton className="h-10 w-full" aria-label="Loading the document types" />;
  } else if (catalogue.status === 'not_set_up') {
    options = (
      <Alert variant="info">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription>{CATALOGUE_MISSING_NOTICE}</AlertDescription>
      </Alert>
    );
  } else if (catalogue.status === 'error') {
    options = <PageError variant="inline" error={catalogue.error} onRetry={catalogue.retry} title="The document types could not load" treatMissingAsOff={false} headingLevel={4} />;
  } else if (cat) {
    options = (
      <DocumentTypeCombobox
        catalogue={cat}
        value={null}
        onChange={(t) => addOption(t.id, t.name, t.categoryKey)}
        label="Add a document type that satisfies it"
        placeholder={optionIds.length ? 'Add another option' : 'Choose a document type'}
        exclude={new Set(optionIds)}
        disabled={optionIds.length >= MAX_REQUIREMENT_OPTIONS}
      />
    );
  }

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent
        className="flex max-h-[min(92dvh,52rem)] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        data-add-qualification-dialog=""
        onInteractOutside={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="type-title">Add a requirement</DialogTitle>
          <DialogDescription>
            What a position on {vesselName} must hold. Any one of its options satisfies it, and so does every document a satisfaction rule lets count
            for one of them.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col" aria-label="Add a requirement">
            <fieldset disabled={saving} className="min-h-0 flex-1 space-y-5 overflow-y-auto border-0 px-4 py-4 sm:px-6">
              <legend className="sr-only">The requirement</legend>
              <div className="space-y-1.5">
                <p className="type-body-sm font-medium text-foreground" id="requirement-kind">
                  Met by
                </p>
                <Segmented
                  label="Met by"
                  value={kind}
                  options={[
                    { value: 'document', label: 'A document' },
                    { value: 'familiarisation', label: 'A familiarisation' },
                  ]}
                  onChange={setKind}
                />
              </div>

              <FormField
                control={form.control}
                name="optionIds"
                render={() => (
                  <FormItem>
                    <FormLabel>{kind === 'document' ? 'Document types (any one satisfies it)' : 'Familiarisations (any one satisfies it)'}</FormLabel>
                    {kind === 'document' && optionIds.length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5" aria-label="Chosen options">
                        {optionIds.map((id) => {
                          const t = typeOf(id);
                          const detail = t ? typeDetail(t) : null;
                          return (
                            <li key={id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-1 type-caption text-foreground">
                              <span className="truncate">{t?.name ?? 'Document type'}</span>
                              {detail ? <span className="hidden truncate text-muted-foreground sm:inline">· {detail}</span> : null}
                              <button
                                type="button"
                                onClick={() => removeOption(id)}
                                aria-label={`Remove ${t?.name ?? 'this option'}`}
                                className="focus-ring inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                              >
                                <X aria-hidden="true" className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                    {options}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {kind === 'document' && config.canAdminCompany && cat ? (
                <NewCompanyType
                  open={newTypeOpen}
                  onOpenChange={setNewTypeOpen}
                  categories={cat.categories.filter((c) => c.isActive)}
                  creating={createDocumentType.isPending}
                  onCreate={async (values) => {
                    const row = await createDocumentType.mutateAsync({
                      categoryKey: values.categoryKey,
                      name: values.name,
                      code: values.code,
                      abbreviation: values.abbreviation,
                      defaultValidityMonths: values.defaultValidityMonths,
                    });
                    const category = cat.categories.find((c) => c.key === row.category_key);
                    const type: DocumentType = {
                      id: row.id,
                      companyId: row.company_id,
                      categoryKey: row.category_key,
                      tab: category?.tab ?? 'qualifications',
                      key: row.key,
                      name: row.name,
                      code: row.code,
                      abbreviation: row.abbreviation,
                      stcwReference: row.stcw_reference,
                      fieldSchema: {},
                      defaultValidityMonths: row.default_validity_months,
                      endorsementIntervalMonths: row.endorsement_interval_months,
                      itemType: row.expiry_item_type,
                      isIdentity: row.is_identity,
                      isMedicalFitness: row.is_medical_fitness,
                      isActive: row.is_active,
                      sortOrder: row.sort_order,
                    };
                    setCreated((m) => new Map(m).set(type.id, type));
                    addOption(type.id, type.name, type.categoryKey);
                    notify.success(`${type.name} added to the company's document types`);
                    setNewTypeOpen(false);
                  }}
                />
              ) : null}

              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        maxLength={REQUIREMENT_LABEL_MAX}
                        onChange={(e) => {
                          setLabelTouched(true);
                          field.onChange(e);
                        }}
                        placeholder="As it reads in the matrix"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {kind === 'document' ? (
                <FormField
                  control={form.control}
                  name="groupKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {DOCUMENT_REQUIREMENT_GROUPS.map((g) => (
                            <SelectItem key={g} value={g}>
                              {REQUIREMENT_GROUP_LABEL[g]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Where it sits in the matrix. The profile tab follows the document type.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <FormField
                control={form.control}
                name="requireAll"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-2 space-y-0 [@media(pointer:coarse)]:min-h-11">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} disabled={listed.length === 0} />
                    </FormControl>
                    <div className="space-y-0.5">
                      <FormLabel className="font-normal">Require it for every listed position now ({listed.length})</FormLabel>
                      <FormDescription>Leave it off to tick positions one by one in the matrix.</FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {rootError ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{rootError}</AlertDescription>
                </Alert>
              ) : null}
            </fieldset>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={saving} className={COARSE}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className={COARSE}>
                {saving ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
                {saving ? 'Adding…' : 'Add requirement'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

/** "Not in the catalogue?": a company document type, created at once (crew_document_type_create) and added as an option. */
const NewCompanyType: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ReadonlyArray<{ key: string; label: string }>;
  creating: boolean;
  onCreate: (values: CompanyDocumentTypeValues) => Promise<void>;
}> = ({ open, onOpenChange, categories, creating, onCreate }) => {
  const form = useForm<CompanyDocumentTypeValues>({
    resolver: zodResolver(companyDocumentTypeSchema),
    defaultValues: { categoryKey: '', name: '', code: null, abbreviation: null, defaultValidityMonths: null },
  });
  const [error, setError] = React.useState<string | null>(null);
  const create = async () => {
    setError(null);
    const ok = await form.trigger();
    if (!ok) return;
    const values = companyDocumentTypeSchema.parse(form.getValues());
    try {
      await onCreate(values);
      form.reset();
    } catch (e) {
      const field = complianceRefusalField(e);
      const message = complianceRefusalMessage(e);
      if (field && TYPE_FIELD[field]) form.setError(TYPE_FIELD[field], { message });
      else setError(message);
    }
  };
  return (
    <div className="rounded-md border border-dashed border-border" data-new-company-type="">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="focus-ring flex w-full items-center gap-2 rounded-md px-3 py-2 text-left type-body-sm font-medium text-foreground [@media(pointer:coarse)]:min-h-11"
      >
        {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
        Not in the catalogue? Add a company document type
      </button>
      {open ? (
        // A nested <form> is not allowed inside the requirement's form: the fields are validated and sent from the button.
        <Form {...form}>
          <div
            className="space-y-3 border-t border-border px-3 py-3"
            role="group"
            aria-label="New company document type"
            onKeyDown={(e) => {
              // Enter in these fields adds the type; it must not submit the requirement around them.
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                void create();
              }
            }}
          >
            <FormField
              control={form.control}
              name="categoryKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.key} value={c.key}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} maxLength={24} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="abbreviation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Abbreviation</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} maxLength={24} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="defaultValidityMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid for (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={240}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value === '' ? null : e.target.value)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {error ? (
              <p role="alert" className="type-caption text-critical">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => void create()} disabled={creating} className={COARSE}>
                {creating ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
                Add the document type
              </Button>
            </div>
          </div>
        </Form>
      ) : null}
    </div>
  );
};

export default AddQualificationDialog;
