import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  addField,
  duplicateField,
  FIELD_TYPES,
  fieldTypeDef,
  isStaticField,
  moveField,
  removeField,
  updateField,
  type FormData,
  type FormField,
  type FormFieldType,
  type FormSchema,
} from '@/modules/legal/lib/forms';
import { FormRenderer, type ReferenceOptions } from './FormRenderer';

interface FormBuilderProps {
  schema: FormSchema;
  onChange: (schema: FormSchema) => void;
  references?: ReferenceOptions;
  disabled?: boolean;
}

const FieldEditor: React.FC<{
  field: FormField;
  index: number;
  count: number;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onPatch: (patch: Partial<FormField>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}> = ({ field, index, count, selected, disabled, onSelect, onPatch, onMove, onDuplicate, onRemove }) => {
  const def = fieldTypeDef(field.type);
  const isStatic = isStaticField(field);
  return (
    <div
      className={cn('rounded-lg border bg-card p-3 transition-colors', selected ? 'border-primary ring-1 ring-primary' : 'border-border')}
      onClick={onSelect}
      onFocusCapture={onSelect}
      role="group"
      aria-label={`${def?.label ?? field.type} field ${index + 1}`}
    >
      <div className="mb-2 flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
          {def?.label ?? field.type}
        </Badge>
        <span className="ml-auto flex items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(-1)} disabled={disabled || index === 0} aria-label="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(1)} disabled={disabled || index === count - 1} aria-label="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} disabled={disabled} aria-label="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onRemove} disabled={disabled} aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={cn('space-y-1', isStatic && 'sm:col-span-2')}>
          <Label htmlFor={`fb-label-${field.id}`}>{field.type === 'paragraph' ? 'Text (Markdown)' : 'Label'}</Label>
          {field.type === 'paragraph' ? (
            <Textarea id={`fb-label-${field.id}`} value={field.label} onChange={(e) => onPatch({ label: e.target.value })} rows={3} disabled={disabled} />
          ) : (
            <Input id={`fb-label-${field.id}`} value={field.label} onChange={(e) => onPatch({ label: e.target.value })} disabled={disabled} />
          )}
        </div>
        {!isStatic && (
          <div className="flex items-center gap-2 pt-6">
            <Switch id={`fb-req-${field.id}`} checked={Boolean(field.required)} onCheckedChange={(v) => onPatch({ required: v })} disabled={disabled} />
            <Label htmlFor={`fb-req-${field.id}`}>Required</Label>
          </div>
        )}
        {!isStatic && field.type !== 'signature' && field.type !== 'date' && (
          <div className="space-y-1">
            <Label htmlFor={`fb-ph-${field.id}`}>{field.type === 'checkbox' ? 'Checkbox text' : field.type === 'select' || field.type === 'reference' ? 'Empty option text' : 'Placeholder'}</Label>
            <Input id={`fb-ph-${field.id}`} value={field.placeholder ?? ''} onChange={(e) => onPatch({ placeholder: e.target.value })} disabled={disabled} />
          </div>
        )}
        {field.type === 'signature' && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`fb-ph-${field.id}`}>Acknowledgement text</Label>
            <Input id={`fb-ph-${field.id}`} value={field.placeholder ?? ''} onChange={(e) => onPatch({ placeholder: e.target.value })} placeholder="I confirm the information above is accurate…" disabled={disabled} />
          </div>
        )}
        {!isStatic && (
          <div className="space-y-1">
            <Label htmlFor={`fb-help-${field.id}`}>Help text</Label>
            <Input id={`fb-help-${field.id}`} value={field.helpText ?? ''} onChange={(e) => onPatch({ helpText: e.target.value })} disabled={disabled} />
          </div>
        )}
        {field.type === 'select' && (
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`fb-opt-${field.id}`}>Options (one per line)</Label>
            <Textarea id={`fb-opt-${field.id}`} value={(field.options ?? []).join('\n')} onChange={(e) => onPatch({ options: e.target.value.split('\n') })} rows={3} disabled={disabled} />
          </div>
        )}
        {field.type === 'reference' && (
          <div className="space-y-1">
            <Label>Points at</Label>
            <Select value={field.referenceEntity ?? 'vessel'} onValueChange={(v) => onPatch({ referenceEntity: v as 'vessel' | 'crew' })} disabled={disabled}>
              <SelectTrigger aria-label="Reference entity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vessel">Vessel</SelectItem>
                <SelectItem value="crew">Crew member</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};

/** Drag-free form builder: palette, ordered field editor and a live preview. */
export const FormBuilder: React.FC<FormBuilderProps> = ({ schema, onChange, references, disabled }) => {
  const [selected, setSelected] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<FormData>({});

  const cleanSchema = useMemo(
    () => ({ ...schema, fields: schema.fields.map((f) => (f.type === 'select' ? { ...f, options: (f.options ?? []).map((o) => o.trim()).filter(Boolean) } : f)) }),
    [schema],
  );

  const add = (type: FormFieldType) => {
    const idx = selected ? schema.fields.findIndex((f) => f.id === selected) : -1;
    const next = addField(schema, type, idx >= 0 ? idx : undefined);
    onChange(next);
    const created = idx >= 0 ? next.fields[idx + 1] : next.fields[next.fields.length - 1];
    setSelected(created?.id ?? null);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Add a field</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-1.5 xl:grid-cols-1">
          {FIELD_TYPES.map((t) => (
            <Button key={t.type} type="button" variant="outline" size="sm" className="justify-start" onClick={() => add(t.type)} disabled={disabled} title={t.description}>
              <Plus className="mr-2 h-3.5 w-3.5" /> {t.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardContent className="grid gap-3 p-4">
            <div className="space-y-1">
              <Label htmlFor="fb-title">Form title</Label>
              <Input id="fb-title" value={schema.title} onChange={(e) => onChange({ ...schema, title: e.target.value })} disabled={disabled} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="fb-desc">Introduction (Markdown)</Label>
              <Textarea id="fb-desc" value={schema.description ?? ''} onChange={(e) => onChange({ ...schema, description: e.target.value })} rows={2} disabled={disabled} />
            </div>
          </CardContent>
        </Card>
        {schema.fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Add your first field from the palette.</div>
        ) : (
          schema.fields.map((field, index) => (
            <FieldEditor
              key={field.id}
              field={field}
              index={index}
              count={schema.fields.length}
              selected={selected === field.id}
              disabled={disabled}
              onSelect={() => setSelected(field.id)}
              onPatch={(patch) => onChange(updateField(schema, index, patch))}
              onMove={(dir) => onChange(moveField(schema, index, dir))}
              onDuplicate={() => onChange(duplicateField(schema, index))}
              onRemove={() => {
                onChange(removeField(schema, index));
                if (selected === field.id) setSelected(null);
              }}
            />
          ))
        )}
      </div>

      <Card className="h-fit xl:sticky xl:top-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Live preview</CardTitle>
        </CardHeader>
        <CardContent>
          {cleanSchema.title && <h2 className="mb-1 text-lg font-semibold text-foreground">{cleanSchema.title}</h2>}
          {cleanSchema.description && <p className="mb-4 text-sm text-muted-foreground">{cleanSchema.description}</p>}
          <FormRenderer schema={cleanSchema} data={previewData} onChange={(id, v) => setPreviewData((d) => ({ ...d, [id]: v }))} references={references} compact highlightFieldId={selected} />
        </CardContent>
      </Card>
    </div>
  );
};

export default FormBuilder;
