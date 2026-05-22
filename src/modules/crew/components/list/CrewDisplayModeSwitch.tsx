import React from 'react';
import { Table2, LayoutGrid, Rows3, Siren } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CrewDisplayMode } from '@/modules/crew/hooks/useCrewListPreferences';

const MODES: Array<{ value: CrewDisplayMode; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'table', label: 'Table', Icon: Table2 },
  { value: 'card', label: 'Cards', Icon: LayoutGrid },
  { value: 'compact', label: 'Compact', Icon: Rows3 },
  { value: 'muster', label: 'Muster', Icon: Siren },
];

interface CrewDisplayModeSwitchProps {
  value: CrewDisplayMode;
  onChange: (v: CrewDisplayMode) => void;
}

export const CrewDisplayModeSwitch: React.FC<CrewDisplayModeSwitchProps> = ({ value, onChange }) => (
  <TooltipProvider delayDuration={200}>
    <ToggleGroup
      type="single"
      size="sm"
      value={value}
      onValueChange={(v) => v && onChange(v as CrewDisplayMode)}
      className="bg-muted/40 rounded-md p-0.5"
    >
      {MODES.map(({ value: v, label, Icon }) => (
        <Tooltip key={v}>
          <TooltipTrigger asChild>
            <ToggleGroupItem value={v} aria-label={label} className="h-8 w-8 p-0">
              <Icon className="h-4 w-4" />
            </ToggleGroupItem>
          </TooltipTrigger>
          <TooltipContent>{label}</TooltipContent>
        </Tooltip>
      ))}
    </ToggleGroup>
  </TooltipProvider>
);
