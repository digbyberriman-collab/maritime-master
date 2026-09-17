import React, { useMemo, useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useCandidates } from '@/modules/hris/hooks/useRecruitment';
import { DEFAULT_CANDIDATE_FILTERS, candidateInitials, candidateName, type VacancyRow } from '@/modules/hris/lib/recruitment';
import { MatchScoreBadge } from './MatchScoreBadge';
import { CandidateStatusBadge } from './RecruitmentBadges';

interface AddCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vacancy: VacancyRow;
  /** Candidates already in this vacancy's pipeline. */
  excludeCandidateIds: readonly string[];
  onPick: (candidateId: string) => Promise<void>;
  onCreateNew: () => void;
  isPending?: boolean;
}

const PICK_FILTERS = { ...DEFAULT_CANDIDATE_FILTERS, status: 'all' as const };

/** Pick an existing candidate for a vacancy, or jump to creating a new one. */
export const AddCandidateDialog: React.FC<AddCandidateDialogProps> = ({ open, onOpenChange, vacancy, excludeCandidateIds, onPick, onCreateNew, isPending }) => {
  const { candidates, isLoading } = useCandidates(PICK_FILTERS);
  const [selected, setSelected] = useState<string | null>(null);

  const excluded = useMemo(() => new Set(excludeCandidateIds), [excludeCandidateIds]);
  const eligible = useMemo(
    () => candidates.filter((c) => !excluded.has(c.id) && (c.status === 'active' || c.status === 'hired')),
    [candidates, excluded],
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { setSelected(null); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add candidate to {vacancy.title}</DialogTitle>
          <DialogDescription>Choose someone from the candidate pool, or create a new candidate record.</DialogDescription>
        </DialogHeader>
        <Command filter={(value, search) => (value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)} className="rounded-md border">
          <CommandInput placeholder="Search by name, rank or email…" />
          <CommandList className="max-h-72">
            <CommandEmpty>{isLoading ? 'Loading candidates…' : 'No eligible candidates. Create a new one below.'}</CommandEmpty>
            <CommandGroup>
              {eligible.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`${candidateName(c)} ${c.rank ?? ''} ${c.email ?? ''} ${c.department ?? ''}`}
                  onSelect={() => setSelected(c.id === selected ? null : c.id)}
                  className={c.id === selected ? 'bg-accent' : undefined}
                >
                  <Avatar className="mr-2 h-7 w-7">
                    <AvatarFallback className="text-[10px]">{candidateInitials(c)}</AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{candidateName(c)}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[c.rank, c.department, c.nationality].filter(Boolean).join(' · ') || c.email || '—'}
                    </span>
                  </span>
                  {c.status !== 'active' && <CandidateStatusBadge status={c.status} className="ml-2 text-[10px]" />}
                  <MatchScoreBadge candidate={c} vacancy={vacancy} className="ml-2 text-[10px]" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onCreateNew} disabled={isPending}>
            <UserPlus className="mr-2 h-4 w-4" /> New candidate
          </Button>
          <Button type="button" disabled={!selected || isPending} onClick={() => selected && void onPick(selected)}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Add to pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddCandidateDialog;
