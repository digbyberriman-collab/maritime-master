/**
 * Pieces the fleet operations reports share (gap/02 R7, R13, R17, R18;
 * X5-10B):
 *
 * - `VesselCell`: the vessel's name, a link into the vessel's own page when
 *   the vessel has a code (`vesselPath`), or the words for a row with no
 *   vessel (a fleet policy, a company audit);
 * - `RulesDisclosure`: "How … are counted", the rule behind each status in
 *   words, closed by default;
 * - `ReportNote`: a one-line note under the KPI tiles (what else is listed,
 *   what the report cannot show).
 *
 * Tokens only; 44 px targets on coarse pointers; visible focus.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { ReportVesselCoverage } from '../types/db.pending';

export const COARSE = '[@media(pointer:coarse)]:min-h-11';
export const ROW_LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);

export function VesselCell({
  vessel,
  rel,
  noVessel,
  className,
}: {
  vessel: Pick<ReportVesselCoverage, 'vessel_name' | 'vessel_code'> | undefined | null;
  /** The page inside the vessel to open, relative to /v/:vesselCode. */
  rel: string;
  /** Words for a row with no vessel. */
  noVessel: string;
  className?: string;
}) {
  if (!vessel) return <span className={cn('text-muted-foreground', className)}>{noVessel}</span>;
  if (!vessel.vessel_code) return <span className={cn('font-medium text-foreground', className)}>{vessel.vessel_name}</span>;
  return (
    <Link to={vesselPath(vessel.vessel_code, rel)} className={cn(ROW_LINK, 'font-medium text-foreground', className)}>
      {vessel.vessel_name}
    </Link>
  );
}

export interface RuleItem {
  key: string;
  marker: React.ReactNode;
  text: React.ReactNode;
}

export function RulesDisclosure({ title, items, footer, testId }: { title: string; items: readonly RuleItem[]; footer?: React.ReactNode; testId?: string }) {
  return (
    <details className="group rounded-lg border border-border bg-card text-card-foreground" data-testid={testId}>
      <summary className={cn('focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm font-medium', COARSE)}>
        {title}
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-quick group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border px-4 py-3 text-sm">
        <dl className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.key} className="flex min-w-0 flex-col items-start gap-1">
              <dt>{item.marker}</dt>
              <dd className="text-muted-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
        {footer ? <div className="text-muted-foreground">{footer}</div> : null}
      </div>
    </details>
  );
}

export function ReportNote({ children }: { children: React.ReactNode }) {
  return (
    <p role="note" className="flex items-start gap-2 text-sm text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
