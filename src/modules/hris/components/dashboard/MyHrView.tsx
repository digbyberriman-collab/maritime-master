import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, FileSignature, FileText, HeartHandshake, Receipt, Target, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { HRIS_PATHS } from '@/modules/hris/paths';
import { hrisLink, useMyHr } from '@/modules/hris/hooks/useHrDashboard';
import { expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';
import { KpiTile } from './KpiGrid';
import { NeedsAttentionPanel } from './NeedsAttentionPanel';

interface MyHrViewProps {
  module: string | null;
}

const QUICK_LINKS: { label: string; path: string; icon: typeof FileText }[] = [
  { label: 'Personal details', path: HRIS_PATHS.personalDetails, icon: UserRound },
  { label: 'My contracts', path: HRIS_PATHS.contracts, icon: FileSignature },
  { label: 'Documents & certificates', path: HRIS_PATHS.documents, icon: FileText },
  { label: 'Next of kin', path: HRIS_PATHS.nextOfKin, icon: HeartHandshake },
  { label: 'My payslips', path: HRIS_PATHS.payroll, icon: Receipt },
  { label: 'My objectives', path: HRIS_PATHS.objectives, icon: Target },
];

/** Self-service dashboard: only the signed-in crew member's own records. */
export const MyHrView: React.FC<MyHrViewProps> = ({ module }) => {
  const my = useMyHr();
  const data = my.data;
  const link = (path: string) => hrisLink(path, { module, crew: my.profileId });
  const items = data ? [...data.expiry, ...data.performance] : [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile icon={FileText} label="Expiring ≤180d" value={data ? data.expiry.length : null} hint="Contract, passport, visa, medical, certificates" to={link(HRIS_PATHS.documents)} />
        <KpiTile icon={ClipboardCheck} label="Reviews awaiting me" value={data ? data.reviewsAwaitingMe.length : null} tone={data && data.reviewsAwaitingMe.length > 0 ? 'warning' : 'default'} to={link(HRIS_PATHS.annualEvaluations)} />
        <KpiTile icon={Target} label="Open objectives" value={data ? data.objectives.length : null} to={link(HRIS_PATHS.objectives)} />
        <KpiTile icon={Receipt} label="Payslips" value={data ? data.paidPayslips : null} hint="Paid to date" to={link(HRIS_PATHS.payroll)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NeedsAttentionPanel
            items={items}
            isLoading={my.isLoading}
            error={my.error}
            vesselName={() => null}
            module={module}
            compact
            title="My upcoming dates"
            description="Your expiring documents, reviews and objectives. Overdue first."
          />

          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" /> Reviews awaiting your action
              </CardTitle>
              <CardDescription>Self-assessments to complete and reviews to acknowledge.</CardDescription>
            </CardHeader>
            <CardContent>
              {my.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : !data || data.reviewsAwaitingMe.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing is waiting for you.</p>
              ) : (
                <ul className="divide-y">
                  {data.reviewsAwaitingMe.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link to={link(r.review_type === 'annual_review' ? HRIS_PATHS.annualReviews : r.review_type === 'end_of_rotation' ? HRIS_PATHS.endOfRotation : HRIS_PATHS.annualEvaluations)} className="font-medium hover:underline">
                        {humanise(r.review_type)}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{humanise(r.status)}</Badge>
                        {r.due_date && (
                          <Badge variant="outline" className={cn('text-[10px]', toneClass[expiryTone(r.due_date)])}>
                            Due {formatDate(r.due_date)}
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-muted-foreground" /> My objectives
              </CardTitle>
            </CardHeader>
            <CardContent>
              {my.isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : !data || data.objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open objectives.</p>
              ) : (
                <ul className="space-y-3">
                  {data.objectives.slice(0, 6).map((o) => (
                    <li key={o.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <Link to={link(HRIS_PATHS.objectives)} className="truncate font-medium hover:underline">
                          {o.title}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{o.target_date ? formatDate(o.target_date) : 'No target'}</span>
                      </div>
                      <Progress value={o.progress_pct} className="h-1.5" />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">My HR pages</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2">
              {QUICK_LINKS.map(({ label, path, icon: Icon }) => (
                <Link key={path} to={link(path)} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent/50">
                  <Icon className="h-4 w-4 text-muted-foreground" /> {label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MyHrView;
