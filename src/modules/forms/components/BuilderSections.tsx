/**
 * The builder's sections and items (gap/02 FC3): each section has a title
 * and its items; each item has a label, a type (lib/templateSchema.ts
 * ITEM_TYPES, all drawn by the ISM form renderer), Required, a comment
 * box, attachments and, for "Choose from a list", its choices. Sections
 * and items move up and down and can be removed; "Add several" adds one
 * item per pasted line.
 *
 * React Hook Form field arrays inside the page's FormProvider (the page
 * owns the form and its zod schema). The publish checks' problems are
 * marked on the section or item they are about (`issueKeys`), each
 * focusable by its id (`section-<key>`, `item-<key>`).
 *
 * Tokens only; 44 px targets on coarse pointers; usable at 390 px.
 */
import React from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { ArrowDown, ArrowUp, ListPlus, Plus, Trash2, X } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { FormTemplateKind } from '../types/db.pending';
import {
  ADD_SEVERAL_MAX,
  ITEM_LABEL_MAX,
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  OPTIONS_MAX,
  SECTION_TITLE_MAX,
  defaultItemType,
  isItemType,
  itemTypeLabel,
  newItem,
  newSection,
  parseSeveralItems,
  sectionItemExtra,
  type TemplateFormValues,
} from '../lib/templateSchema';
import { COARSE, COARSE_ICON } from './FormsParts';

export interface SectionsEditorProps {
  kind: FormTemplateKind;
  disabled?: boolean;
  /** Section and item keys the publish checks point at. */
  issueKeys: ReadonlySet<string>;
}

export function SectionsEditor({ kind, disabled, issueKeys }: SectionsEditorProps) {
  const { control } = useFormContext<TemplateFormValues>();
  const sections = useFieldArray({ control, name: 'sections', keyName: 'fieldKey' });
  return (
    <div className="space-y-4">
      {sections.fields.map((field, index) => (
        <SectionCard
          key={field.fieldKey}
          index={index}
          count={sections.fields.length}
          kind={kind}
          disabled={disabled}
          issueKeys={issueKeys}
          onMove={(to) => sections.move(index, to)}
          onRemove={() => sections.remove(index)}
        />
      ))}
      <Button type="button" variant="outline" size="sm" className={COARSE} disabled={disabled} onClick={() => sections.append(newSection())}>
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add section
      </Button>
    </div>
  );
}

// ─── A section ─────────────────────────────────────────────────────────

interface SectionCardProps {
  index: number;
  count: number;
  kind: FormTemplateKind;
  disabled?: boolean;
  issueKeys: ReadonlySet<string>;
  onMove: (to: number) => void;
  onRemove: () => void;
}

