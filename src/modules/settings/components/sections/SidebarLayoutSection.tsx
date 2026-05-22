import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, GripVertical, LayoutList, RotateCcw, Lock, Inbox, Info } from 'lucide-react';
import { NAVIGATION_ITEMS, type NavChild, type NavItem } from '@/config/navigation';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useSidebarOrder, applySidebarOrder, SIDEBAR_ROOT } from '@/shared/hooks/useSidebarOrder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/lib/utils';

interface RowProps {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  index: number;
  total: number;
  depth?: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  childCount?: number;
  draggingId: string | null;
  overId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  readOnly?: boolean;
}

const Row: React.FC<RowProps> = ({
  id, label, icon: Icon, index, total, depth = 0,
  expandable, expanded, onToggleExpand, childCount,
  draggingId, overId,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onMoveUp, onMoveDown, readOnly = false,
}) => {
  const isDragging = draggingId === id;
  const isOver = overId === id && draggingId && draggingId !== id;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      draggable={!readOnly}
      onDragStart={() => !readOnly && onDragStart(id)}
      onDragEnd={() => !readOnly && onDragEnd()}
      onDragOver={(e) => { if (readOnly) return; e.preventDefault(); onDragOver(id); }}
      onDrop={(e) => { if (readOnly) return; e.preventDefault(); onDrop(id); }}
      style={{ marginLeft: depth * 20 }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors',
        isDragging && 'opacity-50',
        isOver && 'border-primary ring-1 ring-primary',
        readOnly && 'opacity-70'
      )}
    >
      <GripVertical
        className={cn(
          'w-4 h-4 text-muted-foreground',
          readOnly ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'
        )}
      />
      {expandable ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-muted-foreground hover:text-foreground"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ) : (
        <span className="w-4" />
      )}
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="flex-1 text-sm font-medium truncate">{label}</span>
      {expandable && typeof childCount === 'number' && (
        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
          {childCount} {childCount === 1 ? 'item' : 'items'}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{index + 1}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst || readOnly} onClick={onMoveUp} aria-label={`Move ${label} up`}>
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isLast || readOnly} onClick={onMoveDown} aria-label={`Move ${label} down`}>
          <ArrowDown className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

const SkeletonRow: React.FC<{ depth?: number }> = ({ depth = 0 }) => (
  <div
    style={{ marginLeft: depth * 20 }}
    className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
  >
    <Skeleton className="w-4 h-4 rounded" />
    <Skeleton className="w-4 h-4 rounded" />
    <Skeleton className="w-4 h-4 rounded" />
    <Skeleton className="h-4 flex-1 max-w-[40%]" />
    <Skeleton className="h-4 w-6" />
  </div>
);

