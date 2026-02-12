import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  Eye, 
  Clock, 
  UserPlus,
  CheckCircle,
  Timer,
  Loader2,
  ChevronRight,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useRedRoomStore } from '@/store/redRoomStore';
import { useAuth } from '@/contexts/AuthContext';
import { SnoozeDialog } from './SnoozeDialog';
import { AssignTaskDialog } from './AssignTaskDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { RedRoomItem } from '@/types/redRoom';

interface RedRoomPanelProps {
  vesselId?: string | null;
}

export function RedRoomPanel({ vesselId }: RedRoomPanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  
  const { 
    items, 
    isLoading, 
    canAssignTasks,
    loadRedRoomItems, 
    checkPermissions,
    acknowledgeItem,
    getViewUrl 
  } = useRedRoomStore();

  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RedRoomItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const memoizedCheckPermissions = useCallback(() => {
    checkPermissions();
  }, [checkPermissions]);

  const memoizedLoadRedRoomItems = useCallback(() => {
    if (profile?.company_id) {
      loadRedRoomItems(profile.company_id, vesselId);
    }
  }, [loadRedRoomItems, profile?.company_id, vesselId]);

  useEffect(() => {
    memoizedCheckPermissions();
    memoizedLoadRedRoomItems();
  }, [memoizedCheckPermissions, memoizedLoadRedRoomItems]);

  // Handle View - Navigate to related record
  const handleView = (item: RedRoomItem) => {
    const url = getViewUrl(item);
    navigate(url);
  };

  // Handle Snooze (for urgent items)
  const handleSnoozeClick = (item: RedRoomItem) => {
    setSelectedItem(item);
    setSnoozeDialogOpen(true);
  };

  // Handle Acknowledge (for non-urgent items)
  const handleAcknowledge = async (item: RedRoomItem) => {
    // If urgent (red), should use snooze instead
    if (item.severity === 'red' && item.source_type === 'urgent') {
      handleSnoozeClick(item);
      return;
    }

    setProcessingId(item.id);
    
    try {
      const result = await acknowledgeItem(item.id);
      
      if (result.success) {
        toast({
          title: 'Acknowledged',
          description: 'The item has been acknowledged.',
        });
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to acknowledge.',
          variant: 'destructive',
        });
      }
    } finally {
      setProcessingId(null);
    }
  };

  // Handle Assign Task (DPA/Captain only)
  const handleAssignClick = (item: RedRoomItem) => {
    if (!canAssignTasks) {
      toast({
        title: 'Permission Denied',
        description: 'Only DPA and Captains can assign tasks.',
        variant: 'destructive',
      });
      return;
    }
    
    setSelectedItem(item);
    setAssignDialogOpen(true);
  };

  // Handle Snooze Complete
  const handleSnoozeComplete = (remainingSnoozes?: number) => {
    setSnoozeDialogOpen(false);
    setSelectedItem(null);
    
    toast({
      title: 'Snoozed',
      description: remainingSnoozes !== undefined 
        ? `Item snoozed. ${remainingSnoozes} snoozes remaining.`
        : 'Item snoozed successfully.',
    });
  };

  // Handle Assign Complete
  const handleAssignComplete = () => {
    setAssignDialogOpen(false);
    setSelectedItem(null);
    
    toast({
      title: 'Task Assigned',
      description: 'The task has been assigned and will appear in their Red Room.',
    });
    
    // Refresh the list
    if (profile?.company_id) {
      loadRedRoomItems(profile.company_id, vesselId);
    }
  };

  if (isLoading && items.length === 0) {
    return (
      <Card className="shadow-card border-muted">
        <CardContent className="py-8 text-center">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="shadow-card border-success/30 bg-success/5">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-success" />
          <h3 className="font-semibold text-success">No Urgent Actions Required</h3>
          <p className="text-sm text-muted-foreground mt-1">
            All critical items have been addressed
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
              RED ROOM - URGENT ACTIONS
              <Badge variant="destructive" className="ml-2">
                {items.length}
              </Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/alerts?severity=red')}>
              View All
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item) => (
            <RedRoomItemCard
              key={item.id}
              item={item}
              onView={handleView}
              onSnooze={handleSnoozeClick}
              onAcknowledge={handleAcknowledge}
              onAssign={handleAssignClick}
              canAssign={canAssignTasks}
              isProcessing={processingId === item.id}
            />
          ))}
        </CardContent>
      </Card>

      {/* Snooze Dialog */}
      <SnoozeDialog
        open={snoozeDialogOpen}
        onOpenChange={setSnoozeDialogOpen}
        item={selectedItem}
        onSuccess={handleSnoozeComplete}
      />

      {/* Assign Task Dialog */}
      <AssignTaskDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        item={selectedItem}
        onSuccess={handleAssignComplete}
      />
    </>
  );
}

