import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Document } from '@/modules/documents/hooks/useDocuments';
import { DOCUMENT_STATUSES, ISM_SECTIONS, formatFileSize } from '@/modules/documents/constants';
import { format } from 'date-fns';
import {
  Download,
  Edit,
  Calendar,
  User,
  Ship,
  Tag,
  FileText,
  AlertCircle,
  Globe,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DocumentViewModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (doc: Document) => void;
  onDownload: (doc: Document) => void;
}

const DocumentViewModal: React.FC<DocumentViewModalProps> = ({
  document,
  open,
  onOpenChange,
  onEdit,
  onDownload,
}) => {
  if (!document) return null;

  const statusConfig = DOCUMENT_STATUSES.find((s) => s.value === document.status);
  const ismSectionLabels = document.ism_sections
    .map((s) => ISM_SECTIONS.find((section) => section.value === s)?.label)
    .filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="font-mono text-xs">
                  {document.document_number}
                </Badge>
                <Badge variant="secondary">{document.revision}</Badge>
                {statusConfig && (
                  <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                )}
                {document.is_mandatory_read && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Required
                  </Badge>
                )}
              </div>
              <DialogTitle className="text-xl">{document.title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="px-6 pb-6 space-y-6">
            {document.description && (
              <p className="text-muted-foreground">{document.description}</p>
            )}

            <Separator />

            {/* Document Details */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="text-sm font-medium" style={{ color: document.category?.color }}>
                    {document.category?.name}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Ship className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vessel</p>
                  <p className="text-sm font-medium">
                    {document.vessel?.name || 'Company-wide'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Author</p>
                  <p className="text-sm font-medium">
                    {document.author
                      ? `${document.author.first_name} ${document.author.last_name}`
                      : 'Unknown'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Language</p>
                  <p className="text-sm font-medium">{document.language}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm font-medium">
                    {format(new Date(document.updated_at), 'MMM d, yyyy')}
                  </p>
                </div>
              </div>

              {document.next_review_date && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Next Review</p>
                    <p className="text-sm font-medium">
                      {format(new Date(document.next_review_date), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* File Info */}
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{document.file_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatFileSize(document.file_size)} • {document.file_type.split('/').pop()?.toUpperCase()}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => onDownload(document)}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
              </div>
            </div>

            {/* Tags */}
            {document.tags && document.tags.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">Tags</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {document.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* ISM Sections */}
            {ismSectionLabels.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">ISM Sections</p>
                <div className="flex flex-wrap gap-2">
                  {ismSectionLabels.map((label) => (
                    <Badge key={label} variant="outline">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-3 p-6 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => onEdit(document)}>
            <Edit className="w-4 h-4 mr-2" />
            Edit Document
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewModal;
