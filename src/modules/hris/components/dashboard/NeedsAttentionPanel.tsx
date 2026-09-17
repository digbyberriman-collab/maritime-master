import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import { attentionPath, hrisLink, type AttentionItem, type AttentionItemType } from '@/modules/hris/hooks/useHrDashboard';

const TYPE_CLASS: Record<AttentionItemType, string> = {
  contract: 'bg-primary/10 text-primary border-primary/20',
  probation: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  passport: 'bg-muted text-muted-foreground border-border',
  visa: 'bg-muted text-muted-foreground border-border',
  medical: 'bg-muted text-muted-foreground border-border',
  certificate: 'bg-muted text-muted-foreground border-border',
  review: 'bg-sky-500/10 text-sky-600 border-sky-500/20',
  objective: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  warning: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

type Filter = 'all' | 'overdue' | 'expiry' | 'performance';

interface NeedsAttentionPanelProps {
  items: AttentionItem[];
  isLoading?: boolean;
  error?: unknown;
  vesselName: (id: string | null | undefined) => string | null;
  module: string | null;
  /** Hide the crew column and vessel column (self-service view). */
  compact?: boolean;
  limit?: number;
  title?: string;
  description?: string;
}

/** Unified "what needs doing" list from hr_expiry_items and hr_performance_due_items. */
export const NeedsAttentionPanel: React.FC<NeedsAttentionPanelProps> = ({
  items,
  isLoading,
  error,
  vesselName,
  module,
  compact,
  limit = 25,
  title = 'Needs attention',
  description = 'Expiring contracts, documents and certificates, reviews and objectives due, and lapsing warnings. Overdue first.',
}) => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'overdue') return items.filter((i) => i.days_remaining < 0);
    if (filter === 'expiry' || filter === 'performance') return items.filter((i) => i.kind === filter);
    return items;
  }, [items, filter]);
  const visible = showAll ? filtered : filtered.slice(0, limit);
  const overdue = items.filter((i) => i.days_remaining < 0).length;

  const open = (item: AttentionItem) => navigate(hrisLink(attentionPath(item), { module, crew: item.profile_id }));

  return (
    <Card className="bg-card">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4 text-muted-foreground" /> {title}
              {overdue > 0 && (
                <Badge variant="outline" className={cn('text-[10px]', toneClass.expired)}>
                  {overdue} overdue
                </Badge>
              )}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'overdue', 'expiry', 'performance'] as Filter[]).map((f) => (
              <Button key={f} type="button" size="sm" variant={filter === f ? 'secondary' : 'ghost'} className="h-7 px-2 text-xs" onClick={() => setFilter(f)}>
                {f === 'all' ? `All (${items.length})` : f === 'overdue' ? `Overdue (${overdue})` : f === 'expiry' ? 'Expiries' : 'Performance'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : error ? (
          <p className="px-6 pb-6 text-sm text-destructive">Could not load the attention list: {error instanceof Error ? error.message : 'unexpected error'}</p>
        ) : visible.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Nothing needs attention in this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Type</TableHead>
                  {!compact && <TableHead>Crew</TableHead>}
                  <TableHead>Item</TableHead>
                  {!compact && <TableHead className="hidden md:table-cell">Vessel</TableHead>}
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((item) => {
                  const tone = expiryTone(item.due_date);
                  return (
                    <TableRow key={`${item.item_type}-${item.record_id}`} className="cursor-pointer" onClick={() => open(item)}>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-[10px] capitalize', TYPE_CLASS[item.item_type])}>
                          {item.item_type}
                        </Badge>
                      </TableCell>
                      {!compact && <TableCell className="font-medium">{item.crew_name}</TableCell>}
                      <TableCell className="max-w-[220px] truncate">{item.kind === 'performance' && item.item_type !== 'objective' ? humanise(item.label) : item.label}</TableCell>
                      {!compact && <TableCell className="hidden text-muted-foreground md:table-cell">{vesselName(item.vessel_id) ?? '—'}</TableCell>}
                      <TableCell className="whitespace-nowrap">{formatDate(item.due_date)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className={cn('whitespace-nowrap text-[10px]', toneClass[tone])}>
                          {expiryLabel(item.due_date)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {filtered.length > limit && (
              <div className="border-t px-4 py-2 text-center">
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
                  {showAll ? 'Show fewer' : `Show all ${filtered.length}`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default NeedsAttentionPanel;
