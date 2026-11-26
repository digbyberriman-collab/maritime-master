/**
 * Fleet › Reports › Fleet certificates (`/fleet/reports/fleet-certificates`;
 * gap/02 R3; DECISIONS C5, D-31; X5 spec X5-03B). Every vessel
 * certificate of the vessels shown that has expired or is due, most urgent
 * first, from the expiry engine (`fleet_expiry_items`, source
 * `vessel_certificates`), one page of 100 at a time.
 *
 * - Filters (URL, ../lib/expiryReports.ts): Status (expired and due, or one
 *   bucket), Valid items (the show-valid toggle), the certificate search
 *   (name, number or issuing authority) and the page.
 * - Tiles: Expired, Endorsement overdue, ≤ 30 d, Endorsement due,
 *   Due ≤ window, Valid; the bucket tiles open the list filtered to them.
 * - Columns: vessel, certificate (number and authority), expiry, status
 *   (the server's bucket and days), the warning window, the endorsement
 *   and Verified. Legacy certificates carry no endorsement and no
 *   verification: Verified is "—" until gap/06's certificate register
 *   registers its own source (X3); the endorsement fills in then too.
 * - Export: the rows on screen (no personal data), through the engine.
 *
 * The report capability is the vessel certificates read
 * (`vessel.certificates.status_summary.view`, checked by the report page)
 * on top of the reports route guard; the server gates each vessel too.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import type { FleetExpiryItem } from '@/modules/fleet';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { EndorsementCell, ExpiryDay, ExpiryItemsReport, ExpiryStatus } from '../components/ExpiryItemsReport';
import type { ReportComponentProps } from '../registry';
import { expiryItemHref, windowText } from '../lib/expiryReports';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);

const VERIFIED_PENDING = 'Verification is recorded once certificates move to the certificate register.';

function VesselName({ item }: { item: FleetExpiryItem }) {
  if (!item.vesselName) return null;
  if (!item.vesselCode) return <span className="font-medium text-foreground">{item.vesselName}</span>;
  return (
    <Link to={vesselPath(item.vesselCode, '')} className={cn(LINK, 'font-medium text-foreground')}>
      {item.vesselName}
    </Link>
  );
}

function Certificate({ item }: { item: FleetExpiryItem }) {
  const href = expiryItemHref(item);
  return (
    <span className="flex min-w-0 flex-col">
      {href ? (
        <Link to={href} className={cn(LINK, 'text-foreground')} aria-label={`${item.label} on ${item.vesselName ?? 'the vessel'}`}>
          {item.label}
        </Link>
      ) : (
        <span className="text-foreground">{item.label}</span>
      )}
      {item.detail ? <span className="type-caption text-muted-foreground">{item.detail}</span> : null}
    </span>
  );
}

function columns(today: string): DataTableColumn<FleetExpiryItem>[] {
  return [
    { id: 'vessel', header: 'Vessel', sticky: true, minWidth: 150, value: (r) => r.vesselName, cell: (r) => <VesselName item={r} /> },
    { id: 'certificate', header: 'Certificate', minWidth: 260, value: (r) => r.label, cell: (r) => <Certificate item={r} /> },
    { id: 'expires', header: 'Expires', kind: 'date', minWidth: 120, value: (r) => r.expiresOn, cell: (r) => <ExpiryDay value={r.expiresOn} />, emptyReason: 'No expiry date' },
    { id: 'status', header: 'Status', minWidth: 170, cell: (r) => <ExpiryStatus item={r} today={today} /> },
    { id: 'window', header: 'Warns', kind: 'number', minWidth: 90, value: (r) => r.windowDays, cell: (r) => <span className="tabular-nums">{windowText(r.windowDays)}</span> },
    {
      id: 'endorsement',
      header: 'Endorsement',
      minWidth: 170,
      cell: (r) => <EndorsementCell item={r} />,
      emptyReason: 'No endorsement due',
    },
    { id: 'verified', header: 'Verified', minWidth: 90, cell: () => null, emptyReason: VERIFIED_PENDING },
  ];
}

function CertificateCard({ item, today }: { item: FleetExpiryItem; today: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <VesselName item={item} />
        <ExpiryStatus item={item} today={today} />
      </div>
      <Certificate item={item} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Expires</dt>
          <dd>
            <ExpiryDay value={item.expiresOn} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Warns</dt>
          <dd className="tabular-nums">{windowText(item.windowDays)}</dd>
        </div>
        {item.endorsementState ? (
          <div className="col-span-2 min-w-0">
            <dt className="type-caption text-muted-foreground">Endorsement</dt>
            <dd>
              <EndorsementCell item={item} />
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

const renderCard = (item: FleetExpiryItem, today: string) => <CertificateCard item={item} today={today} />;

export default function FleetCertificatesReport({ definition }: ReportComponentProps) {
  return <ExpiryItemsReport definition={definition} variant="certificates" columns={columns} renderCard={renderCard} />;
}
