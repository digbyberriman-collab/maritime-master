import React from 'react';
import { UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useLegalPeople } from '@/modules/legal/hooks/useLegalLookups';
import { personInitials } from '@/modules/legal/lib/people';

interface PersonChipProps {
  userId: string | null | undefined;
  /** Shown when there is no user (e.g. "Unassigned"). */
  emptyLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
  /** Secondary line: rank / position. */
  detail?: boolean;
}

/** Avatar + name for an auth user id, resolved from the company directory. */
export const PersonChip: React.FC<PersonChipProps> = ({ userId, emptyLabel = 'Unassigned', size = 'sm', className, detail }) => {
  const { personFor, isLoading } = useLegalPeople();
  const person = personFor(userId);
  const avatar = size === 'sm' ? 'h-6 w-6' : 'h-8 w-8';

  if (!userId) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-muted-foreground', className)}>
        <span className={cn('flex items-center justify-center rounded-full border border-dashed border-border', avatar)}>
          <UserRound className="h-3 w-3" />
        </span>
        <span className="text-sm">{emptyLabel}</span>
      </span>
    );
  }

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar className={avatar}>
        <AvatarImage src={person?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="text-[10px]">{person ? personInitials(person) : '?'}</AvatarFallback>
      </Avatar>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-sm text-foreground">{person?.displayName ?? (isLoading ? 'Loading…' : 'Unknown user')}</span>
        {detail && person && (person.rank || person.position) && (
          <span className="truncate text-xs text-muted-foreground">{person.rank ?? person.position}</span>
        )}
      </span>
    </span>
  );
};

export default PersonChip;
