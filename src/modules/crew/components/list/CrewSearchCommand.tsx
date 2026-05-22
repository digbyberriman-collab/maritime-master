import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useCrewListPreferences } from '@/modules/crew/hooks/useCrewListPreferences';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewSearchCommandProps {
  query: string;
  onChange: (q: string) => void;
  members: CrewMemberWithStatus[];
  onSelectMember: (userId: string) => void;
}

const MAX_HINTS = 8;

const haystack = (m: CrewMemberWithStatus) =>
  [
    m.first_name, m.last_name, m.preferred_name,
    m.rank, m.nationality, m.email, m.department,
    m.cabin, m.passport_number,
    m.current_assignment?.vessel_name,
  ].filter(Boolean).join(' ').toLowerCase();

export const CrewSearchCommand: React.FC<CrewSearchCommandProps> = ({
  query, onChange, members, onSelectMember,
}) => {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(query);
  const recentSearches = useCrewListPreferences((s) => s.recentSearches);
  const pushRecentSearch = useCrewListPreferences((s) => s.pushRecentSearch);

  // 250ms debounce
  useEffect(() => {
    const t = setTimeout(() => onChange(internal), 250);
    return () => clearTimeout(t);
  }, [internal, onChange]);

  const hints = useMemo(() => {
    const q = internal.trim().toLowerCase();
    if (!q) return [];
    return members.filter((m) => haystack(m).includes(q)).slice(0, MAX_HINTS);
  }, [internal, members]);

  return (
    <Popover open={open && (internal.length > 0 || recentSearches.length > 0)} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search crew (name, rank, vessel, cabin…)"
            value={internal}
            onChange={(e) => setInternal(e.target.value)}
            onFocus={() => setOpen(true)}
            className="pl-8 pr-8"
          />
          {internal && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => {
                setInternal('');
                onChange('');
              }}
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(420px,90vw)]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <Command shouldFilter={false}>
          <CommandList>
            {hints.length > 0 && (
              <CommandGroup heading="Matches">
                {hints.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.id}
                    onSelect={() => {
                      pushRecentSearch(internal);
                      onSelectMember(m.user_id ?? m.id);
                      setOpen(false);
                    }}
                    className="flex flex-col items-start gap-0"
                  >
                    <span className="font-medium">
                      {`${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {m.rank ?? '—'} · {m.current_assignment?.vessel_name ?? 'No vessel'}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {internal.length === 0 && recentSearches.length > 0 && (
              <CommandGroup heading="Recent">
                {recentSearches.map((r) => (
                  <CommandItem key={r} value={r} onSelect={() => setInternal(r)}>
                    {r}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {internal.length > 0 && hints.length === 0 && (
              <CommandEmpty>No crew match "{internal}".</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
