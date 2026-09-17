import React from 'react';
import { Banknote, CheckCircle2, CircleOff, MoreHorizontal, Pencil, Trash2, Award } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { formatDate, formatMinor, humanise } from '@/modules/hris/lib/format';
import { compensationCost, parseAllowances, sumAllowancesMinor } from '@/modules/hris/lib/compensation';
import type { CrewCompensation } from '@/modules/hris/hooks/useCompensation';
import { CompensationStatusBadge } from './CompensationStatusBadge';

interface CompensationCardProps {
  row: CrewCompensation;
  canEdit: boolean;
  canAdmin: boolean;
  busy?: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onSupersede: () => void;
  onDelete: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
  </div>
);

/** The current compensation package for a crew member with its actions. */
export const CompensationCard: React.FC<CompensationCardProps> = ({ row, canEdit, canAdmin, busy, onEdit, onActivate, onSupersede, onDelete }) => {
  const allowances = parseAllowances(row.allowances);
  const cost = compensationCost(row);
  const allowancesTotal = sumAllowancesMinor(allowances);
  const canActivate = canEdit && row.status === 'draft';
  const canSupersede = canEdit && row.status === 'active';
  const grade = row.pay_grade;
  const gradeBase = grade ? (row.pay_frequency === 'daily' && grade.daily_rate_minor !== null ? grade.daily_rate_minor : grade.monthly_base_minor) : null;
  const deviatesFromGrade = grade !== null && gradeBase !== null && gradeBase > 0 && (gradeBase !== row.base_salary_minor || grade.currency !== row.currency);

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Banknote className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span className="tabular-nums">{formatMinor(row.base_salary_minor, row.currency)}</span>
              <span className="text-sm font-normal text-muted-foreground">/ {humanise(row.pay_frequency).toLowerCase()}</span>
              <CompensationStatusBadge status={row.status} />
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[grade ? `${grade.code} · ${grade.name}` : null, `from ${formatDate(row.effective_from)}`, row.effective_to ? `to ${formatDate(row.effective_to)}` : 'open-ended']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canActivate && (
            <Button size="sm" onClick={onActivate} disabled={busy}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Activate
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
              <Pencil className="mr-1.5 h-4 w-4" /> Edit
            </Button>
          )}
          {(canSupersede || canAdmin) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" aria-label="More actions" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canSupersede && (
                  <DropdownMenuItem onSelect={onSupersede} className="text-orange-600 focus:text-orange-600">
                    <CircleOff className="mr-2 h-4 w-4" /> End this package
                  </DropdownMenuItem>
                )}
                {canAdmin && (
                  <>
                    {canSupersede && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete package
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <Field label="Monthly equivalent"><span className="tabular-nums">{formatMinor(cost.monthlyBaseMinor, row.currency)}</span></Field>
          <Field label="Annualised base"><span className="tabular-nums">{formatMinor(cost.annualBaseMinor, row.currency)}</span></Field>
          <Field label="Annualised package">
            <span className="tabular-nums font-medium">{formatMinor(cost.annualTotalMinor, row.currency)}</span>
          </Field>
          <Field label="Gratuities">
            <span className="flex flex-wrap items-center gap-2">
              {row.gratuity_eligible ? (
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                  <Award className="mr-1 h-3 w-3" /> Eligible
                </Badge>
              ) : (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border">Not eligible</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {row.gratuity_points !== null ? `${row.gratuity_points} pts` : grade ? `${grade.gratuity_points} pts (grade)` : 'default pts'}
              </span>
            </span>
          </Field>

          <Field label="Pay grade">
            {grade ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{grade.code} · {grade.name}</span>
                {deviatesFromGrade && (
                  <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 text-[10px]">Off grade</Badge>
                )}
              </span>
            ) : (
              '—'
            )}
          </Field>
          <Field label="Reason">{row.reason ?? '—'}</Field>
          <Field label="Approved">{row.approved_at ? formatDate(row.approved_at) : '—'}</Field>
          <Field label="Last updated">{formatDate(row.updated_at)}</Field>
        </dl>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Allowances</p>
            {allowances.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Total <span className="font-medium tabular-nums text-foreground">{formatMinor(allowancesTotal, row.currency)}</span> per period
                {cost.monthlyAllowancesMinor !== allowancesTotal && (
                  <> · recurring <span className="tabular-nums">{formatMinor(cost.monthlyAllowancesMinor, row.currency)}</span></>
                )}
              </p>
            )}
          </div>
          {allowances.length === 0 ? (
            <p className="text-sm text-muted-foreground">No allowances on this package.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {allowances.map((a) => (
                <li key={a.name} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate">{a.name}</span>
                    {a.recurring === false && <Badge variant="outline" className="text-[10px]">One-off</Badge>}
                    {a.prorate === false && <Badge variant="outline" className="text-[10px]">Not pro-rated</Badge>}
                    {a.taxable === false && <Badge variant="outline" className="text-[10px]">Non-taxable</Badge>}
                  </span>
                  <span className="tabular-nums">{formatMinor(a.amount_minor, row.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {row.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{row.notes}</p>}
      </CardContent>
    </Card>
  );
};

export default CompensationCard;
