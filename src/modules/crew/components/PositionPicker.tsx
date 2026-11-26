/**
 * Searchable position picker (X1-01; gap/04 C12, C14, improvement 13).
 * Presentational: the caller passes the positions (usually a vessel's,
 * from usePositions) and gets the chosen position id back. Grouped by
 * department in rank order; search matches the name, the department and
 * the tier.
 *
 * D-01: while the positions catalogue is not set up (`unavailable`) it is a
 * plain text field for the free-text title, so forms keep working.
 */
import * as React from 'react';
import { Check, ChevronsUpDown, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { RANK_TIER_LABEL, type RankTier } from '../types/domain';

export interface PositionOption {
  id: string;
  name: string;
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  rankTier: RankTier;
  sortOrder: number;
  /** A short note shown on the right, e.g. "2 on board". */
  hint?: string;
}

export interface PositionPickerProps {
  options: readonly PositionOption[];
  value: string | null;
  onChange: (positionId: string | null, option: PositionOption | null) => void;
  /** Accessible name of the control ("Position", "Map Underwater Welder to a position"). */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  /** The catalogue is not set up yet (D-01): render a free-text field instead. */
  unavailable?: boolean;
  freeText?: string;
  onFreeTextChange?: (text: string) => void;
  /** Shown when the search finds nothing. */
  emptyText?: string;
  className?: string;
  id?: string;
}

interface Group {
  key: string;
  label: string;
  sort: number;
  options: PositionOption[];
}

function groupOptions(options: readonly PositionOption[]): Group[] {
  const groups = new Map<string, Group>();
  for (const o of options) {
    const g = groups.get(o.departmentKey) ?? { key: o.departmentKey, label: o.departmentLabel, sort: o.departmentSort, options: [] };
    g.options.push(o);
    groups.set(o.departmentKey, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
    .map((g) => ({ ...g, options: [...g.options].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }));
}

export function PositionPicker({
  options,
  value,
  onChange,
  label,
  placeholder = 'Choose a position',
  disabled,
  unavailable,
  freeText = '',
  onFreeTextChange,
  emptyText = 'No position matches.',
  className,
  id,
}: PositionPickerProps) {
  const [open, setOpen] = React.useState(false);
  const groups = React.useMemo(() => groupOptions(options), [options]);
  const selected = React.useMemo(() => options.find((o) => o.id === value) ?? null, [options, value]);

  if (unavailable) {
    return (
      <Input
        id={id}
        aria-label={label}
        value={freeText}
        onChange={(event) => onFreeTextChange?.(event.target.value)}
        placeholder="Type the position title"
        disabled={disabled}
        maxLength={80}
        className={className}
      />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className={cn('w-full min-w-0 justify-between font-normal', className)}
        >
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}>
            <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(20rem,calc(100vw-2rem))] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search positions" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.key} heading={g.label}>
                {g.options.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`${o.name} ${o.departmentLabel} ${RANK_TIER_LABEL[o.rankTier]} ${o.id}`}
                    onSelect={() => {
                      const next = o.id === value ? null : o;
                      onChange(next?.id ?? null, next);
                      setOpen(false);
                    }}
                  >
                    <Check aria-hidden="true" className={cn('mr-2 h-4 w-4 shrink-0', value === o.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{o.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{RANK_TIER_LABEL[o.rankTier]}</span>
                    </span>
                    {o.hint ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">{o.hint}</span> : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default PositionPicker;
