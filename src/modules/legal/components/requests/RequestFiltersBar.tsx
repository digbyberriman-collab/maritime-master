import React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { PRIORITIES, RISK_LEVELS, STATUSES } from '@/modules/legal/lib/constants';
import { DEFAULT_REQUEST_FILTERS, type RequestFilters } from '@/modules/legal/lib/requests';
import type { LegalTeamMember } from '@/modules/legal/hooks/useLegalLookups';

interface RequestFiltersBarProps {
  filters: RequestFilters;
  onChange: (next: RequestFilters) => void;
  counts: Record<string, number>;
  /** Legal team members for the assignee filter (team only). */
  team?: LegalTeamMember[];
  showTeamFilters: boolean;
}

const STATUS_CHIPS: { value: RequestFilters['status']; label: string }[] = [
  { value: 'open', label: 'Open' },
  ...STATUSES.map((s) => ({ value: s.value, label: s.label })),
  { value: 'all', label: 'All' },
];

export const RequestFiltersBar: React.FC<RequestFiltersBarProps> = ({ filters, onChange, counts, team = [], showTeamFilters }) => {
  const set = <K extends keyof RequestFilters>(key: K, value: RequestFilters[K]) => onChange({ ...filters, [key]: value });
  const dirty = JSON.stringify(filters) !== JSON.stringify(DEFAULT_REQUEST_FILTERS);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={filters.search}
            onChange={(e) => set('search', e.target.value)}
            placeholder="Search title, reference or counterparty"
            className="pl-9"
            aria-label="Search requests"
          />
        </div>
        <Select value={filters.priority} onValueChange={(v) => set('priority', v as RequestFilters['priority'])}>
          <SelectTrigger className="md:w-40" aria-label="Priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any priority</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filters.risk} onValueChange={(v) => set('risk', v as RequestFilters['risk'])}>
          <SelectTrigger className="md:w-40" aria-label="Risk">
            <SelectValue placeholder="Risk" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any risk</SelectItem>
            {RISK_LEVELS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showTeamFilters && (
          <>
            <Select value={filters.assignee} onValueChange={(v) => set('assignee', v)}>
              <SelectTrigger className="md:w-48" aria-label="Assignee">
                <SelectValue placeholder="Assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any assignee</SelectItem>
                <SelectItem value="me">Assigned to me</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {team.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch id="legal-mine" checked={filters.mine} onCheckedChange={(v) => set('mine', v)} />
              <Label htmlFor="legal-mine" className="text-sm">
                Raised by me
              </Label>
            </div>
          </>
        )}
        {dirty && (
          <Button variant="ghost" size="sm" onClick={() => onChange(DEFAULT_REQUEST_FILTERS)}>
            <X className="mr-1 h-4 w-4" /> Clear
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status filter">
        {STATUS_CHIPS.map((chip) => {
          const active = filters.status === chip.value;
          const count = counts[chip.value] ?? 0;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => set('status', chip.value)}
              aria-pressed={active}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {chip.label}
              <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default RequestFiltersBar;
