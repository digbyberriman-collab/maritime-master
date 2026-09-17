import React from 'react';
import {
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileSignature,
  FileUp,
  MoreHorizontal,
  Pencil,
  Ship,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { expiryLabel, expiryTone, formatDate, formatMinor, humanise, toneClass } from '@/modules/hris/lib/format';
import { deriveContractStatus, SIGNATURE_LABEL, signatureState } from '@/modules/hris/lib/contractHelpers';
import type { CrewContract } from '@/modules/hris/hooks/useCrewContracts';
import { ContractStatusBadge } from './ContractStatusBadge';

interface ContractCardProps {
  contract: CrewContract;
  canEdit: boolean;
  canAdmin: boolean;
  /** Wage is only rendered for HR editors. */
  showWage: boolean;
  busy?: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onTerminate: () => void;
  onUpload: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onPreview: () => void;
}

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('min-w-0', className)}>
    <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 truncate text-sm text-foreground">{children}</dd>
  </div>
);

/** The "current" contract for a crew member with its actions. */
export const ContractCard: React.FC<ContractCardProps> = ({
  contract,
  canEdit,
  canAdmin,
  showWage,
  busy,
  onEdit,
  onActivate,
  onTerminate,
  onUpload,
  onDelete,
  onDownload,
  onPreview,
}) => {
  const status = deriveContractStatus(contract);
  const signature = signatureState(contract);
  const endTone = status === 'active' ? expiryTone(contract.end_date) : 'none';
  const probationTone = status === 'active' ? expiryTone(contract.probation_end_date) : 'none';
  const canActivate = canEdit && contract.status === 'draft';
  const canTerminate = canEdit && contract.status === 'active';

  return (
    <Card className="bg-card">
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <FileSignature className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span>{humanise(contract.contract_type)} contract</span>
              <ContractStatusBadge contract={contract} />
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[contract.contract_number, contract.position ?? contract.rank, contract.vessel_name].filter(Boolean).join(' · ') || 'No reference'}
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
          {(canEdit || canAdmin || contract.document_path) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" aria-label="More actions" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onSelect={onUpload}>
                    <FileUp className="mr-2 h-4 w-4" /> {contract.document_path ? 'Replace signed document' : 'Upload signed document'}
                  </DropdownMenuItem>
                )}
                {contract.document_path && (
                  <>
                    <DropdownMenuItem onSelect={onPreview}><Eye className="mr-2 h-4 w-4" /> Preview document</DropdownMenuItem>
                    <DropdownMenuItem onSelect={onDownload}><Download className="mr-2 h-4 w-4" /> Download document</DropdownMenuItem>
                  </>
                )}
                {canTerminate && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onTerminate} className="text-orange-600 focus:text-orange-600">
                      <Ban className="mr-2 h-4 w-4" /> Terminate contract
                    </DropdownMenuItem>
                  </>
                )}
                {canAdmin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete contract
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
          <Field label="Start">{formatDate(contract.start_date)}</Field>
          <Field label="End">
            <span className="flex items-center gap-2">
              {contract.end_date ? formatDate(contract.end_date) : 'Open-ended'}
              {contract.end_date && status === 'active' && (
                <Badge variant="outline" className={cn('text-[10px]', toneClass[endTone])}>{expiryLabel(contract.end_date)}</Badge>
              )}
            </span>
          </Field>
          <Field label="Probation ends">
            <span className="flex items-center gap-2">
              {formatDate(contract.probation_end_date)}
              {contract.probation_end_date && status === 'active' && probationTone !== 'expired' && (
                <Badge variant="outline" className={cn('text-[10px]', toneClass[probationTone])}>{expiryLabel(contract.probation_end_date)}</Badge>
              )}
            </span>
          </Field>
          <Field label="Notice period">{contract.notice_period_days === null ? '—' : `${contract.notice_period_days} days`}</Field>

          <Field label="Rotation">{contract.rotation_pattern ?? '—'}</Field>
          <Field label="Vessel">
            <span className="flex items-center gap-1.5">
              {contract.vessel_name && <Ship className="h-3.5 w-3.5 text-muted-foreground" />}
              {contract.vessel_name ?? 'Unassigned'}
            </span>
          </Field>
          <Field label="Rank / Position">{[contract.rank, contract.position].filter(Boolean).join(' / ') || '—'}</Field>
          <Field label="Department">{contract.department ?? '—'}</Field>

          <Field label="SEA reference">{contract.sea_reference ?? '—'}</Field>
          <Field label="Flag state">{contract.flag_state ?? '—'}</Field>
          <Field label="Governing law">{contract.governing_law ?? '—'}</Field>
          {showWage ? (
            <Field label="Base wage">
              {contract.base_wage_minor === null
                ? '—'
                : `${formatMinor(contract.base_wage_minor, contract.wage_currency)}${contract.wage_frequency ? ` / ${contract.wage_frequency}` : ''}`}
            </Field>
          ) : (
            <Field label="Base wage"><span className="text-muted-foreground">Restricted</span></Field>
          )}
        </dl>

        <Separator />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Signatures</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  signature === 'signed'
                    ? 'bg-green-500/10 text-green-600 border-green-500/20'
                    : signature === 'unsigned'
                      ? 'bg-muted text-muted-foreground border-border'
                      : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
                )}
              >
                {SIGNATURE_LABEL[signature]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                Crew {formatDate(contract.signed_by_crew_at)} · Company {formatDate(contract.signed_by_company_at)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Signed document</p>
            {contract.document_path ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm">{contract.document_name ?? 'Contract document'}</span>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onPreview}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Preview
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onDownload}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Download
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">No signed copy on file</span>
                {canEdit && (
                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={onUpload} disabled={busy}>
                    <FileUp className="mr-1 h-3.5 w-3.5" /> Upload
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {contract.status === 'terminated' && (
          <div className="rounded-md border border-orange-500/20 bg-orange-500/10 p-3 text-sm">
            <p className="font-medium text-orange-600">Terminated {formatDate(contract.terminated_at)}</p>
            {contract.termination_reason && <p className="mt-1 text-muted-foreground">{contract.termination_reason}</p>}
          </div>
        )}
        {contract.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{contract.notes}</p>}
      </CardContent>
    </Card>
  );
};

export default ContractCard;
