import React, { useState } from 'react';
import { BadgeCheck, Eye, EyeOff, Landmark, MoreHorizontal, Pencil, Plus, ShieldCheck, ShieldOff, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDate } from '@/modules/hris/lib/format';
import { formatIban, maskAccountNumber, maskIban, type BankDetailRow } from '@/modules/hris/lib/compensation';

interface BankDetailsCardProps {
  accounts: BankDetailRow[];
  isLoading?: boolean;
  /** Payroll editors and the crew member themself can add/edit/delete. */
  canEdit: boolean;
  /** Only payroll editors can mark an account verified. */
  canVerify: boolean;
  busy?: boolean;
  onAdd: () => void;
  onEdit: (row: BankDetailRow) => void;
  onDelete: (row: BankDetailRow) => void;
  onSetPrimary: (row: BankDetailRow) => void;
  onVerify: (row: BankDetailRow, verified: boolean) => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 truncate font-mono text-sm text-foreground">{children}</dd>
  </div>
);

/**
 * Bank accounts on file. Identifiers are masked by default; the reveal
 * toggle is purely visual (every read is already RLS-gated and every write
 * is audited by the database trigger).
 */
export const BankDetailsCard: React.FC<BankDetailsCardProps> = ({
  accounts,
  isLoading,
  canEdit,
  canVerify,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onSetPrimary,
  onVerify,
}) => {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-muted-foreground" /> Bank details
          </CardTitle>
          <CardDescription>Payroll is paid to the primary account. Changes are audited.</CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onAdd} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" /> Add account
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : accounts.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
            No bank account on file{canEdit ? ' — add one so payroll can be paid.' : '.'}
          </p>
        ) : (
          accounts.map((a) => {
            const show = Boolean(revealed[a.id]);
            const verified = Boolean(a.verified_at);
            return (
              <div key={a.id} className={cn('rounded-md border p-4', a.is_primary && 'border-primary/40 bg-primary/5')}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="truncate">{a.account_holder}</span>
                      {a.is_primary && (
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          <Star className="mr-1 h-3 w-3" /> Primary
                        </Badge>
                      )}
                      {verified ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20" title={`Verified ${formatDate(a.verified_at)}`}>
                          <BadgeCheck className="mr-1 h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Unverified</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {[a.bank_name, a.bank_country, a.currency].filter(Boolean).join(' · ') || 'Bank not specified'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => toggle(a.id)} aria-pressed={show}>
                      {show ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
                      {show ? 'Hide' : 'Reveal'}
                    </Button>
                    {(canEdit || canVerify) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Account actions" disabled={busy}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canEdit && (
                            <DropdownMenuItem onSelect={() => onEdit(a)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
                          )}
                          {canEdit && !a.is_primary && (
                            <DropdownMenuItem onSelect={() => onSetPrimary(a)}><Star className="mr-2 h-4 w-4" /> Make primary</DropdownMenuItem>
                          )}
                          {canVerify && (
                            <DropdownMenuItem onSelect={() => onVerify(a, !verified)}>
                              {verified ? <ShieldOff className="mr-2 h-4 w-4" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                              {verified ? 'Remove verification' : 'Mark as verified'}
                            </DropdownMenuItem>
                          )}
                          {canEdit && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => onDelete(a)} className="text-destructive focus:text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" /> Remove account
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {a.iban && <Field label="IBAN" className="sm:col-span-2">{show ? formatIban(a.iban) : maskIban(a.iban)}</Field>}
                  {a.swift_bic && <Field label="SWIFT / BIC">{show ? a.swift_bic : maskAccountNumber(a.swift_bic)}</Field>}
                  {a.account_number && <Field label="Account number">{show ? a.account_number : maskAccountNumber(a.account_number)}</Field>}
                  {a.sort_code && <Field label="Sort code">{show ? a.sort_code : maskAccountNumber(a.sort_code)}</Field>}
                  {a.routing_number && <Field label="Routing number">{show ? a.routing_number : maskAccountNumber(a.routing_number)}</Field>}
                </dl>
                {a.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.notes}</p>}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};

export default BankDetailsCard;
