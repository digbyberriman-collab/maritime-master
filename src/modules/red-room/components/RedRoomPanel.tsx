/**
 * The Red Room panel: urgent alerts and tasks assigned to the user, with
 * View, Snooze (urgent) or Acknowledge, and Assign task (DPA / Master).
 * Mounted by the legacy DPA dashboard (X5 owns the pages that mount it).
 *
 * Honest states (BUILD-PLAN Phase 1 open item; D-04):
 * - Loading: a skeleton until this company's (and vessel's) read answers.
 * - A failed read: an error with Retry, never the all-clear.
 * - "No urgent actions" only after a successful read that returned none.
 * - A profile with no company says so (nothing can be read), once the
 *   profile has resolved.
 * Items of an earlier read (another vessel) are never shown for this one.
 * Tokens only.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Eye, Clock, UserPlus, CheckCircle, Timer, Loader2, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useRedRoomStore } from '@/modules/red-room/store/redRoomStore';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TONE_FILL, TONE_TEXT, type Tone } from '@/components/ui/tones';
import { PageError } from '@/shared/components/states';
import { useToast } from '@/shared/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { RedRoomItem } from '@/modules/red-room/types';
import { createOptionalChunkLoader } from '@/app/optionalChunks';
import { RedRoomDialogBoundary } from './RedRoomDialogBoundary';

// The panel is on the dashboard, in the entry chunk, so its two dialogs load
// the first time one opens and then stay mounted (gap/00 I6 budget). They are
// optional UI chunks (src/app/optionalChunks.ts, D-100): one import at a time,
// shared by the hover / focus preloads and the lazy component, and a failed
// import is forgotten. A failure shows the dialog's own boundary
// (RedRoomDialogBoundary: Close, Try again, Reload), never a page reload on
// its own. Try again gets a fresh lazy() bound to a new loader.load(), because
// React.lazy keeps a rejection; the boundary is keyed by the attempt. The
// import specifiers stay literal so the built chunks keep their names
// (SnoozeDialog-<hash>.js, AssignTaskDialog-<hash>.js) for isOptionalChunkError.
const snoozeLoader = createOptionalChunkLoader<typeof import('./SnoozeDialog')>(() => import('./SnoozeDialog'));
const assignLoader = createOptionalChunkLoader<typeof import('./AssignTaskDialog')>(() => import('./AssignTaskDialog'));

const snoozeAttempt = (attempt: number) => ({ attempt, Dialog: lazy(snoozeLoader.load) });
const assignAttempt = (attempt: number) => ({ attempt, Dialog: lazy(assignLoader.load) });

interface RedRoomPanelProps {
  vesselId?: string | null;
}

export function RedRoomPanel({ vesselId }: RedRoomPanelProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, profileResolved } = useAuth();
  
  const { 
    items, 
    error: loadError,
    canAssignTasks,
    loadRedRoomItems, 
    checkPermissions,
    acknowledgeItem,
    getViewUrl 
  } = useRedRoomStore();

  const [snoozeDialogOpen, setSnoozeDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [snoozeDialogUsed, setSnoozeDialogUsed] = useState(false);
  const [assignDialogUsed, setAssignDialogUsed] = useState(false);
  const [selectedItem, setSelectedItem] = useState<RedRoomItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [snoozeChunk, setSnoozeChunk] = useState(() => snoozeAttempt(0));
  const [assignChunk, setAssignChunk] = useState(() => assignAttempt(0));

  const companyId = profile?.company_id ?? null;
  // The read this panel shows: the store is shared, so only a read that
  // answered for this company and vessel counts (`settledKey`); a Retry
  // reads again (`attempt`).
  const readKey = companyId ? `${companyId}:${vesselId ?? 'all'}` : null;
  const [attempt, setAttempt] = useState(0);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  // The store's actions, read through refs so a new function identity (a
  // test double, a store reset) never restarts the read.
  const loadRef = useRef(loadRedRoomItems);
  loadRef.current = loadRedRoomItems;
  const checkRef = useRef(checkPermissions);
  checkRef.current = checkPermissions;

  useEffect(() => {
    void checkRef.current();
  }, []);

  useEffect(() => {
    if (!companyId || !readKey) return undefined;
    let live = true;
    setSettledKey(null);
    void Promise.resolve(loadRef.current(companyId, vesselId)).then(() => {
      if (live) setSettledKey(readKey);
    });
    return () => {
      live = false;
    };
  }, [companyId, vesselId, readKey, attempt]);

  // Handle View - Navigate to related record
  const handleView = (item: RedRoomItem) => {
    const url = getViewUrl(item);
    navigate(url);
  };

  // Handle Snooze (for urgent items)
  const handleSnoozeClick = (item: RedRoomItem) => {
    setSelectedItem(item);
    setSnoozeDialogUsed(true);
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
    setAssignDialogUsed(true);
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

  const SnoozeDialog = snoozeChunk.Dialog;
  const AssignTaskDialog = assignChunk.Dialog;

  const settled = readKey !== null && settledKey === readKey;

  if (!companyId) {
    if (!profileResolved) return <RedRoomSkeleton />;
    return (
      <PageError
        variant="inline"
        title="The Red Room could not load"
        error={new Error('Your account is not linked to a company, so there is nothing to read.')}
        headingLevel={3}
        treatMissingAsOff={false}
      />
    );
  }

  if (!settled) return <RedRoomSkeleton />;

  if (loadError) {
    return (
      <PageError
        variant="inline"
        title="The Red Room could not load"
        error={loadError}
        onRetry={() => setAttempt((n) => n + 1)}
        headingLevel={3}
        treatMissingAsOff={false}
      />
    );
  }

  if (items.length === 0) {
    return (
      <Card className="shadow-card border-success/30 bg-success-muted" data-testid="red-room-empty">
        <CardContent className="py-8 text-center">
          <CheckCircle2 aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-success" />
          <h3 className="type-subtitle text-success">No urgent actions</h3>
          <p className="mt-1 text-sm text-muted-foreground">Nothing in the Red Room needs you right now.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-card border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle aria-hidden="true" className="h-5 w-5 motion-safe:animate-pulse" />
              Red Room: urgent actions
              <Badge variant="destructive" className="ml-2">
                {items.length}
              </Badge>
            </CardTitle>
            <Button variant="ghost" size="sm" className="[@media(pointer:coarse)]:min-h-11" onClick={() => navigate('/alerts?severity=red')}>
              View all
              <ChevronRight aria-hidden="true" className="ml-1 h-4 w-4" />
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
      {snoozeDialogUsed && (
        <RedRoomDialogBoundary
          key={snoozeChunk.attempt}
          open={snoozeDialogOpen}
          onClose={() => setSnoozeDialogOpen(false)}
          onRetry={() => setSnoozeChunk(snoozeAttempt(snoozeChunk.attempt + 1))}
        >
          <Suspense fallback={null}>
            <SnoozeDialog
              open={snoozeDialogOpen}
              onOpenChange={setSnoozeDialogOpen}
              item={selectedItem}
              onSuccess={handleSnoozeComplete}
            />
          </Suspense>
        </RedRoomDialogBoundary>
      )}

      {/* Assign Task Dialog */}
      {assignDialogUsed && (
        <RedRoomDialogBoundary
          key={assignChunk.attempt}
          open={assignDialogOpen}
          onClose={() => setAssignDialogOpen(false)}
          onRetry={() => setAssignChunk(assignAttempt(assignChunk.attempt + 1))}
        >
          <Suspense fallback={null}>
            <AssignTaskDialog
              open={assignDialogOpen}
              onOpenChange={setAssignDialogOpen}
              item={selectedItem}
              onSuccess={handleAssignComplete}
            />
          </Suspense>
        </RedRoomDialogBoundary>
      )}
    </>
  );
}

