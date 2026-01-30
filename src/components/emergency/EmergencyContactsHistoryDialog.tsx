import { useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Clock, User, ChevronDown } from 'lucide-react';
import { useEmergencyContactsStore } from '@/store/emergencyContactsStore';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';

interface EmergencyContactsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
}

export function EmergencyContactsHistoryDialog({
  open,
  onOpenChange,
  contactId,
}: EmergencyContactsHistoryDialogProps) {
  const { history, loadHistory } = useEmergencyContactsStore();

  useEffect(() => {
    if (open && contactId) {
      loadHistory(contactId);
    }
  }, [open, contactId, loadHistory]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Revision History</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          {history.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No revision history available.</p>
          ) : (
            <div className="space-y-4 pr-4">
              {history.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline">Rev. {entry.revision_number}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {new Date(entry.revision_date).toLocaleDateString()}
                    </span>
                  </div>
                  
                  {entry.change_summary && (
                    <p className="text-sm mb-3">{entry.change_summary}</p>
                  )}
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    {entry.created_by_name && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {entry.created_by_name}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  {/* Expandable snapshot preview */}
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full justify-between">
                        View snapshot data
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-2 p-3 bg-muted rounded text-xs overflow-x-auto">
                        {JSON.stringify(entry.data_snapshot, null, 2)}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
