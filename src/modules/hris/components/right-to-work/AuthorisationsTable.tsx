import React, { useRef, useState } from 'react';
import { BadgeCheck, Download, Eye, FileText, MoreHorizontal, Pencil, Plus, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/shared/hooks/use-toast';
import { downloadCrewDocument, getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { formatDate } from '@/modules/hris/lib/format';
import { authorisationEffectiveStatus, authorisationTypeLabel, type WorkAuthorisationRow } from '@/modules/hris/lib/rightToWork';
import { StatusChip } from './StatusChip';

interface AuthorisationsTableProps {
  authorisations: WorkAuthorisationRow[];
  isLoading: boolean;
  /** Can add / edit / delete / upload (HR editor or the subject). */
  canWrite: boolean;
  /** Can mark as verified (HR editor only). */
  canVerify: boolean;
  busy?: boolean;
  onAdd: () => void;
  onEdit: (row: WorkAuthorisationRow) => void;
  onDelete: (row: WorkAuthorisationRow) => void;
  onVerify: (row: WorkAuthorisationRow, verified: boolean) => void;
  onUpload: (row: WorkAuthorisationRow, file: File) => void;
}

const EffectiveChip: React.FC<{ row: WorkAuthorisationRow }> = ({ row }) => {
  const s = authorisationEffectiveStatus(row);
  if (s === 'pending') return <Badge variant="outline" className="text-[11px] bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400">Pending</Badge>;
  if (s === 'revoked') return <Badge variant="outline" className="text-[11px] bg-destructive/10 text-destructive border-destructive/20">Revoked</Badge>;
  return <StatusChip status={s} label={s === 'ok' ? (row.expiry_date ? 'Valid' : 'Valid · no expiry') : undefined} />;
};

/** Visas, permits, seaman's books and endorsements for one crew member. */
export const AuthorisationsTable: React.FC<AuthorisationsTableProps> = ({ authorisations, isLoading, canWrite, canVerify, busy, onAdd, onEdit, onDelete, onVerify, onUpload }) => {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadFor, setUploadFor] = useState<WorkAuthorisationRow | null>(null);

  const preview = async (row: WorkAuthorisationRow) => {
    try {
      const url = await getCrewDocumentSignedUrl(row.document_path);
      if (url) window.open(url, '_blank', 'noopener');
    } catch (err) {
      toast({ title: 'Could not open document', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };
  const download = async (row: WorkAuthorisationRow) => {
    try {
      await downloadCrewDocument(row.document_path, row.document_name ?? `${row.authorisation_type}-${row.country}.pdf`);
    } catch (err) {
      toast({ title: 'Could not download document', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    }
  };
  const startUpload = (row: WorkAuthorisationRow) => {
    setUploadFor(row);
    fileRef.current?.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Work authorisations</CardTitle>
          <CardDescription>Visas, work and residence permits, seaman's book, flag endorsements.</CardDescription>
        </div>
        {canWrite && <Button size="sm" className="gap-1 shrink-0" onClick={onAdd}><Plus className="h-4 w-4" /> Add</Button>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : authorisations.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No work authorisations recorded.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Verified</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {authorisations.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {authorisationTypeLabel(row.authorisation_type)}
                      {row.entries && <span className="ml-1 text-xs text-muted-foreground">· {row.entries}</span>}
                    </TableCell>
                    <TableCell>{row.country}</TableCell>
                    <TableCell className="font-mono text-xs">{row.reference_number ?? '—'}</TableCell>
                    <TableCell className="text-sm">{formatDate(row.issued_date)}</TableCell>
                    <TableCell className="text-sm">{row.expiry_date ? formatDate(row.expiry_date) : 'No expiry'}</TableCell>
                    <TableCell><EffectiveChip row={row} /></TableCell>
                    <TableCell>
                      {row.verified_at ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><BadgeCheck className="h-4 w-4" /> Yes</span>
                          </TooltipTrigger>
                          <TooltipContent>Verified {formatDate(row.verified_at)}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.document_path ? (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => preview(row)} aria-label="Preview document"><Eye className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => download(row)} aria-label="Download document"><Download className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" /> None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(canWrite || canVerify) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} aria-label="Actions"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canWrite && <DropdownMenuItem onSelect={() => onEdit(row)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>}
                            {canWrite && <DropdownMenuItem onSelect={() => startUpload(row)}><Upload className="mr-2 h-4 w-4" /> {row.document_path ? 'Replace document' : 'Upload document'}</DropdownMenuItem>}
                            {canVerify && (
                              <DropdownMenuItem onSelect={() => onVerify(row, !row.verified_at)}><BadgeCheck className="mr-2 h-4 w-4" /> {row.verified_at ? 'Clear verification' : 'Mark as verified'}</DropdownMenuItem>
                            )}
                            {canWrite && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(row)}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadFor) onUpload(uploadFor, file);
            setUploadFor(null);
            e.target.value = '';
          }}
        />
      </CardContent>
    </Card>
  );
};

export default AuthorisationsTable;
