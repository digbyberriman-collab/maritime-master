/**
 * "Renewals and surveys" (gap/02 D12; X5 spec X5-02B), the next 90 days
 * from `fleet_dashboard_panels`:
 * - Insurance renewals: policies expired or expiring within 90 days
 *   (expiry engine, per-type windows), with the vessel or "Fleet" for a
 *   fleet policy and the insurer / policy number detail.
 * - Audits and surveys: open audits (overdue included) and certificate
 *   surveys falling due within 90 days; a certificate survey opens the
 *   vessel's certificates.
 *
 * Lists the caller cannot read are not shown (fleet insurance needs fleet
 * reach and the insurance area); the group is left out when neither is.
 */
import type { ReactNode } from 'react';
import { CalendarClock, Umbrella } from 'lucide-react';
import { EXPIRY_BUCKETS, type ExpiryBucket } from '@/lib/records/expiry';
import { ExpiryPill, StatusPill } from '@/shared/components/status';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import type { FleetDashboardPanelsJson, FleetPanelVessel } from '../../types/db.pending';
import { DaysPill, ExpiryPanels, PanelCard, PanelGroup, type PanelRow, type PanelScope } from './ExpiryPanels';

export interface InsuranceSurveysPanelProps extends PanelScope {
  insurance: FleetDashboardPanelsJson['insurance'];
  surveys: FleetDashboardPanelsJson['surveys'];
  className?: string;
}

const BUCKETS: ReadonlySet<string> = new Set(EXPIRY_BUCKETS);
const vesselName = (v: FleetPanelVessel): string => v.vessel_name ?? (v.vessel_id ? 'Vessel' : 'Fleet');

const asCardState = (state: 'ok' | 'module_off' | 'not_tracked' | 'no_access'): 'ok' | 'module_off' | 'not_tracked' =>
  state === 'ok' ? 'ok' : state === 'not_tracked' ? 'not_tracked' : 'module_off';

export function InsuranceSurveysPanel({ insurance, surveys, className, ...scope }: InsuranceSurveysPanelProps) {
  const fleet = scope.scope === 'fleet';
  const shown = ExpiryPanels.listShown;
  const cards: ReactNode[] = [];

  if (shown('insurance', insurance.state, scope)) {
    const rows: PanelRow[] =
      insurance.state === 'ok'
        ? insurance.items.map((item) => ({
            id: item.record_id,
            primary: item.label,
            secondary: [fleet || !item.vessel_id ? vesselName(item) : null, item.detail].filter(Boolean).join(' · ') || undefined,
            href: item.link_scope === 'vessel' && item.vessel_code ? vesselPath(item.vessel_code, item.link_rel) : undefined,
            badge: BUCKETS.has(item.bucket) ? (
              <ExpiryPill bucket={item.bucket as ExpiryBucket} daysRemaining={item.days_remaining} expiresOn={item.expires_on} />
            ) : (
              <StatusPill tone="neutral" label={item.bucket} />
            ),
          }))
        : [];
    cards.push(
      <PanelCard
        key="insurance"
        list="insurance"
        title="Insurance renewals"
        icon={Umbrella}
        state={asCardState(insurance.state)}
        total={insurance.state === 'ok' ? insurance.total : undefined}
        rows={rows}
        emptyText="No policy expires in the next 90 days."
        viewAllHref={scope.viewAllHref?.('insurance')}
      />,
    );
  }

  if (shown('surveys', surveys.state, scope)) {
    const rows: PanelRow[] =
      surveys.state === 'ok'
        ? surveys.items.map((item) => ({
            id: `${item.kind}:${item.id}`,
            primary: item.label,
            secondary: [fleet ? vesselName(item) : null, item.kind === 'certificate_survey' ? 'Certificate survey' : 'Audit', item.reference]
              .filter(Boolean)
              .join(' · '),
            href: item.kind === 'certificate_survey' && item.vessel_code ? vesselPath(item.vessel_code, 'certificates') : undefined,
            badge: <DaysPill daysLeft={item.days_remaining} />,
          }))
        : [];
    cards.push(
      <PanelCard
        key="surveys"
        list="surveys"
        title="Audits and surveys"
        icon={CalendarClock}
        state={asCardState(surveys.state)}
        total={surveys.state === 'ok' ? surveys.total : undefined}
        rows={rows}
        emptyText="No audit or survey in the next 90 days."
        viewAllHref={scope.viewAllHref?.('surveys')}
      />,
    );
  }

  if (cards.length === 0) return null;
  return (
    <PanelGroup title="Renewals and surveys" description="Next 90 days" columns={2} className={className}>
      {cards}
    </PanelGroup>
  );
}

export default InsuranceSurveysPanel;
