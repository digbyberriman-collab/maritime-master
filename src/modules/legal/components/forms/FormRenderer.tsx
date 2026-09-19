import React from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { isReferenceValue, isSignatureValue, type FormData, type FormField, type FormSchema, type FormValue, type ReferenceValue } from '@/modules/legal/lib/forms';
import { MarkdownView } from '@/modules/legal/components/documents/MarkdownView';
import { SignatureField } from './SignatureField';

export interface ReferenceOptions {
  vessel: ReferenceValue[];
  crew: ReferenceValue[];
}

interface FormRendererProps {
  schema: FormSchema;
  data: FormData;
  onChange?: (fieldId: string, value: FormValue) => void;
  errors?: Record<string, string>;
  readOnly?: boolean;
  references?: ReferenceOptions;
  /** Compact spacing for the live preview in the builder. */
  compact?: boolean;
  highlightFieldId?: string | null;
}

const Help: React.FC<{ text?: string }> = ({ text }) => (text ? <p className="text-xs text-muted-foreground">{text}</p> : null);
const Err: React.FC<{ text?: string }> = ({ text }) => (text ? <p className="text-xs text-destructive">{text}</p> : null);

const NONE = '__none';

const FieldControl: React.FC<{
  field: FormField;
  value: FormValue | undefined;
  onChange: (v: FormValue) => void;
  readOnly: boolean;
  references?: ReferenceOptions;
}> = ({ field, value, onChange, readOnly, references }) => {
  const id = `ff-${field.id}`;
  switch (field.type) {
    case 'text':
      return <Input id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} readOnly={readOnly} />;
    case 'textarea':
      return <Textarea id={id} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} readOnly={readOnly} rows={4} />;
    case 'date':
      return <Input id={id} type="date" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} readOnly={readOnly} />;
    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <Checkbox id={id} checked={value === true} onCheckedChange={(v) => onChange(v === true)} disabled={readOnly} />
          <Label htmlFor={id} className="text-sm font-normal">
            {field.placeholder || 'Yes'}
          </Label>
        </div>
      );
    case 'select':
      return (
        <Select value={typeof value === 'string' && value ? value : NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)} disabled={readOnly}>
          <SelectTrigger id={id} aria-label={field.label}>
            <SelectValue placeholder={field.placeholder || 'Choose…'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{field.placeholder || 'Choose…'}</SelectItem>
            {(field.options ?? []).filter(Boolean).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case 'reference': {
      const entity = field.referenceEntity ?? 'vessel';
      const options = references?.[entity] ?? [];
      const current = isReferenceValue(value) ? value : null;
      return (
        <Select value={current?.id ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : (options.find((o) => o.id === v) ?? { id: v, label: v }))} disabled={readOnly}>
          <SelectTrigger id={id} aria-label={field.label}>
            <SelectValue placeholder={field.placeholder || (entity === 'vessel' ? 'Choose a vessel' : 'Choose a crew member')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>{field.placeholder || (entity === 'vessel' ? 'Choose a vessel' : 'Choose a crew member')}</SelectItem>
            {current && !options.some((o) => o.id === current.id) && <SelectItem value={current.id}>{current.label}</SelectItem>}
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    case 'signature':
      return <SignatureField id={id} value={isSignatureValue(value) ? value : null} onChange={(v) => onChange(v)} readOnly={readOnly} acknowledgementText={field.placeholder || undefined} />;
    default:
      return null;
  }
};

/** Schema-driven form. Used for the live preview, the fill-in sheet and the read-only review. */
export const FormRenderer: React.FC<FormRendererProps> = ({ schema, data, onChange, errors = {}, readOnly = false, references, compact, highlightFieldId }) => {
  if (schema.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">This form has no fields yet.</p>;
  }
  return (
    <div className={cn('space-y-5', compact && 'space-y-4')}>
      {schema.fields.map((field) => {
        const highlight = highlightFieldId === field.id;
        const wrap = cn('rounded-md transition-shadow', highlight && 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background');
        if (field.type === 'heading') {
          return (
            <h3 key={field.id} className={cn('border-b border-border pb-1 pt-2 text-base font-semibold text-foreground', wrap)}>
              {field.label || 'Heading'}
            </h3>
          );
        }
        if (field.type === 'paragraph') {
          return (
            <div key={field.id} className={wrap}>
              <MarkdownView markdown={field.label} className="text-muted-foreground" emptyText="" />
            </div>
          );
        }
        const id = `ff-${field.id}`;
        return (
          <div key={field.id} className={cn('space-y-1.5', wrap)}>
            {field.type !== 'checkbox' && (
              <Label htmlFor={id}>
                {field.label || 'Untitled field'}
                {field.required && <span className="text-destructive"> *</span>}
              </Label>
            )}
            {field.type === 'checkbox' && (
              <p className="text-sm font-medium text-foreground">
                {field.label || 'Untitled field'}
                {field.required && <span className="text-destructive"> *</span>}
              </p>
            )}
            <FieldControl field={field} value={data[field.id]} onChange={(v) => onChange?.(field.id, v)} readOnly={readOnly} references={references} />
            <Help text={field.helpText} />
            <Err text={errors[field.id]} />
          </div>
        );
      })}
    </div>
  );
};

export default FormRenderer;
