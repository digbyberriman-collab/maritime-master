/**
 * "Safety and compliance" (gap/02 D10, W9; X5 spec X5-02B) from
 * `fleet_dashboard_panels`:
 * - Corrective actions: open actions, most overdue first, with the action
 *   type, vessel, status and days overdue (or days to the due date). The
 *   live `corrective_actions` table has no severity column, so urgency is
 *   the overdue tone.
 * - Overdue drills: type, vessel, number, days overdue; each opens the
 *   vessel's drills.
 * - HESS meetings: due in the next 14 days (the 42-day cycle) from X2's
 *   `safety_hess_status`; "Not tracked yet." until X2 exposes it.
 *
 * A list the caller cannot read is not shown; Safety switched off on every
 * vessel shown says so (fleet), or the list is left out (vessel home).
 */
import type { ReactNode } from 'react';
import { ClipboardCheck, Siren, Users } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetDashboardPanelsJson, FleetPanelVessel } from '../../types/db.pending';
import { DaysPill, ExpiryPanels, PanelCard, PanelGroup, type PanelRow, type PanelScope } from './ExpiryPanels';

const SAFETY_OFF = 'Safety is off on every vessel shown.';

export interface SafetyPanelsProps extends PanelScope {
  correctiveActions: FleetDashboardPanelsJson['corrective_actions'];
  drills: FleetDashboardPanelsJson['overdue_drills'];
  hess: FleetDashboardPanelsJson['hess'];
  /** The day the server counted for (`yyyy-MM-dd`): days to a due date are counted from it. */
  today: string;
}

const vesselName = (v: FleetPanelVessel): string => v.vessel_name ?? (v.vessel_id ? 'Vessel' : 'Fleet');

/** Whole days from `from` to `to` (both `yyyy-MM-dd`, as calendar dates). */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "12 Nov 2026" for a date-only string, read as a calendar date. */
function formatDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SOURCE_LABEL: Readonly<Record<'incident' | 'audit_finding' | 'none', string | null>> = {
  incident: 'From an incident',
  audit_finding: 'From an audit finding',
  none: null,
};

export function SafetyPanels({ correctiveActions: ca, drills, hess, today, ...scope }: SafetyPanelsProps) {
  const fleet = scope.scope === 'fleet';
  const shown = ExpiryPanels.listShown;
  const cards: ReactNode[] = [];

  if (shown('corrective_actions', ca.state, scope)) {
    const rows: PanelRow[] =
      ca.state === 'ok'
        ? ca.items.map((item) => ({
            id: item.id,
            primary: `${item.action_number} · ${item.description}`,
            secondary: [fleet ? vesselName(item) : null, item.action_type, item.status, SOURCE_LABEL[item.source]].filter(Boolean).join(' · '),
            badge:
              item.days_overdue > 0 ? (
                <StatusPill tone="danger" label={`${item.days_overdue} d overdue`} />
              ) : (
                <DaysPill daysLeft={daysBetween(today, item.due_date)} />
              ),
          }))
        : [];
    cards.push(
      <PanelCard
        key="corrective_actions"
        list="corrective_actions"
        title="Corrective actions"
        hint={ca.state === 'ok' && ca.overdue > 0 ? `${ca.overdue.toLocaleString('en-GB')} overdue` : undefined}
        icon={ClipboardCheck}
        state={ca.state === 'ok' ? 'ok' : 'module_off'}
        offText={SAFETY_OFF}
        total={ca.state === 'ok' ? ca.total : undefined}
        rows={rows}
        emptyText="No open corrective action."
        viewAllHref={scope.viewAllHref?.('corrective_actions')}
      />,
    );
  }

  if (shown('overdue_drills', drills.state, scope)) {
    const rows: PanelRow[] =
      drills.state === 'ok'
        ? drills.items.map((item) => ({
            id: item.id,
            primary: item.drill_type ?? item.drill_number,
            secondary: [fleet ? vesselName(item) : null, item.drill_type ? item.drill_number : null, `Scheduled ${formatDay(item.scheduled_on)}`]
              .filter(Boolean)
              .join(' · '),
            href: item.vessel_code ? vesselPath(item.vessel_code, 'safety/drills') : undefined,
            badge: <StatusPill tone="danger" label={`${item.days_overdue} d overdue`} />,
          }))
        : [];
    cards.push(
      <PanelCard
        key="overdue_drills"
        list="overdue_drills"
        title="Overdue drills"
        icon={Siren}
        state={drills.state === 'ok' ? 'ok' : drills.state === 'not_tracked' ? 'not_tracked' : 'module_off'}
        offText={SAFETY_OFF}
        total={drills.state === 'ok' ? drills.total : undefined}
        rows={rows}
        emptyText="No drill overdue."
        viewAllHref={scope.viewAllHref?.('overdue_drills')}
      />,
    );
  }

  if (shown('hess', hess.state, scope)) {
    const rows: PanelRow[] =
      hess.state === 'ok'
        ? hess.items.map((item) => ({
            id: item.vessel_id ?? item.next_due_on,
            primary: fleet ? vesselName(item) : 'Next HESS meeting',
            secondary: `Due ${formatDay(item.next_due_on)}`,
            badge: <DaysPill daysLeft={item.days_remaining} />,
          }))
        : [];
    cards.push(
      <PanelCard
        key="hess"
        list="hess"
        title="HESS meetings"
        hint="Due in the next 14 days"
        icon={Users}
        state={hess.state === 'ok' ? 'ok' : hess.state === 'not_tracked' ? 'not_tracked' : 'module_off'}
        offText={SAFETY_OFF}
        total={hess.state === 'ok' ? hess.total : undefined}
        rows={rows}
        emptyText="No HESS meeting due in the next 14 days."
        viewAllHref={scope.viewAllHref?.('hess')}
      />,
    );
  }

  if (cards.length === 0) return null;
  return (
    <PanelGroup title="Safety and compliance" description="Most overdue first">
      {cards}
    </PanelGroup>
  );
}

export default SafetyPanels;
