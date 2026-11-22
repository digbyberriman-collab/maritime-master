import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import {
  MoreVertical,
  Eye,
  Edit,
  Download,
  Trash2,
  AlertCircle,
  ClipboardList,
  Settings,
  FileText,
  BarChart3,
  BookOpen,
  Award,
} from 'lucide-react';

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  'clipboard-list': ClipboardList,
  'settings': Settings,
  'file-text': FileText,
  'bar-chart-3': BarChart3,
  'book-open': BookOpen,
  'award': Award,
};

interface DocumentCardProps {
  document: Document;
  onView: (doc: Document) => void;
  onEdit: (doc: Document) => void;
  onDownload: (doc: Document) => void;
  onDelete: (doc: Document) => void;
}

const DocumentCard: React.FC<DocumentCardProps> = ({
  document,
  onView,
  onEdit,
  onDownload,
  onDelete,
}) => {
  const IconComponent = document.category?.icon
    ? iconMap[document.category.icon] || FileText
    : FileText;

  return (
    <Card
      className="group cursor-pointer transition-colors duration-quick hover:border-primary/40 motion-reduce:transition-none"
      onClick={() => onView(document)}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          {/* Category colour is tenant data: it tints only the icon, on a neutral tile. */}
          <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-muted">
            <IconComponent className="h-5 w-5" style={{ color: document.category?.color }} />
          </div>
          <div className="flex min-w-0 items-center gap-1">
            <Badge variant="outline" className="min-w-0 truncate font-mono text-xs">
              {document.document_number}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                {/* Always visible on touch; on a mouse it appears on hover or keyboard focus. */}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${document.title}`}
                  className="shrink-0 transition-opacity duration-quick motion-reduce:transition-none [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:focus-visible:opacity-100 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:data-[state=open]:opacity-100"
                >
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
          </div>
        </div>

        <h3 className="mb-2 type-subtitle text-foreground">
          {/* The title is the keyboard and screen-reader way in; the card click is a mouse shortcut. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onView(document);
            }}
            className="line-clamp-2 rounded-sm text-left focus-ring"
          >
            {document.title}
          </button>
        </h3>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono text-xs">
            Rev {document.revision}
          </Badge>
          {document.status ? <StatusPill domain="document" status={document.status} /> : null}
          {document.is_mandatory_read && (
            <StatusPill tone="danger" icon={AlertCircle} label="Required reading" />
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Updated {format(new Date(document.updated_at), 'd MMM yyyy')}
        </p>
      </CardContent>
    </Card>
  );
};

export default DocumentCard;
