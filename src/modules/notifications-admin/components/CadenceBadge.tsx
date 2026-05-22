import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STYLES: Record<string, string> = {
  realtime: 'bg-success/15 text-success border-transparent',
  weekly: 'bg-primary/10 text-primary border-transparent',
  daily: 'bg-warning/15 text-warning border-transparent',
};

export const CadenceBadge: React.FC<{ cadence: string }> = ({ cadence }) => (
  <Badge variant="outline" className={cn('rounded-full text-[10px] px-2 py-0 font-medium capitalize', STYLES[cadence] ?? '')}>
    {cadence}
  </Badge>
);