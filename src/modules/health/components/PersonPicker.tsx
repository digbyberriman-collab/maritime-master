import React, { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Ship, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  personTypeLabel,
  useHealthPeople,
  type HealthPersonEntry,
} from '@/modules/health/hooks/useHealthPeople';

interface PersonPickerProps {
  /** Selected hw_people.id */
  value: string | null;
  onChange: (personId: string | null, person: HealthPersonEntry | null) => void;
  placeholder?: string;
  className?: string;
  includeInactive?: boolean;
  disabled?: boolean;
  /** Restrict to these person types, e.g. guests only. */
  personTypes?: string[];
}

const initials = (p: HealthPersonEntry) =>
  `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase();

/**
 * Searchable subject selector keyed on `hw_people.id`. Groups crew by vessel
 * and keeps guests and the owner's party in their own group, because a medic
 * looking for "the guest in the owner's cabin" does not know their surname.
 */
export const PersonPicker: React.FC<PersonPickerProps> = ({
  value,
  onChange,
  placeholder = 'Select a person',
  className,
  includeInactive,
  disabled,
  personTypes,
}) => {
  const [open, setOpen] = useState(false);
  const { entries, isLoading } = useHealthPeople({ includeInactive });

  const people = useMemo(
    () => (personTypes?.length ? entries.filter((p) => personTypes.includes(p.person_type)) : entries),
    [entries, personTypes],
  );

  const selected = useMemo(() => people.find((p) => p.id === value) ?? null, [people, value]);

  const groups = useMemo(() => {
    const map = new Map<string, HealthPersonEntry[]>();
    for (const p of people) {
      const key = p.isCrew ? p.vessel_name ?? 'Crew — unassigned' : personTypeLabel(p.person_type);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [people]);

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
                <AvatarFallback className="text-[10px]">{initials(selected)}</AvatarFallback>
              </Avatar>
              <span className="truncate">{selected.displayName}</span>
              {selected.rank && (
                <span className="truncate text-xs text-muted-foreground">· {selected.rank}</span>
              )}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-muted-foreground">
              <UserRound className="h-4 w-4" />
              {isLoading ? 'Loading people…' : placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search by name, rank, cabin or vessel…" />
          <CommandList>
            <CommandEmpty>Nobody found.</CommandEmpty>
            {groups.map(([group, members]) => (
              <CommandGroup key={group} heading={group}>
                {members.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.fullName} ${p.preferred_name ?? ''} ${p.rank ?? ''} ${p.department ?? ''} ${p.cabin ?? ''} ${group}`}
                    onSelect={() => {
                      onChange(p.id === value ? null : p.id, p.id === value ? null : p);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === p.id ? 'opacity-100' : 'opacity-0')} />
                    <Avatar className="mr-2 h-6 w-6">
                      <AvatarFallback className="text-[10px]">{initials(p)}</AvatarFallback>
                    </Avatar>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{p.displayName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {[p.rank, p.department, p.cabin].filter(Boolean).join(' · ') ||
                          personTypeLabel(p.person_type)}
                      </span>
                    </span>
                    {!p.is_active && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        Inactive
                      </Badge>
                    )}
                    {p.vessel_name && <Ship className="ml-2 h-3 w-3 text-muted-foreground" />}
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

export default PersonPicker;
