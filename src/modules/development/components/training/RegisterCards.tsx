/**
 * The training applications register as cards, below 768 px (gap/02 TR3;
 * gap/04 C62; X5-07B): who, what, when, cost and where it stands; the whole
 * card opens the application.
 */
import React from 'react';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/shared/components/status';
import { nextActor } from '../../lib/applicationMachine';
import { amountsByCurrency, crewName, formatCourseDates, formatCurrencyTotals, type FleetApplicationRow } from './fleetTrainingModel';
import { categoryLabel, type RegisterContext } from './registerColumns';
import { COARSE } from './TrainingParts';

/** The register as cards (below 768 px): who, what, when, cost and where it stands; the whole card opens it. */
export function RegisterCards({
  rows,
  ctx,
  onOpen,
  label,
}: {
  rows: readonly FleetApplicationRow[];
  ctx: RegisterContext;
  onOpen: (row: FleetApplicationRow) => void;
  label: string;
}) {
  return (
    <ul className="space-y-3" aria-label={label}>
      {rows.map((r) => {
        const dates = formatCourseDates(r.course_start_date, r.course_end_date);
        const cost = formatCurrencyTotals(amountsByCurrency(r));
        return (
          <li key={r.id}>
            <Card className="p-0">
              <button
                type="button"
                onClick={() => onOpen(r)}
                className={`focus-ring flex w-full flex-col gap-2 rounded-lg p-4 text-left ${COARSE}`}
                aria-label={`Open ${r.course_name} for ${crewName(r.crew_member)}`}
              >
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{r.course_name}</p>
                    <p className="type-caption text-muted-foreground">
                      {[crewName(r.crew_member), r.crew_member?.department, ctx.showVessel ? ctx.vesselName(r.vessel_id) : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <StatusPill domain="training_application" status={r.status} size="sm" />
                </div>
                <p className="type-caption text-muted-foreground">
                  {[categoryLabel(ctx, r.category), dates ?? 'Not scheduled yet', cost].filter(Boolean).join(' · ')}
                </p>
                <p className="type-caption text-muted-foreground">
                  {nextActor(r, ctx.mode).label} · <span className="type-mono">{r.application_number}</span>
                </p>
              </button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
