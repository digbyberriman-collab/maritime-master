import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronUp, ChevronDown, Eye, EyeOff, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardLayoutState, WidgetDefinition } from '@/modules/dashboard/hooks/useDashboardLayout';

interface DashboardGridProps {
  widgetDefs: WidgetDefinition[];
  /** The page's `useDashboardLayout(widgetDefs)`; its Reset / Customize sit in the page header. */
  layout: DashboardLayoutState;
  children: Record<string, React.ReactNode>;
}

/**
 * The customisable widget grid under the fleet dashboard's KPI row. The page
 * owns the layout state (so the controls can live in `PageHeader` actions);
 * this renders the widgets in the saved order and, in edit mode, the per-widget
 * move / width / visibility buttons.
 */
const DashboardGrid: React.FC<DashboardGridProps> = ({ widgetDefs, layout, children }) => {
  const {
    orderedWidgets,
    visibleWidgets,
    editMode,
    toggleVisibility,
    moveWidget,
    toggleColSpan,
    resetToDefaults,
    loading,
  } = layout;

  const [searchParams, setSearchParams] = useSearchParams();

  // Honour ?reset=1 in the URL: wipe the saved layout so every widget is visible.
  useEffect(() => {
    if (loading) return;
    if (searchParams.get('reset') !== '1') return;
    (async () => {
      await resetToDefaults();
      const next = new URLSearchParams(searchParams);
      next.delete('reset');
      setSearchParams(next, { replace: true });
      toast.success('Dashboard reset — all widgets restored');
    })();
    // Runs once when the layout has loaded; the URL is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading dashboard widgets</span>
      </div>
    );
  }

  const widgetsToRender = editMode ? orderedWidgets : visibleWidgets;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {widgetsToRender.map((widget, idx) => {
        const def = widgetDefs.find((d) => d.id === widget.widget_id);
        const content = children[widget.widget_id];
        if (!def || !content) return null;

        const isFullWidth = widget.column_span >= 2;

        return (
          <div
            key={widget.widget_id}
            className={cn(
              'relative min-w-0 transition-opacity duration-quick motion-reduce:transition-none',
              isFullWidth && 'md:col-span-2',
              editMode && 'rounded-lg border border-dashed border-border p-1',
              editMode && !widget.is_visible && 'opacity-40',
            )}
          >
            {editMode && (
              <div className="absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border bg-popover px-1 py-0.5 shadow-sm">
                <span className="sr-only">{def.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveWidget(widget.widget_id, 'up')}
                  disabled={idx === 0}
                  title="Move up"
                  aria-label={`Move ${def.label} up`}
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveWidget(widget.widget_id, 'down')}
                  disabled={idx === widgetsToRender.length - 1}
                  title="Move down"
                  aria-label={`Move ${def.label} down`}
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => toggleColSpan(widget.widget_id)}
                  title={isFullWidth ? 'Half width' : 'Full width'}
                  aria-label={isFullWidth ? `Make ${def.label} half width` : `Make ${def.label} full width`}
                >
                  {isFullWidth ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => toggleVisibility(widget.widget_id)}
                  title={widget.is_visible ? 'Hide widget' : 'Show widget'}
                  aria-label={widget.is_visible ? `Hide ${def.label}` : `Show ${def.label}`}
                >
                  {widget.is_visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            )}
            {content}
          </div>
        );
      })}
    </div>
  );
};

export default DashboardGrid;