function SectionCard({ index, count, kind, disabled, issueKeys, onMove, onRemove }: SectionCardProps) {
  const { control, register, getValues } = useFormContext<TemplateFormValues>();
  const items = useFieldArray({ control, name: `sections.${index}.items`, keyName: 'fieldKey' });
  const key = useWatch({ control, name: `sections.${index}.key` });
  const title = useWatch({ control, name: `sections.${index}.title` }) ?? '';
  const headerless = useWatch({ control, name: `sections.${index}.headerless` });
  const [addingSeveral, setAddingSeveral] = React.useState(false);
  const [confirmRemove, setConfirmRemove] = React.useState(false);
  const titleId = `section-${key}`;
  const flagged = issueKeys.has(key);
  const itemCount = items.fields.length;
  const extra = () => sectionItemExtra(getValues(`sections.${index}`));

  const addOne = () => items.append(newItem(defaultItemType(kind), '', extra()), { shouldFocus: false });
  const addMany = (labels: string[], type: string, required: boolean) => {
    items.append(labels.map((label) => ({ ...newItem(type, label, extra()), required })), { shouldFocus: false });
  };

  return (
    <section
      aria-labelledby={`${titleId}-heading`}
      className={cn('rounded-lg border bg-card', flagged ? 'border-critical/60' : 'border-border')}
      data-section-key={key}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
        <h3 id={`${titleId}-heading`} className="sr-only">
          {title.trim() ? `Section ${index + 1}: ${title.trim()}` : `Section ${index + 1}`}
        </h3>
        <Label htmlFor={titleId} className="sr-only">
          {`Section ${index + 1} title`}
        </Label>
        <Input
          id={titleId}
          placeholder={headerless ? 'Items before the first section (add a title to make it one)' : 'Section title'}
          maxLength={SECTION_TITLE_MAX + 20}
          aria-invalid={flagged && !title.trim() && !headerless ? true : undefined}
          className={cn('h-9 min-w-0 flex-1 basis-48 font-medium', COARSE)}
          disabled={disabled}
          {...register(`sections.${index}.title`)}
        />
        <span className="flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`Move section ${index + 1} up`} disabled={disabled || index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`Move section ${index + 1} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8 text-destructive hover:text-destructive', COARSE_ICON)}
            aria-label={`Remove section ${index + 1}`}
            disabled={disabled}
            onClick={() => (itemCount ? setConfirmRemove(true) : onRemove())}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </span>
      </div>

      <div className="space-y-2 p-3 sm:p-4">
        {itemCount === 0 ? <p className={cn('type-body-sm', flagged ? 'text-critical' : 'text-muted-foreground')}>No items yet. A section needs at least one item before publishing.</p> : null}
        <ol aria-label={title.trim() ? `Items of ${title.trim()}` : `Items of section ${index + 1}`} className="flex flex-col gap-2">
          {items.fields.map((field, itemIndex) => (
            <ItemRow
              key={field.fieldKey}
              sectionIndex={index}
              index={itemIndex}
              count={itemCount}
              disabled={disabled}
              issueKeys={issueKeys}
              onMove={(to) => items.move(itemIndex, to)}
              onRemove={() => items.remove(itemIndex)}
            />
          ))}
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" className={COARSE} disabled={disabled} onClick={addOne}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add item
          </Button>
          <Button type="button" variant="outline" size="sm" className={COARSE} disabled={disabled} onClick={() => setAddingSeveral(true)}>
            <ListPlus aria-hidden="true" className="h-4 w-4" />
            Add several
          </Button>
        </div>
      </div>

      <AddSeveralDialog open={addingSeveral} onOpenChange={setAddingSeveral} kind={kind} onAdd={addMany} />

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Remove ${title.trim() || `section ${index + 1}`}?`}</AlertDialogTitle>
            <AlertDialogDescription>{`Its ${itemCount === 1 ? 'item goes' : `${itemCount} items go`} with it. Nothing is saved until you save the draft.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={COARSE}>Keep it</AlertDialogCancel>
            <AlertDialogAction className={cn(COARSE, 'bg-destructive text-destructive-foreground hover:bg-destructive/90')} onClick={onRemove}>
              Remove section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

// ─── An item ───────────────────────────────────────────────────────────

interface ItemRowProps {
  sectionIndex: number;
  index: number;
  count: number;
  disabled?: boolean;
  issueKeys: ReadonlySet<string>;
  onMove: (to: number) => void;
  onRemove: () => void;
}

function ItemRow({ sectionIndex, index, count, disabled, issueKeys, onMove, onRemove }: ItemRowProps) {
  const { control, register, setValue, getValues } = useFormContext<TemplateFormValues>();
  const base = `sections.${sectionIndex}.items.${index}` as const;
  const key = useWatch({ control, name: `${base}.key` });
  const type = useWatch({ control, name: `${base}.type` });
  const label = useWatch({ control, name: `${base}.label` }) ?? '';
  const id = `item-${key}`;
  const flagged = issueKeys.has(key);
  const name = label.trim() || `item ${index + 1}`;

  const changeType = (next: string) => {
    setValue(`${base}.type`, next, { shouldDirty: true });
    const options = getValues(`${base}.options`) ?? [];
    if (next === 'dropdown' && options.length === 0) setValue(`${base}.options`, ['', ''], { shouldDirty: true });
    if (next !== 'dropdown' && options.length) setValue(`${base}.options`, [], { shouldDirty: true });
  };

  return (
    <li className={cn('rounded-md border bg-background/40 p-2 sm:p-3', flagged ? 'border-critical/60' : 'border-border')} data-item-key={key}>
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
          {index + 1}
        </span>
        <Label htmlFor={id} className="sr-only">
          {`Item ${index + 1} label`}
        </Label>
        <Input
          id={id}
          placeholder="What crews check or answer"
          maxLength={ITEM_LABEL_MAX + 20}
          aria-invalid={flagged ? true : undefined}
          className={cn('h-9 min-w-0 flex-1 basis-56', COARSE)}
          disabled={disabled}
          {...register(`${base}.label`)}
        />
        <Select value={type} onValueChange={changeType} disabled={disabled}>
          <SelectTrigger aria-label={`Type of ${name}`} className={cn('h-9 w-full sm:w-44', COARSE)}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ITEM_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </SelectItem>
            ))}
            {type && !isItemType(type) ? <SelectItem value={type}>{`Other: ${itemTypeLabel(type)}`}</SelectItem> : null}
          </SelectContent>
        </Select>
        <span className="ml-auto flex shrink-0 items-center">
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`Move ${name} up`} disabled={disabled || index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8', COARSE_ICON)} aria-label={`Move ${name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(index + 1)}>
            <ArrowDown aria-hidden="true" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className={cn('h-8 w-8 text-destructive hover:text-destructive', COARSE_ICON)} aria-label={`Remove ${name}`} disabled={disabled} onClick={onRemove}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </Button>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 pl-7">
        <ToggleField name={`${base}.required`} label="Required" disabled={disabled} />
        <ToggleField name={`${base}.allowComment`} label="Comment box" disabled={disabled} />
        <ToggleField name={`${base}.allowAttachments`} label="Attachments" disabled={disabled} />
      </div>
      {type === 'dropdown' ? <OptionsEditor base={base} disabled={disabled} itemName={name} /> : null}
    </li>
  );
}

