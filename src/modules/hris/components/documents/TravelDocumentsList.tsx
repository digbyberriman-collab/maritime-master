import React, { useState } from 'react';
import { BadgeCheck, ExternalLink, Loader2, Plane } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/shared/hooks/use-toast';
import { getTravelDocumentSignedUrl, useCrewTravelDocuments, type CrewTravelDocument } from '@/modules/hris/hooks/useCrewTravelDocuments';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass } from '@/modules/hris/lib/format';

interface TravelDocumentsListProps {
  userId: string;
}

const extractionVariant = (status: string | null): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case 'completed':
    case 'complete':
    case 'success':
      return 'secondary';
    case 'failed':
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
};

const TravelDocumentRow: React.FC<{ doc: CrewTravelDocument }> = ({ doc }) => {
  const { toast } = useToast();
  const [opening, setOpening] = useState(false);
  const tone = expiryTone(doc.valid_until);

  const open = async () => {
    setOpening(true);
    try {
      const url = await getTravelDocumentSignedUrl(doc.standardised_file_path ?? doc.original_file_path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast({ title: 'Could not open document', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setOpening(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{humanise(doc.document_type)}</TableCell>
      <TableCell className="max-w-[260px] truncate text-muted-foreground" title={doc.original_filename}>
        {doc.standardised_filename ?? doc.original_filename}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{formatDate(doc.valid_from)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {doc.valid_until ? (
          <Badge variant="outline" className={cn(toneClass[tone])} title={formatDate(doc.valid_until)}>
            {formatDate(doc.valid_until)} · {expiryLabel(doc.valid_until)}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {doc.verified ? (
          <Badge variant="outline" className={cn('gap-1', toneClass.ok)} title={doc.verified_at ? `Verified ${formatDate(doc.verified_at)}` : undefined}>
            <BadgeCheck className="h-3 w-3" /> Verified
          </Badge>
        ) : (
          <Badge variant={extractionVariant(doc.extraction_status)} className="font-normal">
            {doc.extraction_status ? humanise(doc.extraction_status) : 'Unverified'}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={open} disabled={opening} aria-label={`Open ${doc.original_filename}`}>
          {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
        </Button>
      </TableCell>
    </TableRow>
  );
};

/** Read-only list of travel documents (passport / visa / vaccination) with signed-URL viewing. */
export const TravelDocumentsList: React.FC<TravelDocumentsListProps> = ({ userId }) => {
  const { data, isLoading, isError, error } = useCrewTravelDocuments(userId);
  const docs = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plane className="h-4 w-4 text-primary" />
          Travel documents
        </CardTitle>
        <CardDescription>Uploaded through the travel-document pipeline. Read-only here; manage uploads from the crew travel admin.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isError ? (
          <p className="p-6 text-sm text-destructive">Could not load travel documents: {error instanceof Error ? error.message : 'unknown error'}</p>
        ) : isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : docs.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No travel documents on file.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Valid from</TableHead>
                  <TableHead>Valid until</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => <TravelDocumentRow key={doc.id} doc={doc} />)}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TravelDocumentsList;
