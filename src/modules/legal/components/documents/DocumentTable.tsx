import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TemplateStatusBadge } from '@/modules/legal/components/badges';
import { categoryDef, DOCUMENT_TYPES } from '@/modules/legal/lib/constants';
import type { DocumentSearchHit, LegalTemplateRow } from '@/modules/legal/hooks/useLegalDocuments';
import { LEGAL_PATHS } from '@/modules/legal/paths';

interface DocumentTableProps {
  rows: LegalTemplateRow[];
  isLoading?: boolean;
  canEdit: boolean;
  onDelete: (row: LegalTemplateRow) => void;
  /** Content-search hits keyed by template id (from full-text search). */
  hits?: Map<string, DocumentSearchHit>;
  emptyText?: string;
}

const Snippet: React.FC<{ headline: string }> = ({ headline }) => {
  // ts_headline marks matches with ** … ** (configured in legal_search_documents).
  const parts = headline.split('**');
  return (
    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i} className="rounded bg-warning/30 px-0.5 text-foreground">{p}</mark> : <React.Fragment key={i}>{p}</React.Fragment>))}
    </p>
  );
};

export const DocumentTable: React.FC<DocumentTableProps> = ({ rows, isLoading, canEdit, onDelete, hits, emptyText = 'No documents match.' }) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
        <FileText className="mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[280px]">Document</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Version</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((t) => {
            const cat = categoryDef(t.category);
            const Icon = cat.icon;
            const type = DOCUMENT_TYPES.find((d) => d.value === t.document_type);
            const hit = hits?.get(t.id);
            return (
              <TableRow
                key={t.id}
                className="cursor-pointer"
                onClick={() => navigate(LEGAL_PATHS.document(t.id))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') navigate(LEGAL_PATHS.document(t.id));
                }}
                tabIndex={0}
              >
                <TableCell>
                  <div className="flex items-start gap-3">
                    <span className="rounded-md bg-muted p-2 text-muted-foreground" title={cat.label}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cat.label}
                        {t.description ? ` · ${t.description}` : ''}
                      </p>
                      {hit && <Snippet headline={hit.headline} />}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{type?.label ?? t.document_type}</TableCell>
                <TableCell>
                  <TemplateStatusBadge status={t.status} />
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums text-foreground">v{t.current_version}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{t.department}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDistanceToNow(new Date(t.updated_at), { addSuffix: true })}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${t.name}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(LEGAL_PATHS.document(t.id))}>
                        <Eye className="mr-2 h-4 w-4" /> View
                      </DropdownMenuItem>
                      {canEdit && (
                        <DropdownMenuItem onClick={() => navigate(`${LEGAL_PATHS.document(t.id)}?tab=editor`)}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                      )}
                      {canEdit && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(t)}>
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default DocumentTable;
