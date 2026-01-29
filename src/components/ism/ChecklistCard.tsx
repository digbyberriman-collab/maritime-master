import React from 'react';
import { FileText, ExternalLink, Upload } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ChecklistCardProps {
  title: string;
  documentId?: string;
  revision?: string;
  hasDocument?: boolean;
}

const ChecklistCard: React.FC<ChecklistCardProps> = ({ 
  title, 
  documentId, 
  revision, 
  hasDocument = false 
}) => {
  return (
    <Card className="p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="p-2 bg-primary/10 rounded-lg shrink-0">
            <FileText className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h4 className="font-medium text-foreground text-sm leading-tight">
              {title}
            </h4>
            {hasDocument ? (
              <p className="text-xs text-muted-foreground mt-1">
                Rev. {revision || '01'} • Click to view
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                No document uploaded
              </p>
            )}
          </div>
        </div>
        
        <div className="shrink-0">
          {hasDocument ? (
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled className="text-xs">
              <Upload className="w-3 h-3 mr-1" />
              Upload
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default ChecklistCard;
