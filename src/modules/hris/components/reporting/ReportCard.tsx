import React from 'react';
import { Download } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { downloadTextFile, fileSlug, toCsv, type CsvSection } from '@/modules/hris/lib/reports';

export interface ReportCardProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Rows behind the chart; exported verbatim as CSV. */
  csv: CsvSection;
  isLoading?: boolean;
  /** Extra header content (e.g. a small stat). */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

/** A report: title, chart, and an "Export CSV" of the exact rows the chart shows. */
export const ReportCard: React.FC<ReportCardProps> = ({ icon: Icon, title, description, csv, isLoading, aside, children }) => {
  const exportCsv = () => {
    downloadTextFile(`\uFEFF${toCsv(csv.headers, csv.rows)}`, `hr-${fileSlug(title)}.csv`);
  };
  return (
    <Card className="bg-card">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {Icon && <Icon className="h-4 w-4 text-muted-foreground" />} {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {aside}
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={exportCsv} disabled={isLoading || csv.rows.length === 0} title="Export this report as CSV">
              <Download className="mr-1 h-3.5 w-3.5" /> CSV
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>{isLoading ? <Skeleton className="h-[240px] w-full" /> : children}</CardContent>
    </Card>
  );
};

export default ReportCard;
