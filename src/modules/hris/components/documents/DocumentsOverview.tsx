import React from 'react';
import { AlertTriangle, CalendarClock, CalendarRange, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDocumentExpiryItems, type DocumentExpiryItem, type DocumentExpiryItemType } from '@/modules/hris/hooks/useDocumentExpiryItems';
import { expiryLabel, expiryTone, formatDate, toneClass } from '@/modules/hris/lib/format';

interface DocumentsOverviewProps {
  onSelectCrew: (profileId: string) => void;
}

const TYPE_LABEL: Record<DocumentExpiryItemType, string> = {
  certificate: 'Certificate',
  passport: 'Passport',
  medical: 'Medical',
};

interface KpiTileProps {
  label: string;
  hint: string;
  value: number;
  icon: React.ElementType;
  className: string;
  loading: boolean;
}

const KpiTile: React.FC<KpiTileProps> = ({ label, hint, value, icon: Icon, className, loading }) => (
  <Card className={cn('border', className)}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{label}</CardTitle>
      <Icon className="h-4 w-4 opacity-70" />
    </CardHeader>
    <CardContent>
      {loading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-semibold tabular-nums">{value}</div>}
      <p className="mt-1 text-xs opacity-80">{hint}</p>
    </CardContent>
  </Card>
);

const ExpiryRow: React.FC<{ item: DocumentExpiryItem; onSelect: () => void }> = ({ item, onSelect }) => {
  const tone = expiryTone(item.due_date);
  return (
    <TableRow
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <TableCell className="font-medium">{item.crew_name}</TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">{TYPE_LABEL[item.item_type]}</Badge>
      </TableCell>
      <TableCell className="max-w-[280px] truncate text-muted-foreground">{item.label}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(item.due_date)}</TableCell>
      <TableCell className="text-right">
        <Badge variant="outline" className={cn('whitespace-nowrap', toneClass[tone])}>{expiryLabel(item.due_date)}</Badge>
      </TableCell>
    </TableRow>
  );
};

/**
 * Company-wide view when no crew member is selected: expiry KPIs and the
 * soonest items. Clicking a row drills into that crew member.
 */
export const DocumentsOverview: React.FC<DocumentsOverviewProps> = ({ onSelectCrew }) => {
  const { stats, soonest, isLoading, isError, error } = useDocumentExpiryItems({ soonestLimit: 50 });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile label="Expired" hint="Certificates, passports and medicals past their date" value={stats.expired} icon={FileWarning} className={toneClass.expired} loading={isLoading} />
        <KpiTile label="Due in 30 days" hint="Renewal needed now" value={stats.dueIn30} icon={AlertTriangle} className={toneClass.critical} loading={isLoading} />
        <KpiTile label="Due in 90 days" hint="Includes the 30-day items" value={stats.dueIn90} icon={CalendarRange} className={toneClass.warning} loading={isLoading} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Soonest expiries
          </CardTitle>
          <CardDescription>
            {stats.total > 0 ? `Showing ${soonest.length} of ${stats.total} dated items. Select a row to open that crew member.` : 'Dated certificates, passports and medicals across the company.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isError ? (
            <p className="p-6 text-sm text-destructive">Could not load expiry items: {error instanceof Error ? error.message : 'unknown error'}</p>
          ) : isLoading ? (
            <div className="space-y-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : soonest.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No dated documents recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soonest.map((item) => (
                    <ExpiryRow key={`${item.item_type}-${item.record_id}`} item={item} onSelect={() => onSelectCrew(item.profile_id)} />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DocumentsOverview;
