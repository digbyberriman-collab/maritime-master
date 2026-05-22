import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { VIEW_CAPABILITIES, APPROVAL_CAPABILITIES, type Capability } from '../lib/capabilityCatalog';
import type { PermissionLevel } from '../lib/presets';

interface Props {
  permissions: Record<string, PermissionLevel | null>;
  onToggle: (capKey: string, enabled: boolean) => void;
}

const Row: React.FC<{ cap: Capability; checked: boolean; onChange: (v: boolean) => void }> = ({ cap, checked, onChange }) => (
  <label className={cn('flex items-center gap-2 py-1 cursor-pointer text-sm', cap.indent && 'pl-6')}>
    <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} />
    <span>{cap.label}</span>
    {cap.sensitive && (
      <Badge variant="outline" className="rounded text-[10px] px-1.5 py-0 bg-destructive/10 text-destructive border-destructive/30">
        Sensitive
      </Badge>
    )}
  </label>
);

export const CustomPermissionsCard: React.FC<Props> = ({ permissions, onToggle }) => {
  const isOn = (k: string) => !!permissions[k];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custom Permissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">View permissions</div>
          <div className="space-y-0.5">
            {VIEW_CAPABILITIES.map((cap) => (
              <Row key={cap.key} cap={cap} checked={isOn(cap.key)} onChange={(v) => onToggle(cap.key, v)} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Approval permissions</div>
          <div className="space-y-0.5">
            {APPROVAL_CAPABILITIES.map((cap) => (
              <Row key={cap.key} cap={cap} checked={isOn(cap.key)} onChange={(v) => onToggle(cap.key, v)} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};