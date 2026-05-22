import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ModuleGroup, GroupLevel } from '../lib/moduleGroups';
import type { PermissionLevel } from '../lib/presets';

interface ModuleInfo { key: string; name: string }

interface Props {
  group: ModuleGroup;
  modules: ModuleInfo[];
  perms: Record<string, PermissionLevel | null>;
  groupLevel: GroupLevel;
  onGroupChange: (value: string) => void;
  onModuleChange: (moduleKey: string, value: string) => void;
}

const PERM_OPTIONS = [
  { value: 'none', label: 'No Access', dot: 'bg-muted-foreground' },
  { value: 'view', label: 'Read Only', dot: 'bg-primary' },
  { value: 'edit', label: 'Read & Write', dot: 'bg-success' },
  { value: 'admin', label: 'Admin', dot: 'bg-warning' },
];

const Dot: React.FC<{ className: string }> = ({ className }) => (
  <span className={cn('inline-block w-2 h-2 rounded-full mr-2', className)} />
);

const triggerClassFor = (level: GroupLevel) => {
  if (level === 'mixed') return 'border-warning/50 text-warning';
  if (level === 'edit' || level === 'admin') return 'border-success/40';
  if (level === 'view') return 'border-primary/40';
  return '';
};

export const ModuleGroupRow: React.FC<Props> = ({ group, modules, perms, groupLevel, onGroupChange, onModuleChange }) => {
  const [open, setOpen] = useState(false);
  const groupSelectValue = groupLevel === 'mixed' ? '' : (groupLevel === 'none' ? 'none' : groupLevel);

  return (
    <div className="rounded-md border border-border bg-background">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 font-medium text-sm text-foreground hover:text-primary transition-colors"
        >
          <ChevronDown className={cn('w-4 h-4 transition-transform', !open && '-rotate-90')} />
          {group.label}
          <span className="text-xs text-muted-foreground font-normal">({group.moduleKeys.length})</span>
        </button>
        <Select value={groupSelectValue} onValueChange={onGroupChange}>
          <SelectTrigger className={cn('w-44 h-8', triggerClassFor(groupLevel))}>
            {groupLevel === 'mixed' ? (
              <span className="text-xs"><Dot className="bg-warning" />Mixed</span>
            ) : (
              <SelectValue placeholder="Choose…" />
            )}
          </SelectTrigger>
          <SelectContent>
            {PERM_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                <span className="flex items-center"><Dot className={o.dot} />{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {open && (
        <div className="border-t border-border bg-muted/20 px-4 py-2 space-y-1.5">
          {modules.map((m) => {
            const v = (perms[m.key] ?? 'none') as string;
            return (
              <div key={m.key} className="flex items-center justify-between gap-3 pl-6 pr-1 py-1.5">
                <div className="text-sm text-foreground">{m.name}</div>
                <Select value={v} onValueChange={(nv) => onModuleChange(m.key, nv)}>
                  <SelectTrigger className="w-40 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERM_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="flex items-center"><Dot className={o.dot} />{o.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};