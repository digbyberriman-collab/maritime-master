import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, LayoutList, RotateCcw } from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/config/navigation';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useSidebarOrder, applySidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SidebarLayoutSection: React.FC = () => {
  const { canAccessModule } = useAuth();
  const { order, setOrder, move, reset } = useSidebarOrder();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const items = useMemo(() => {
    const allowed = NAVIGATION_ITEMS.filter((item) => canAccessModule(item.id));
    return applySidebarOrder(allowed, order);
  }, [canAccessModule, order]);

  const ids = items.map((i) => i.id);

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const base = ids.slice();
    const from = base.indexOf(draggingId);
    const to = base.indexOf(targetId);
    if (from === -1 || to === -1) return;
    base.splice(to, 0, base.splice(from, 1)[0]);
    setOrder(base);
    setDraggingId(null);
    setOverId(null);
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
            Reorder the main navigation to match how you work. Drag a module, or use the arrows
            that appear on hover.
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
            Changes save instantly and apply to your sidebar across the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, index) => {
            const Icon = item.icon;
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            const isDragging = draggingId === item.id;
            const isOver = overId === item.id && draggingId && draggingId !== item.id;

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDraggingId(item.id)}
                onDragEnd={() => {
                  setDraggingId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (overId !== item.id) setOverId(item.id);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(item.id);
                }}
                className={cn(
                  'group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors',
                  isDragging && 'opacity-50',
                  isOver && 'border-primary ring-1 ring-primary'
                )}
              >
                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                <Icon className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">{item.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">
                  {index + 1}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isFirst}
                    onClick={() => move(item.id, 'up', ids)}
                    aria-label={`Move ${item.label} up`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isLast}
                    onClick={() => move(item.id, 'down', ids)}
                    aria-label={`Move ${item.label} down`}
                  >
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default SidebarLayoutSection;