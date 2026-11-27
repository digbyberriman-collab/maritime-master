import * as React from 'react';
import { Briefcase, Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { RANK_TIER_LABEL, type RankTier } from '@/modules/crew/types/domain';

export interface PositionChoice {
  id: string;
  name: string;
  departmentKey: string;
  departmentLabel: string;
  departmentSort: number;
  rankTier: RankTier;
  sortOrder: number;
}

export interface PositionMultiPickerProps {
  options: readonly PositionChoice[];
  value: readonly string[];
  onChange: (ids: string[]) => void;
  /** Accessible name ("Required for positions"). */
  label: string;
  id?: string;
  disabled?: boolean;
  /** Ids no longer offered (a removed position): shown as chips so they can be taken off. */
  unknownLabel?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

/**
 * Searchable multi-select of positions (X1-10: the positions a familiarisation
 * template is required for). Grouped by department in rank order, as the
 * crew PositionPicker; the chosen ones show as removable chips under the
 * button, each a 44 px target on touch screens.
 */
export function PositionMultiPicker({ options, value, onChange, label, id, disabled, unknownLabel = 'Position no longer listed', ...aria }: PositionMultiPickerProps) {
  const [open, setOpen] = React.useState(false);
  const byId = React.useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const groups = React.useMemo(() => {
    const m = new Map<string, { key: string; label: string; sort: number; options: PositionChoice[] }>();
    for (const o of options) {
      const g = m.get(o.departmentKey) ?? { key: o.departmentKey, label: o.departmentLabel, sort: o.departmentSort, options: [] };
      g.options.push(o);
      m.set(o.departmentKey, g);
    }
    return [...m.values()]
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
      .map((g) => ({ ...g, options: [...g.options].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)) }));
  }, [options]);
  const chosen = new Set(value);
  const toggle = (pid: string) => onChange(chosen.has(pid) ? value.filter((v) => v !== pid) : [...value, pid]);
  const summary = value.length === 0 ? 'Not required of any position' : value.length === 1 ? '1 position' : `${value.length} positions`;

  return (
    <div className="min-w-0 space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={`${label}: ${summary}`}
            disabled={disabled}
            className="w-full min-w-0 justify-between font-normal [@media(pointer:coarse)]:h-11"
            {...aria}
          >
            <span className={cn('flex min-w-0 items-center gap-2', value.length === 0 && 'text-muted-foreground')}>
              <Briefcase aria-hidden="true" className="h-4 w-4 shrink-0" />
              <span className="truncate">{summary}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(20rem,calc(100vw-2rem))] p-0" align="start">
          <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
            <CommandInput placeholder="Search positions" />
            <CommandList>
              <CommandEmpty>No position matches.</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.key} heading={g.label}>
                  {g.options.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={`${o.name} ${o.departmentLabel} ${RANK_TIER_LABEL[o.rankTier]} ${o.id}`}
                      onSelect={() => toggle(o.id)}
                      aria-selected={chosen.has(o.id)}
                      className="[@media(pointer:coarse)]:min-h-11"
                    >
                      <Check aria-hidden="true" className={cn('mr-2 h-4 w-4 shrink-0', chosen.has(o.id) ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{o.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{RANK_TIER_LABEL[o.rankTier]}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={`${label}, chosen`}>
          {value.map((pid) => {
            const o = byId.get(pid);
            return (
              <li key={pid}>
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted py-0.5 pl-2.5 pr-0.5 text-xs text-foreground">
                  {o ? o.name : unknownLabel}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(pid)}
                    aria-label={`Remove ${o ? o.name : unknownLabel}`}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                  >
                    <X aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default PositionMultiPicker;
