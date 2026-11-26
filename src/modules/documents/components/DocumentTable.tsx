/**
 * The controlled register as a table (`/fleet/documents/register`, from
 * 768 px). In print the wrapper stops scrolling sideways, titles wrap
 * instead of being cut, rows are not split across pages and the actions
 * column is left off, so the register prints whole on A4 landscape
 * (BUILD-PLAN Phase 1 open item).
 */
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Document } from '@/modules/documents/hooks/useDocuments';
import { StatusPill } from '@/shared/components/status';
import { format } from 'date-fns';
import { MoreVertical, Eye, Edit, Download, Trash2 } from 'lucide-react';

interface DocumentTableProps {
  documents: Document[];
  onView: (doc: Document) => void;
  onEdit: (doc: Document) => void;
  onDownload: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  onView,
  onEdit,
  onDownload,
  onDelete,
}) => {
  return (
    <div data-testid="document-register-table" className="overflow-x-auto rounded-md border bg-card print:overflow-visible print:border-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[140px]">Doc Number</TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-[120px]">Category</TableHead>
            <TableHead className="w-[80px]">Revision</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[120px]">Vessel</TableHead>
            <TableHead className="w-[120px]">Next Review</TableHead>
            <TableHead className="w-[80px] print:hidden">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                No documents found
              </TableCell>
            </TableRow>
          ) : (
            documents.map((document) => {
              return (
                <TableRow
                  key={document.id}
                  className="cursor-pointer hover:bg-accent print:break-inside-avoid"
                  onClick={() => onView(document)}
                >
                  <TableCell className="font-mono text-sm">
                    {document.document_number}
                  </TableCell>
                  <TableCell className="max-w-[300px] font-medium print:max-w-none">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onView(document);
                      }}
                      className="block max-w-full truncate rounded-sm text-left focus-ring print:whitespace-normal print:overflow-visible"
                    >
                      {document.title}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      style={{
                        borderColor: document.category?.color,
                        color: document.category?.color,
                      }}
                    >
                      {document.category?.name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{document.revision}</Badge>
                  </TableCell>
                  <TableCell>
                    {document.status ? <StatusPill domain="document" status={document.status} /> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {document.vessel?.name || 'Company-wide'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {document.next_review_date
                      ? format(new Date(document.next_review_date), 'd MMM yyyy')
                      : '–'}
                  </TableCell>
                  <TableCell className="print:hidden">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${document.title}`}>
                          <MoreVertical aria-hidden="true" className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(document); }}>
                          <Eye className="w-4 h-4 mr-2" />
                          View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(document); }}>
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDownload(document); }}>
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); onDelete(document); }}
                          className="text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default DocumentTable;
