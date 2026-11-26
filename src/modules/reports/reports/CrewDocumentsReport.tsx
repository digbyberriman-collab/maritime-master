/**
 * Fleet › Reports › Crew documents (`/fleet/reports/crew-documents`;
 * gap/02 R4; DECISIONS C5, D-31, D-X5-12, D-X5-21; X5 spec X5-03B). The
 * crew's passports, visas, certificates, work authorisations, training
 * certificates and medicals that have expired or are due, most urgent
 * first, from the expiry engine (`fleet_expiry_items`), one page of 100 at
 * a time.
 *
 * - Sources: the legacy crew sources of 040000 and X1's crew documents
 *   (`crew_documents`, once X1-04 registers it and retires the legacy
 *   certificate and passport rows); the server reads each with its own
 *   read area, so a reader sees only the documents they may.
 * - Filters (URL, ../lib/expiryReports.ts): Status, Valid items, Document
 *   type (the source), Vessel (every vessel shown, or one of them), the
 *   search (person or document) and the page.
 * - "No current vessel": with every vessel shown, a reader with fleet
 *   reach also gets the people who have no current vessel (the server
 *   lists them only to fleet-level readers, D-X5-21), shown in the Vessel
 *   column as "No current vessel"; the tiles say they are not counted.
 * - Each row shows its warning window: passports warn 270 days ahead by
 *   default, everything else 90, unless the company set its own
 *   ("Alert windows").
 * - Personal data (`personalData: true`): the export engine refuses the
 *   export while the export log is not set up (D-X5-12).
 *
 * The report capability is the crew documents read
 * (`vessel.crew.crew_certificates.view`, checked by the report page) on
 * top of the reports route guard.
 */
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { DataTableColumn } from '@/shared/components/data/DataTable';
import type { FleetExpiryItem } from '@/modules/fleet';
import { vesselPath } from '@/modules/vessels/lib/vesselCode';
import { ExpiryDay, ExpiryItemsReport, ExpiryStatus } from '../components/ExpiryItemsReport';
import type { ReportComponentProps } from '../registry';
import { NO_CURRENT_VESSEL_LABEL, expiryItemHref, itemTypeLabel, windowText } from '../lib/expiryReports';

const COARSE = '[@media(pointer:coarse)]:min-h-11';
const LINK = cn('-mx-1 inline-flex min-h-8 items-center rounded-sm px-1 hover:underline focus-ring', COARSE);

function Person({ item }: { item: FleetExpiryItem }) {
  return <span className="font-medium text-foreground">{item.personName ?? 'Unnamed crew member'}</span>;
}

function Vessel({ item }: { item: FleetExpiryItem }) {
  if (!item.vesselName) return <span className="text-muted-foreground">{NO_CURRENT_VESSEL_LABEL}</span>;
  if (!item.vesselCode) return <span>{item.vesselName}</span>;
  return (
    <Link to={vesselPath(item.vesselCode, '')} className={cn(LINK, 'text-foreground')}>
      {item.vesselName}
    </Link>
  );
}

function Document({ item }: { item: FleetExpiryItem }) {
  const href = expiryItemHref(item);
  return (
    <span className="flex min-w-0 flex-col">
      {href ? (
        <Link to={href} className={cn(LINK, 'text-foreground')} aria-label={`${item.label} of ${item.personName ?? 'the crew member'}`}>
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
    { id: 'person', header: 'Person', sticky: true, minWidth: 170, value: (r) => r.personName, cell: (r) => <Person item={r} /> },
    { id: 'vessel', header: 'Vessel', minWidth: 140, value: (r) => r.vesselName ?? NO_CURRENT_VESSEL_LABEL, cell: (r) => <Vessel item={r} /> },
    { id: 'document', header: 'Document', minWidth: 220, value: (r) => r.label, cell: (r) => <Document item={r} /> },
    { id: 'type', header: 'Type', minWidth: 140, value: (r) => itemTypeLabel(r.itemType) },
    { id: 'expires', header: 'Expires', kind: 'date', minWidth: 120, value: (r) => r.expiresOn, cell: (r) => <ExpiryDay value={r.expiresOn} />, emptyReason: 'No expiry date' },
    { id: 'status', header: 'Status', minWidth: 170, cell: (r) => <ExpiryStatus item={r} today={today} /> },
    { id: 'window', header: 'Warns', kind: 'number', minWidth: 90, value: (r) => r.windowDays, cell: (r) => <span className="tabular-nums">{windowText(r.windowDays)}</span> },
  ];
}

function DocumentCard({ item, today }: { item: FleetExpiryItem; today: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Person item={item} />
        <ExpiryStatus item={item} today={today} />
      </div>
      <Document item={item} />
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Type</dt>
          <dd>{itemTypeLabel(item.itemType)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="type-caption text-muted-foreground">Vessel</dt>
          <dd>
            <Vessel item={item} />
          </dd>
        </div>
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
      </dl>
    </div>
  );
}

const renderCard = (item: FleetExpiryItem, today: string) => <DocumentCard item={item} today={today} />;

export default function CrewDocumentsReport({ definition }: ReportComponentProps) {
  return <ExpiryItemsReport definition={definition} variant="crew" columns={columns} renderCard={renderCard} />;
}