// Individual Item Card
interface RedRoomItemCardProps {
  item: RedRoomItem;
  onView: (item: RedRoomItem) => void;
  onSnooze: (item: RedRoomItem) => void;
  onAcknowledge: (item: RedRoomItem) => void;
  onAssign: (item: RedRoomItem) => void;
  canAssign: boolean;
  isProcessing: boolean;
}

function RedRoomItemCard({ 
  item, 
  onView, 
  onSnooze, 
  onAcknowledge, 
  onAssign,
  canAssign,
  isProcessing 
}: RedRoomItemCardProps) {
  const isUrgent = item.severity === 'red';
  const isAssigned = item.source_type === 'assigned';

  const severityColors: Record<string, string> = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    yellow: 'bg-yellow-500',
    green: 'bg-green-500',
  };

  return (
    <div className="bg-background rounded-lg border border-destructive/20 p-4 hover:border-destructive/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Item Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', severityColors[item.severity] || 'bg-gray-500')} />
            <p className="font-semibold text-sm truncate">{item.title}</p>
            {isAssigned && (
              <Badge variant="secondary" className="text-xs">
                Assigned to you
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-1">
            {item.source_module && (
              <span className="capitalize">{item.source_module}</span>
            )}
            <span>•</span>
            <span>{item.vessel_name}</span>
            
            {item.due_at && (
              <>
                <span>•</span>
                <span className={cn('flex items-center gap-1', item.is_overdue && 'text-destructive font-medium')}>
                  <Clock className="w-3 h-3" />
                  {item.is_overdue 
                    ? 'Overdue' 
                    : `Due ${formatDistanceToNow(new Date(item.due_at), { addSuffix: true })}`
                  }
                </span>
              </>
            )}

            {item.assigned_by_name && (
              <>
                <span>•</span>
                <span className="text-purple-600 dark:text-purple-400">
                  Assigned by {item.assigned_by_name}
                </span>
              </>
            )}

            {item.snooze_count > 0 && (
              <>
                <span>•</span>
                <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Timer className="w-3 h-3" />
                  Snoozed {item.snooze_count}x
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* VIEW - Always available */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onView(item)}
              >
                <Eye className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View Details</TooltipContent>
          </Tooltip>

          {/* SNOOZE (for urgent) or ACKNOWLEDGE (for non-urgent) */}
          {isUrgent ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-950"
                  onClick={() => onSnooze(item)}
                  disabled={isProcessing || item.snooze_count >= 3}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Timer className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {item.snooze_count >= 3 ? 'Max snoozes reached' : `Snooze (${3 - item.snooze_count} remaining)`}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-100 dark:hover:bg-green-950"
                  onClick={() => onAcknowledge(item)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Acknowledge</TooltipContent>
            </Tooltip>
          )}

          {/* ASSIGN TASK - DPA/Captain only */}
          {canAssign && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-100 dark:hover:bg-purple-950"
                  onClick={() => onAssign(item)}
                >
                  <UserPlus className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Assign Task</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

export default RedRoomPanel;
