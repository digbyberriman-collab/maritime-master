import React, { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useCrewListPreferences, type CrewAdvancedFilters } from '@/modules/crew/hooks/useCrewListPreferences';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewAdvancedFilterSheetProps {
  members: CrewMemberWithStatus[];
}

const uniq = (arr: Array<string | null | undefined>) =>
  Array.from(new Set(arr.filter((x): x is string => !!x && x.length > 0))).sort();

const Chip: React.FC<{ active: boolean; label: string; onClick: () => void }> = ({ active, label, onClick }) => (
  <Badge
    variant={active ? 'default' : 'outline'}
    onClick={onClick}
    className="cursor-pointer select-none"
  >
    {label}
  </Badge>
);

export const CrewAdvancedFilterSheet: React.FC<CrewAdvancedFilterSheetProps> = ({ members }) => {
  const [open, setOpen] = useState(false);
  const advancedFilters = useCrewListPreferences((s) => s.advancedFilters);
  const setAdvancedFilters = useCrewListPreferences((s) => s.setAdvancedFilters);
  const clearAdvancedFilters = useCrewListPreferences((s) => s.clearAdvancedFilters);

  const facets = useMemo(() => ({
    ranks: uniq(members.map((m) => m.rank)),
    departments: uniq(members.map((m) => m.department)),
    vessels: uniq(members.map((m) => m.current_assignment?.vessel_name)),
    nationalities: uniq(members.map((m) => m.nationality)),
    accountStatuses: uniq(members.map((m) => m.account_status)),
  }), [members]);

  const activeCount =
    advancedFilters.ranks.length +
    advancedFilters.departments.length +
    advancedFilters.vessels.length +
    advancedFilters.nationalities.length +
    advancedFilters.accountStatuses.length +
    advancedFilters.certStatuses.length +
    advancedFilters.medicalStatuses.length +
    (advancedFilters.contractEndFrom ? 1 : 0) +
    (advancedFilters.contractEndTo ? 1 : 0);

  const toggle = <K extends keyof CrewAdvancedFilters>(key: K, value: string) => {
    const current = advancedFilters[key] as string[];
    const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value];
    setAdvancedFilters({ [key]: next } as Partial<CrewAdvancedFilters>);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-xs">{activeCount}</Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter crew</SheetTitle>
          <SheetDescription>Filters compose with quick chips and search.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          <FacetGroup label="Rank" items={facets.ranks} active={advancedFilters.ranks} onToggle={(v) => toggle('ranks', v)} />
          <FacetGroup label="Department" items={facets.departments} active={advancedFilters.departments} onToggle={(v) => toggle('departments', v)} />
          <FacetGroup label="Vessel" items={facets.vessels} active={advancedFilters.vessels} onToggle={(v) => toggle('vessels', v)} />
          <FacetGroup label="Nationality" items={facets.nationalities} active={advancedFilters.nationalities} onToggle={(v) => toggle('nationalities', v)} />
          <FacetGroup label="Account Status" items={facets.accountStatuses} active={advancedFilters.accountStatuses} onToggle={(v) => toggle('accountStatuses', v)} />
          <FacetGroup label="Cert Status" items={['valid', 'expiring', 'expired', 'missing']} active={advancedFilters.certStatuses} onToggle={(v) => toggle('certStatuses', v)} />
          <FacetGroup label="Medical Status" items={['valid', 'expiring', 'expired', 'missing']} active={advancedFilters.medicalStatuses} onToggle={(v) => toggle('medicalStatuses', v)} />

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contract end range</Label>
            <div className="flex gap-2">
              <Input
                type="date"
                value={advancedFilters.contractEndFrom ?? ''}
                onChange={(e) => setAdvancedFilters({ contractEndFrom: e.target.value || undefined })}
                aria-label="Contract end from"
              />
              <Input
                type="date"
                value={advancedFilters.contractEndTo ?? ''}
                onChange={(e) => setAdvancedFilters({ contractEndTo: e.target.value || undefined })}
                aria-label="Contract end to"
              />
            </div>
          </div>
        </div>

        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={clearAdvancedFilters}>Clear all</Button>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

const FacetGroup: React.FC<{
  label: string;
  items: string[];
  active: string[];
  onToggle: (v: string) => void;
}> = ({ label, items, active, onToggle }) => {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <Chip key={it} active={active.includes(it)} label={it} onClick={() => onToggle(it)} />
        ))}
      </div>
    </div>
  );
};
