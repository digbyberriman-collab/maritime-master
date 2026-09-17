import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Ship, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useHrCrewDirectory, type HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';

interface CrewPickerProps {
  /** Selected profiles.id */
  value: string | null;
  onChange: (profileId: string | null, entry: HrCrewDirectoryEntry | null) => void;
  placeholder?: string;
  className?: string;
  includeInactive?: boolean;
  disabled?: boolean;
}

const initials = (e: HrCrewDirectoryEntry) => `${e.first_name?.[0] ?? ''}${e.last_name?.[0] ?? ''}`.toUpperCase();

/**
 * Searchable crew selector keyed on profiles.id. Groups by vessel so a
 * purser can find "the new deckhand on Draak" without knowing the name.
 */
export const CrewPicker: React.FC<CrewPickerProps> = ({
  value,
  onChange,
  placeholder = 'Select crew member',
  className,
  includeInactive,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const { entries, isLoading } = useHrCrewDirectory({ includeInactive });
  const selected = useMemo(() => entries.find((e) => e.id === value) ?? null, [entries, value]);

  const groups = useMemo(() => {
    const map = new Map<string, HrCrewDirectoryEntry[]>();
    for (const e of entries) {
      const key = e.vessel_name ?? 'Unassigned';
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)));
  }, [entries]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarImage src={selected.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="text-[10px]">{initials(selected)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.displayName}</span>
              {selected.rank && <span className="truncate text-xs text-muted-foreground">· {selected.rank}</span>}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="h-4 w-4" />
              {isLoading ? 'Loading crew…' : placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search by name, rank or vessel…" />
          <CommandList>
            <CommandEmpty>No crew found.</CommandEmpty>
            {groups.map(([vessel, members]) => (
              <CommandGroup key={vessel} heading={vessel}>
                {members.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={`${e.fullName} ${e.preferred_name ?? ''} ${e.rank ?? ''} ${e.department ?? ''} ${vessel}`}
                    onSelect={() => {
                      onChange(e.id === value ? null : e.id, e.id === value ? null : e);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === e.id ? 'opacity-100' : 'opacity-0')} />
                    <Avatar className="mr-2 h-6 w-6">
                      <AvatarImage src={e.avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px]">{initials(e)}</AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{e.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[e.rank ?? e.position, e.department].filter(Boolean).join(' · ') || e.email}
                      </span>
                    </span>
                    {e.is_imported && <Badge variant="outline" className="ml-2 text-[10px]">Imported</Badge>}
                    {e.vessel_name && <Ship className="ml-2 h-3 w-3 text-muted-foreground" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CrewPicker;
