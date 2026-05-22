import React from 'react';
import { FileText, Clock, CalendarX, ShieldAlert, Wrench, Euro } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FleetKPI {
  documentAlerts: { value: number; sub: string };
  hoursOfRest: { value: number; sub: string };
  leaveOverdue: { value: number; sub: string };
  safety: { value: number; sub: string };
  technical: { value: number; sub: string };
  accounting: { value: number; sub: string };
}

interface Tile {
  label: string;
  value: number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'amber' | 'sky' | 'emerald' | 'rose' | 'slate' | 'violet';
}

const TONE: Record<Tile['tone'], string> = {
  amber: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  sky: 'bg-sky-50 text-sky-900 dark:bg-sky-950/40 dark:text-sky-100',
  emerald: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100',
  rose: 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100',
  slate: 'bg-slate-50 text-slate-900 dark:bg-slate-900/60 dark:text-slate-100',
  violet: 'bg-violet-50 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100',
};

const VALUE_TONE: Record<Tile['tone'], string> = {
  amber: 'text-amber-700 dark:text-amber-300',
  sky: 'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  rose: 'text-rose-700 dark:text-rose-300',
  slate: 'text-slate-700 dark:text-slate-300',
  violet: 'text-violet-700 dark:text-violet-300',
};

export const FleetKPITiles: React.FC<{ kpi: FleetKPI }> = ({ kpi }) => {
  const tiles: Tile[] = [
    { label: 'Document Alerts', value: kpi.documentAlerts.value, sub: kpi.documentAlerts.sub, icon: FileText, tone: 'amber' },
    { label: 'Hours of Rest', value: kpi.hoursOfRest.value, sub: kpi.hoursOfRest.sub, icon: Clock, tone: 'emerald' },
    { label: 'Leave Overdue', value: kpi.leaveOverdue.value, sub: kpi.leaveOverdue.sub, icon: CalendarX, tone: 'emerald' },
    { label: 'Safety', value: kpi.safety.value, sub: kpi.safety.sub, icon: ShieldAlert, tone: kpi.safety.value > 0 ? 'rose' : 'emerald' },
    { label: 'Technical', value: kpi.technical.value, sub: kpi.technical.sub, icon: Wrench, tone: kpi.technical.value > 0 ? 'amber' : 'emerald' },
    { label: 'Accounting', value: kpi.accounting.value, sub: kpi.accounting.sub, icon: Euro, tone: kpi.accounting.value > 0 ? 'amber' : 'emerald' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {tiles.map((t) => (
        <div key={t.label} className={cn('rounded-lg p-4 border border-transparent', TONE[t.tone])}>
          <div className="flex items-start justify-between">
            <span className="text-[10px] uppercase tracking-wider font-semibold opacity-80">
              {t.label}
            </span>
            <t.icon className="w-4 h-4 opacity-70" />
          </div>
          <div className={cn('text-3xl font-bold mt-2', VALUE_TONE[t.tone])}>{t.value}</div>
          <div className="text-xs opacity-75 mt-1 line-clamp-2">{t.sub}</div>
        </div>
      ))}
    </div>
  );
};

export default FleetKPITiles;