type ToggleName = `sections.${number}.items.${number}.${'required' | 'allowComment' | 'allowAttachments'}`;

function ToggleField({ name, label, disabled }: { name: ToggleName; label: string; disabled?: boolean }) {
  const { control } = useFormContext<TemplateFormValues>();
  const id = React.useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <span className="flex items-center gap-2">
          <Switch id={id} checked={!!field.value} onCheckedChange={field.onChange} disabled={disabled} />
          <Label htmlFor={id} className="cursor-pointer type-body-sm">
            {label}
          </Label>
        </span>
      )}
    />
  );
}

function OptionsEditor({ base, disabled, itemName }: { base: `sections.${number}.items.${number}`; disabled?: boolean; itemName: string }) {
  const { control, register, setValue, getValues } = useFormContext<TemplateFormValues>();
  const options = useWatch({ control, name: `${base}.options` }) ?? [];
  const set = (next: string[]) => setValue(`${base}.options`, next, { shouldDirty: true });
  return (
    <fieldset className="mt-3 space-y-2 pl-7" disabled={disabled}>
      <legend className="type-caption text-muted-foreground">{`Choices for ${itemName}`}</legend>
      {options.map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input aria-label={`Choice ${i + 1}`} placeholder={`Choice ${i + 1}`} className={cn('h-9 min-w-0 flex-1', COARSE)} {...register(`${base}.options.${i}`)} />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-8 w-8', COARSE_ICON)}
            aria-label={`Remove choice ${i + 1}`}
            onClick={() => set((getValues(`${base}.options`) ?? []).filter((__, j) => j !== i))}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className={COARSE} disabled={options.length >= OPTIONS_MAX} onClick={() => set([...(getValues(`${base}.options`) ?? []), ''])}>
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add a choice
      </Button>
    </fieldset>
  );
}

// ─── Add several ───────────────────────────────────────────────────────

interface AddSeveralDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FormTemplateKind;
  onAdd: (labels: string[], type: string, required: boolean) => void;
}

/** One item per pasted line (bullets and numbering removed), of one type, Required or not. */
export function AddSeveralDialog({ open, onOpenChange, kind, onAdd }: AddSeveralDialogProps) {
  const [text, setText] = React.useState('');
  const [type, setType] = React.useState<string>(defaultItemType(kind));
  const [required, setRequired] = React.useState(true);
  const id = React.useId();
  React.useEffect(() => {
    if (open) {
      setText('');
      setType(defaultItemType(kind));
      setRequired(true);
    }
  }, [open, kind]);
  const parsed = parseSeveralItems(text);
  const n = parsed.labels.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-lg overflow-y-auto sm:w-full" aria-describedby={`${id}-description`}>
        <DialogHeader>
          <DialogTitle>Add several items</DialogTitle>
          <DialogDescription id={`${id}-description`}>Paste or type one item per line. Bullets and numbering at the start of a line are left out.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-lines`}>Items</Label>
            <Textarea id={`${id}-lines`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Fire doors closed\nEscape routes clear\nExtinguishers in date'} />
            <p className="type-caption text-muted-foreground" aria-live="polite">
              {n ? `${n.toLocaleString('en-GB')} ${n === 1 ? 'item' : 'items'} will be added` : 'Nothing to add yet'}
              {parsed.leftOut ? `. ${parsed.leftOut.toLocaleString('en-GB')} more lines are left out: up to ${ADD_SEVERAL_MAX} at a time.` : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1 basis-48 space-y-1.5">
              <Label htmlFor={`${id}-type`}>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id={`${id}-type`} className={COARSE}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ITEM_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="flex items-center gap-2 pt-6">
              <Switch id={`${id}-required`} checked={required} onCheckedChange={setRequired} />
              <Label htmlFor={`${id}-required`} className="cursor-pointer">
                Required
              </Label>
            </span>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className={COARSE} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={COARSE}
            disabled={n === 0}
            onClick={() => {
              onAdd(parsed.labels, type, required);
              onOpenChange(false);
            }}
          >
            {n ? `Add ${n.toLocaleString('en-GB')} ${n === 1 ? 'item' : 'items'}` : 'Add items'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
