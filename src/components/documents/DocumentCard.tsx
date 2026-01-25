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
import { Document } from '@/hooks/useDocuments';
import { DOCUMENT_STATUSES } from '@/lib/documentConstants';
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
  const statusConfig = DOCUMENT_STATUSES.find((s) => s.value === document.status);
  const IconComponent = document.category?.icon
    ? iconMap[document.category.icon] || FileText
    : FileText;

  return (
    <Card className="group hover:shadow-md transition-shadow cursor-pointer" onClick={() => onView(document)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${document.category?.color}20` }}
          >
            <IconComponent
              className="w-5 h-5"
              style={{ color: document.category?.color }}
            />
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {document.document_number}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
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
          </div>
        </div>

        <h3 className="font-semibold text-foreground mb-2 line-clamp-2">
          {document.title}
        </h3>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          <Badge variant="secondary" className="text-xs">
            {document.revision}
          </Badge>
          {statusConfig && (
            <Badge className={`text-xs ${statusConfig.color}`}>
              {statusConfig.label}
            </Badge>
          )}
          {document.is_mandatory_read && (
            <Badge variant="destructive" className="text-xs flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Required
            </Badge>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          Updated {format(new Date(document.updated_at), 'MMM d, yyyy')}
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentCard;