const SidebarLayoutSection: React.FC = () => {
  const { canAccessModule, loading, user } = useAuth();
  const { order, moveInGroup, getGroupOrder, reorderGroup, reset } = useSidebarOrder();
  const { toast } = useToast();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Read-only when not signed in — preview the layout but no persistence value
  const readOnly = !loading && !user;

  const rootItems: NavItem[] = useMemo(() => {
    const allowed = NAVIGATION_ITEMS.filter((item) => canAccessModule(item.id));
    return applySidebarOrder(allowed, order);
  }, [canAccessModule, order]);

  // All parent modules (those with at least one accessible child) — used for
  // expand-all / collapse-all so every nested group is reachable.
  const expandableParents = useMemo(
    () => rootItems.filter((i) => !!i.children?.length),
    [rootItems]
  );
  const allExpanded =
    expandableParents.length > 0 &&
    expandableParents.every((p) => expanded[p.id]);

  const toggleAll = () => {
    if (allExpanded) {
      setExpanded({});
    } else {
      const next: Record<string, boolean> = {};
      expandableParents.forEach((p) => {
        next[p.id] = true;
      });
      setExpanded(next);
    }
  };

  const handleDrop = (groupId: string, allIds: string[], targetId: string) => {
    const clear = () => {
      setDraggingId(null);
      setOverId(null);
      setDragGroup(null);
    };
    if (readOnly || !draggingId || draggingId === targetId || dragGroup !== groupId) {
      clear();
      return;
    }
    const movedId = draggingId;
    let didChange = false;
    reorderGroup(groupId, allIds, (base) => {
      const from = base.indexOf(movedId);
      const to = base.indexOf(targetId);
      if (from === -1 || to === -1 || from === to) return null;
      const next = [...base];
      next.splice(to, 0, next.splice(from, 1)[0]);
      didChange = true;
      return next;
    });
    clear();
    if (didChange) {
      toast({
        title: 'Sidebar order saved',
        description:
          groupId === SIDEBAR_ROOT
            ? 'Module order updated across the app.'
            : 'Sub-item order updated for this module.',
      });
    }
  };

  const startDrag = (groupId: string, id: string) => {
    if (readOnly) return;
    setDraggingId(id);
    setDragGroup(groupId);
  };

  const handleMove = (
    groupId: string,
    id: string,
    direction: 'up' | 'down',
    allIds: string[]
  ) => {
    if (readOnly) return;
    moveInGroup(groupId, id, direction, allIds);
  };

  const handleReset = () => {
    if (readOnly) return;
    reset();
    toast({ title: 'Sidebar layout reset', description: 'Default order restored.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <LayoutList className="w-6 h-6" />
            Sidebar Layout
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Reorder main modules and the items within each module. Drag a row, or use the
            arrows that appear on hover. Click the chevron to reveal a module's sub-items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAll}
            disabled={loading || expandableParents.length === 0}
          >
            {allExpanded ? (
              <>
                <ChevronsDownUp className="w-4 h-4 mr-2" />
                Collapse all
              </>
            ) : (
              <>
                <ChevronsUpDown className="w-4 h-4 mr-2" />
                Expand all
              </>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={readOnly || loading}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      {readOnly && (
        <Alert>
          <Lock className="w-4 h-4" />
          <AlertTitle>Read-only preview</AlertTitle>
          <AlertDescription>
            Sign in to customize and persist your sidebar layout. Changes made here would not be saved.
          </AlertDescription>
        </Alert>
      )}

      {!loading && !readOnly && rootItems.length === 1 && (
        <Alert>
          <Info className="w-4 h-4" />
          <AlertTitle>Only one module available</AlertTitle>
          <AlertDescription>
            Your role currently grants access to a single module, so there's nothing to reorder.
            Reach out to your DPA to request additional access.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Navigation order</CardTitle>
          <CardDescription>
            Changes save instantly and apply across the app. Sub-items are reordered within
            their parent module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading && (
            <div className="space-y-2" aria-busy="true" aria-label="Loading sidebar layout">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {!loading && rootItems.length === 0 && (
            <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-lg border border-dashed bg-muted/20">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Inbox className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No modules to reorder</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                You don't have access to any navigation modules yet. Once your administrator grants
                permissions, they'll appear here for reordering.
              </p>
            </div>
          )}

          {!loading && rootItems.map((item, index) => {
            const rootIds = rootItems.map((i) => i.id);
            const hasChildren = !!item.children?.length;
            const isExpanded = expanded[item.id];
            const orderedChildren: NavChild[] = hasChildren
              ? applySidebarOrder(item.children!, getGroupOrder(item.id))
              : [];
            const childIds = orderedChildren.map((c) => c.id);

            return (
              <React.Fragment key={item.id}>
                <Row
                  id={item.id}
                  label={item.label}
                  icon={item.icon}
                  index={index}
                  total={rootItems.length}
                  expandable={hasChildren}
                  expanded={isExpanded}
                  childCount={hasChildren ? orderedChildren.length : undefined}
                  onToggleExpand={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}
                  draggingId={dragGroup === SIDEBAR_ROOT ? draggingId : null}
                  overId={dragGroup === SIDEBAR_ROOT ? overId : null}
                  onDragStart={(id) => startDrag(SIDEBAR_ROOT, id)}
                  onDragEnd={() => { setDraggingId(null); setOverId(null); setDragGroup(null); }}
                  onDragOver={(id) => { if (dragGroup === SIDEBAR_ROOT && overId !== id) setOverId(id); }}
                  onDrop={(id) => handleDrop(SIDEBAR_ROOT, rootIds, id)}
                  onMoveUp={() => handleMove(SIDEBAR_ROOT, item.id, 'up', rootIds)}
                  onMoveDown={() => handleMove(SIDEBAR_ROOT, item.id, 'down', rootIds)}
                  readOnly={readOnly}
                />
                {hasChildren && isExpanded && (
                  <div className="space-y-2">
                    {orderedChildren.length === 0 && (
                      <div
                        style={{ marginLeft: 20 }}
                        className="text-xs text-muted-foreground px-3 py-2 rounded-md border border-dashed bg-muted/10"
                      >
                        No accessible sub-items for your role.
                      </div>
                    )}
                    {orderedChildren.map((child, ci) => (
                      <Row
                        key={child.id}
                        id={child.id}
                        label={child.label}
                        icon={child.icon}
                        index={ci}
                        total={orderedChildren.length}
                        depth={1}
                        draggingId={dragGroup === item.id ? draggingId : null}
                        overId={dragGroup === item.id ? overId : null}
                        onDragStart={(id) => startDrag(item.id, id)}
                        onDragEnd={() => { setDraggingId(null); setOverId(null); setDragGroup(null); }}
                        onDragOver={(id) => { if (dragGroup === item.id && overId !== id) setOverId(id); }}
                        onDrop={(id) => handleDrop(item.id, childIds, id)}
                        onMoveUp={() => handleMove(item.id, child.id, 'up', childIds)}
                        onMoveDown={() => handleMove(item.id, child.id, 'down', childIds)}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default SidebarLayoutSection;