/** The panel while its read is in flight: header and three item-shaped rows. */
function RedRoomSkeleton() {
  return (
    <Card className="shadow-card" role="status" aria-busy="true">
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        <span className="sr-only">Loading the Red Room</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

/** Red Room severities as tones; anything else is neutral. */
const SEVERITY_TONE: Readonly<Record<string, Tone>> = {
  red: 'danger',
  orange: 'orange',
  amber: 'warn',
  yellow: 'warn',
  green: 'ok',
};

/** An item's icon-only action: 32 px, 44 px on touch (D-35). */
const ITEM_ACTION = 'h-8 w-8 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11';

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

  return (
    <div className="bg-background rounded-lg border border-destructive/20 p-4 hover:border-destructive/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Item Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div aria-hidden="true" className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', TONE_FILL[SEVERITY_TONE[item.severity] ?? 'neutral'])} />
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
                <span className={TONE_TEXT.purple}>
                  Assigned by {item.assigned_by_name}
                </span>
              </>
            )}

            {item.snooze_count > 0 && (
              <>
                <span>•</span>
                <span className={cn('flex items-center gap-1', TONE_TEXT.warn)}>
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
                className={ITEM_ACTION}
                aria-label="View details"
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
                  className={cn(ITEM_ACTION, TONE_TEXT.warn, 'hover:bg-warning-muted hover:text-warning')}
                  aria-label="Snooze"
                  onClick={() => onSnooze(item)}
                  onPointerEnter={snoozeLoader.preload}
                  onFocus={snoozeLoader.preload}
                  disabled={isProcessing || item.snooze_count >= 3}
                >
                  {isProcessing ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
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
                  className={cn(ITEM_ACTION, TONE_TEXT.ok, 'hover:bg-success-muted hover:text-success')}
                  aria-label="Acknowledge"
                  onClick={() => onAcknowledge(item)}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
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
                  className={cn(ITEM_ACTION, TONE_TEXT.purple, 'hover:bg-purple-muted hover:text-purple')}
                  aria-label="Assign task"
                  onClick={() => onAssign(item)}
                  onPointerEnter={assignLoader.preload}
                  onFocus={assignLoader.preload}
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
