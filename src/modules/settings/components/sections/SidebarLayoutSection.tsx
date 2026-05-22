import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GripVertical, LayoutList, RotateCcw } from 'lucide-react';
import { NAVIGATION_ITEMS, type NavChild, type NavItem } from '@/config/navigation';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useSidebarOrder, applySidebarOrder, SIDEBAR_ROOT } from '@/shared/hooks/useSidebarOrder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  draggingId: string | null;
  overId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const Row: React.FC<RowProps> = ({
  id, label, icon: Icon, index, total, depth = 0,
  expandable, expanded, onToggleExpand,
  draggingId, overId,
  onDragStart, onDragEnd, onDragOver, onDrop,
  onMoveUp, onMoveDown,
}) => {
  const isDragging = draggingId === id;
  const isOver = overId === id && draggingId && draggingId !== id;
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver(id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(id); }}
      style={{ marginLeft: depth * 20 }}
      className={cn(
        'group flex items-center gap-2 rounded-lg border bg-card px-3 py-2 transition-colors',
        isDragging && 'opacity-50',
        isOver && 'border-primary ring-1 ring-primary'
      )}
    >
      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
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
      <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{index + 1}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp} aria-label={`Move ${label} up`}>
          <ArrowUp className="w-4 h-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={isLast} onClick={onMoveDown} aria-label={`Move ${label} down`}>
          <ArrowDown className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

const SidebarLayoutSection: React.FC = () => {
  const { canAccessModule } = useAuth();
  const { order, setGroupOrder, moveInGroup, getGroupOrder, reset } = useSidebarOrder();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const rootItems: NavItem[] = useMemo(() => {
    const allowed = NAVIGATION_ITEMS.filter((item) => canAccessModule(item.id));
    return applySidebarOrder(allowed, order);
  }, [canAccessModule, order]);

  const handleDrop = (groupId: string, allIds: string[], targetId: string) => {
    if (!draggingId || draggingId === targetId || dragGroup !== groupId) {
      setDraggingId(null); setOverId(null); setDragGroup(null);
      return;
    }
    const base = (getGroupOrder(groupId).length ? getGroupOrder(groupId).slice() : allIds.slice());
    allIds.forEach((x) => { if (!base.includes(x)) base.push(x); });
    const from = base.indexOf(draggingId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) {
      setDraggingId(null); setOverId(null); setDragGroup(null);
      return;
    }
    base.splice(to, 0, base.splice(from, 1)[0]);
    setGroupOrder(groupId, base);
    setDraggingId(null); setOverId(null); setDragGroup(null);
  };

  const startDrag = (groupId: string, id: string) => {
    setDraggingId(id);
    setDragGroup(groupId);
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
        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Navigation order</CardTitle>
          <CardDescription>
            Changes save instantly and apply across the app. Sub-items are reordered within
            their parent module.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rootItems.map((item, index) => {
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
                  onToggleExpand={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}
                  draggingId={dragGroup === SIDEBAR_ROOT ? draggingId : null}
                  overId={dragGroup === SIDEBAR_ROOT ? overId : null}
                  onDragStart={(id) => startDrag(SIDEBAR_ROOT, id)}
                  onDragEnd={() => { setDraggingId(null); setOverId(null); setDragGroup(null); }}
                  onDragOver={(id) => { if (dragGroup === SIDEBAR_ROOT && overId !== id) setOverId(id); }}
                  onDrop={(id) => handleDrop(SIDEBAR_ROOT, rootIds, id)}
                  onMoveUp={() => moveInGroup(SIDEBAR_ROOT, item.id, 'up', rootIds)}
                  onMoveDown={() => moveInGroup(SIDEBAR_ROOT, item.id, 'down', rootIds)}
                />
                {hasChildren && isExpanded && (
                  <div className="space-y-2">
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
                        onMoveUp={() => moveInGroup(item.id, child.id, 'up', childIds)}
                        onMoveDown={() => moveInGroup(item.id, child.id, 'down', childIds)}
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
