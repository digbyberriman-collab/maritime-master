import React from 'react';
import { ArrowDown, ArrowUp, Flag, ListPlus, Plus, Ruler, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HealthEmpty } from '@/modules/health/components/HealthStates';
import {
  ASSESSMENT_ITEM_CATEGORIES,
  ASSESSMENT_ITEM_SIDES,
  STARTER_ASSESSMENT_ITEMS,
  assessmentItemCategoryLabel,
  assessmentItemSideLabel,
  emptyAssessmentItem,
  type AssessmentItemDraft,
} from '@/modules/health/hooks/usePhysio';

interface AssessmentFindingsEditorProps {
  items: AssessmentItemDraft[];
  onChange: (items: AssessmentItemDraft[]) => void;
  /** Called with the stored row id when an already-saved finding is deleted. */
  onRemoveSaved?: (id: string) => void;
  readOnly?: boolean;
}

/**
 * The structured findings on an assessment: one row per measure, ordered the
 * way the physio worked through them. The order is what becomes `position`,
 * so the move buttons are part of the record rather than decoration.
 */
export const AssessmentFindingsEditor: React.FC<AssessmentFindingsEditorProps> = ({
  items,
  onChange,
  onRemoveSaved,
  readOnly,
}) => {
  const update = (index: number, patch: Partial<AssessmentItemDraft>) => {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeAt = (index: number) => {
    const target = items[index];
    if (target?.id) onRemoveSaved?.(target.id);
    onChange(items.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  if (readOnly) {
    if (!items.length) {
      return (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          No structured findings were recorded on this assessment.
        </p>
      );
    }
    return (
      <ul className="divide-y rounded-md border">
        {items.map((item, index) => (
          <li key={item.id ?? index} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {item.label}
                {item.side !== 'n/a' && (
                  <span className="text-muted-foreground"> · {assessmentItemSideLabel(item.side)}</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {assessmentItemCategoryLabel(item.category)}
                {item.normal_range ? ` · normal ${item.normal_range}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-sm font-medium',
                  item.is_flagged ? 'text-destructive' : 'text-foreground',
                )}
              >
                {item.value_numeric !== null
                  ? `${item.value_numeric}${item.unit ? ` ${item.unit}` : ''}`
                  : item.value_text || '—'}
              </span>
              {item.is_flagged && <Flag className="h-3.5 w-3.5 text-destructive" />}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <HealthEmpty
          icon={Ruler}
          title="No findings recorded yet"
          description="Add the measures you took, or start from the common musculoskeletal set and edit what does not apply."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChange(STARTER_ASSESSMENT_ITEMS.map((item) => ({ ...item })))}
              >
                <ListPlus className="mr-2 h-4 w-4" />
                Use the common set
              </Button>
              <Button type="button" size="sm" onClick={() => onChange([emptyAssessmentItem()])}>
                <Plus className="mr-2 h-4 w-4" />
                Add a finding
              </Button>
            </div>
          }
          className="p-6"
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={item.id ?? `draft-${index}`}
                className={cn(
                  'rounded-lg border bg-card p-3',
                  item.is_flagged && 'border-destructive/40 bg-destructive/5',
                )}
              >
                <div className="grid gap-3 md:grid-cols-12">
                  <div className="md:col-span-3">
                    <Label className="text-xs text-muted-foreground">Category</Label>
                    <Select
                      value={item.category}
                      onValueChange={(value) => update(index, { category: value })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSESSMENT_ITEM_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-xs text-muted-foreground">Measure</Label>
                    <Input
                      className="mt-1"
                      value={item.label}
                      placeholder="Shoulder flexion"
                      onChange={(e) => update(index, { label: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Side</Label>
                    <Select value={item.side} onValueChange={(value) => update(index, { side: value })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSESSMENT_ITEM_SIDES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Value</Label>
                    <Input
                      className="mt-1"
                      type="number"
                      inputMode="decimal"
                      value={item.value_numeric ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        update(index, {
                          value_numeric: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                  <div className="md:col-span-1">
                    <Label className="text-xs text-muted-foreground">Unit</Label>
                    <Input
                      className="mt-1"
                      value={item.unit ?? ''}
                      placeholder="deg"
                      onChange={(e) => update(index, { unit: e.target.value || null })}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <Label className="text-xs text-muted-foreground">Normal range</Label>
                    <Input
                      className="mt-1"
                      value={item.normal_range ?? ''}
                      placeholder="0 to 180"
                      onChange={(e) => update(index, { normal_range: e.target.value || null })}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <Label className="text-xs text-muted-foreground">
                      Observation or note
                    </Label>
                    <Input
                      className="mt-1"
                      value={item.value_text ?? ''}
                      placeholder="Painful arc from 90 degrees"
                      onChange={(e) => update(index, { value_text: e.target.value || null })}
                    />
                  </div>
                  <div className="flex items-end justify-between gap-2 md:col-span-3">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch
                        checked={item.is_flagged}
                        onCheckedChange={(checked) => update(index, { is_flagged: checked })}
                        aria-label={`Flag ${item.label || 'this finding'}`}
                      />
                      Flag
                    </label>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        disabled={index === items.length - 1}
                        onClick={() => move(index, 1)}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeAt(index)}
                        aria-label="Remove finding"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...items, emptyAssessmentItem()])}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add a finding
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                onChange([...items, ...STARTER_ASSESSMENT_ITEMS.map((item) => ({ ...item }))])
              }
            >
              <ListPlus className="mr-2 h-4 w-4" />
              Append the common set
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default AssessmentFindingsEditor;
