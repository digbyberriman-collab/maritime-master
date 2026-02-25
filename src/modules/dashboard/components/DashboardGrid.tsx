import React from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, ChevronUp, ChevronDown, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';
import { useDashboardLayout } from '@/modules/dashboard/hooks/useDashboardLayout';

interface DashboardGridProps {
  widgetDefs: WidgetDefinition[];
  children: Record<string, React.ReactNode>;
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ widgetDefs, children }) => {
  const {
    orderedWidgets,
    visibleWidgets,
    editMode,
    setEditMode,
    toggleVisibility,
    moveWidget,
    resetToDefaults,
    loading,
  } = useDashboardLayout(widgetDefs);

  if (loading) return null;

  const widgetsToRender = editMode ? orderedWidgets : visibleWidgets;

  return (
    <div className="space-y-4">
      {/* Top bar: edit toggle */}
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          {editMode && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1 text-muted-foreground"
              onClick={resetToDefaults}
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </Button>
          )}
          <Button
            variant={editMode ? 'default' : 'outline'}
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => setEditMode(!editMode)}
          >
            <Pencil className="w-3 h-3" />
            {editMode ? 'Done' : 'Customize'}
          </Button>
        </div>
      </div>

      {/* Widgets */}
      <div className="space-y-4">
        {widgetsToRender.map((widget, idx) => {
          const def = widgetDefs.find((d) => d.id === widget.widget_id);
          const content = children[widget.widget_id];
          if (!def || !content) return null;

          return (
            <div
              key={widget.widget_id}
              className={cn(
                'relative transition-all duration-200',
                editMode && 'ring-1 ring-dashed ring-muted-foreground/30 rounded-lg',
                editMode && !widget.is_visible && 'opacity-40'
              )}
            >
              {editMode && (
                <div className="absolute -top-3 right-2 z-10 flex items-center gap-0.5 bg-card border rounded-md shadow-sm px-1 py-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveWidget(widget.widget_id, 'up')}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveWidget(widget.widget_id, 'down')}
                    disabled={idx === widgetsToRender.length - 1}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => toggleVisibility(widget.widget_id)}
                    title={widget.is_visible ? 'Hide widget' : 'Show widget'}
                  >
                    {widget.is_visible ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              )}
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardGrid;
