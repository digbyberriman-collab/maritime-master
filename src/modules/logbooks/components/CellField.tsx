import React from 'react';
import { cn } from '@/lib/utils';
import type { TemplateField } from '../lib/templates';
import { itemCode } from '../lib/lineLayouts';

interface Props {
  field: TemplateField;
  value: string;
  required: boolean;
  invalid: boolean;
  lineNumber: number;
  showLabel: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

const base = 'w-full rounded border border-input bg-background px-1.5 py-1 text-[13px] text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60 aria-[invalid=true]:border-destructive';

/** A directly editable cell control for one schema field. */
const CellField: React.FC<Props> = ({ field, value, required, invalid, lineNumber, showLabel, disabled, onChange }) => {
  const label = `${field.label} · line ${lineNumber}`;
  const common = {
    'data-line-field': field.key,
    name: field.key,
    'aria-label': label,
    'aria-required': required,
    'aria-invalid': invalid || undefined,
    disabled,
  } as const;
  let control: React.ReactNode;
  if (field.options) {
    control = (
      <select {...common} value={value} onChange={(e) => onChange(e.target.value)} className={cn(base, 'min-w-[8rem]')}>
        <option value="">Choose…</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    );
  } else if (field.type === 'textarea') {
    control = (
      <textarea
        {...common}
        value={value}
        rows={2}
        maxLength={4000}
        placeholder="Write here…"
        onChange={(e) => { onChange(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${Math.max(36, e.target.scrollHeight)}px`; }}
        className={cn(base, 'min-w-[12rem] resize-y')}
      />
    );
  } else {
    control = (
      <input
        {...common}
        type={field.type === 'datetime-local' ? 'datetime-local' : field.type === 'number' ? 'number' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={field.type === 'number' ? field.min : undefined}
        max={field.type === 'number' ? field.max : undefined}
        step={field.type === 'number' ? 'any' : undefined}
        inputMode={field.type === 'number' ? 'decimal' : undefined}
        maxLength={field.type === 'number' ? undefined : 500}
        className={cn(base, field.type === 'number' ? 'min-w-[6rem]' : 'min-w-[8rem]')}
      />
    );
  }
  return (
    <label className="block space-y-0.5">
      {showLabel && (
        <span className="block text-[11px] leading-tight text-muted-foreground">
          {field.item && <b className="mr-1 font-mono text-foreground">{itemCode(field.item)}</b>}
          {field.label}{required ? ' *' : ''}
        </span>
      )}
      {control}
    </label>
  );
};

export default CellField;
