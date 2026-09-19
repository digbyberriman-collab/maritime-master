import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PriorityBadge, RiskBadge, SlaBadge, StatusBadge } from '@/modules/legal/components/badges';
import { requestTypeLabel } from '@/modules/legal/lib/constants';
import type { LegalRequestRow } from '@/modules/legal/lib/requests';
import { LEGAL_PATHS } from '@/modules/legal/paths';

interface RequestMiniListProps {
  title: string;
  description?: string;
  rows: LegalRequestRow[];
  emptyText: string;
  /** Show SLA + priority (attention list) or status + updated (activity list). */
  variant: 'attention' | 'activity';
}

export const RequestMiniList: React.FC<RequestMiniListProps> = ({ title, description, rows, emptyText, variant }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-base">{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent className="p-0">
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={LEGAL_PATHS.request(r.id)} className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/60">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{r.reference_number}</span>
                    <span>·</span>
                    <span>{requestTypeLabel(r.request_type)}</span>
                  </p>
                  <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {variant === 'attention' ? (
                      <>
                        <PriorityBadge priority={r.priority} />
                        <RiskBadge risk={r.risk_level} short />
                        <SlaBadge row={r} />
                      </>
                    ) : (
                      <>
                        <StatusBadge status={r.status} />
                        <span className="text-xs text-muted-foreground">updated {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}</span>
                      </>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default RequestMiniList;
