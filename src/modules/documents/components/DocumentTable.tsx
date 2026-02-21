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
import { DOCUMENT_STATUSES } from '@/modules/documents/constants';
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
    <div className="rounded-md border">
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
            <TableHead className="w-[80px]">Actions</TableHead>
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
              const statusConfig = DOCUMENT_STATUSES.find((s) => s.value === document.status);
              return (
                <TableRow
                  key={document.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => onView(document)}
                >
                  <TableCell className="font-mono text-sm">
                    {document.document_number}
                  </TableCell>
                  <TableCell className="font-medium max-w-[300px] truncate">
                    {document.title}
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
                    {statusConfig && (
                      <Badge className={`text-xs ${statusConfig.color}`}>
                        {statusConfig.label}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {document.vessel?.name || 'Company-wide'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {document.next_review_date
                      ? format(new Date(document.next_review_date), 'MMM d, yyyy')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4" />
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
