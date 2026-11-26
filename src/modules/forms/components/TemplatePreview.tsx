/**
 * What crews will see (gap/02 FC3 "Preview"): the template's sections and
 * items drawn by the ISM form renderer (`ism/forms/components/
 * FieldRenderer`, the one a run uses), with each item's comment box and
 * attachments, and the completion signature when it is required.
 *
 * The preview can be tried: answers stay on this screen and are never
 * saved. Used by the builder's Preview sheet (unsaved changes included)
 * and the preview page.
 */
import React from 'react';
import { Paperclip, PenLine } from 'lucide-react';
import FieldRenderer from '@/modules/ism/forms/components/FieldRenderer';
import type { FieldType, FormField } from '@/modules/ism/forms/constants';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { StatusPill } from '@/shared/components/status';

export interface TemplatePreviewProps {
  name: string;
  description?: string | null;
  /** Chips under the name (area, kind, version, cadence). */
  facts: readonly string[];
  /** The stored fields (lib/templateSchema.ts sectionsToFields, or form_schema.fields). */
  fields: readonly unknown[];
  requiresSignature: boolean;
  /** "On every vessel, including ones added later" / "On 3 vessels". */
  targets?: string | null;
  className?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value));

/** A stored field as the renderer reads it (anything missing filled in, so a half-built item still draws). */
function toFormField(raw: unknown, index: number): FormField & { allowComment?: boolean; allowAttachments?: boolean } {
  const f = isObject(raw) ? raw : {};
  const field = {
    ...f,
    id: str(f.id) || `field_${index}`,
    type: (str(f.type) || 'text') as FieldType,
    label: str(f.label).trim() || 'Untitled item',
    required: f.required === true,
  } as FormField & { allowComment?: boolean; allowAttachments?: boolean };
  if (field.type === ('dropdown' as FieldType)) field.options = Array.isArray(f.options) ? f.options.map(str).filter(Boolean) : [];
  return field;
}

export function TemplatePreview({ name, description, facts, fields, requiresSignature, targets, className }: TemplatePreviewProps) {
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const formFields = React.useMemo(() => fields.map(toFormField), [fields]);
  const items = formFields.filter((f) => f.type !== 'section');
  const onChange = React.useCallback((fieldId: string, value: unknown) => setValues((prev) => ({ ...prev, [fieldId]: value })), []);

  return (
    <article className={cn('space-y-5', className)} aria-label={`Preview of ${name || 'the template'}`}>
      <header className="space-y-2 border-b border-border pb-4">
        <h2 className="font-display text-xl font-semibold text-foreground">{name || 'Untitled template'}</h2>
        {description ? <p className="type-body text-muted-foreground">{description}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5">
          {facts.map((f) => (
            <StatusPill key={f} tone="neutral" icon={null} label={f} />
          ))}
        </div>
        {targets ? <p className="type-body-sm text-muted-foreground">{targets}</p> : null}
        <p className="type-caption text-muted-foreground">Try it: nothing you enter here is saved.</p>
      </header>

      {items.length === 0 ? (
        <p className="type-body text-muted-foreground">No items yet. Add items to see how crews will fill it in.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {formFields.map((field) =>
            field.type === 'section' ? (
              <FieldRenderer key={field.id} field={field} value={undefined} onChange={onChange} allValues={values} />
            ) : (
              <div key={field.id} className="space-y-2 rounded-md border border-border bg-card p-3">
                <FieldRenderer field={field} value={values[field.id]} onChange={onChange} allValues={values} />
                {field.allowComment ? (
                  <div className="space-y-1">
                    <Label htmlFor={`${field.id}-comment`} className="type-caption text-muted-foreground">
                      Comment
                    </Label>
                    <Textarea
                      id={`${field.id}-comment`}
                      rows={2}
                      value={str(values[`${field.id}__comment`])}
                      onChange={(e) => onChange(`${field.id}__comment`, e.target.value)}
                      placeholder="Add a comment"
                    />
                  </div>
                ) : null}
                {field.allowAttachments ? (
                  <p className="flex items-center gap-2 type-caption text-muted-foreground">
                    <Paperclip aria-hidden="true" className="h-3.5 w-3.5" />
                    Photos and files can be attached here when the checklist is run.
                  </p>
                ) : null}
              </div>
            ),
          )}
        </div>
      )}

      {requiresSignature ? (
        <section aria-label="Signature on completion" className="rounded-md border-2 border-dashed border-border p-4">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <PenLine aria-hidden="true" className="h-4 w-4" />
            Signature on completion
          </p>
          <p className="mt-1 type-body-sm text-muted-foreground">The person who completes it signs here before it can be submitted.</p>
        </section>
      ) : null}
    </article>
  );
}
