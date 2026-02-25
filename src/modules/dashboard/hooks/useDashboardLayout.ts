import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';

export interface DashboardWidgetConfig {
  widget_id: string;
  sort_order: number;
  is_visible: boolean;
  column_span: number;
}

export interface WidgetDefinition {
  id: string;
  label: string;
  description: string;
  defaultOrder: number;
  defaultVisible: boolean;
  defaultColSpan: number;
}

export function useDashboardLayout(widgetDefs: WidgetDefinition[]) {
  const { user } = useAuth();
  const [layouts, setLayouts] = useState<DashboardWidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  const fetchLayouts = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('user_dashboard_layouts')
      .select('widget_id, sort_order, is_visible, column_span')
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true });

    if (!error && data && data.length > 0) {
      setLayouts(data);
    } else {
      // Use defaults
      setLayouts(
        widgetDefs.map((w) => ({
          widget_id: w.id,
          sort_order: w.defaultOrder,
          is_visible: w.defaultVisible,
          column_span: w.defaultColSpan,
        }))
      );
    }
    setLoading(false);
  }, [user?.id, widgetDefs]);

  useEffect(() => {
    fetchLayouts();
  }, [fetchLayouts]);

  // Sort widgets by sort_order
  const orderedWidgets = [...layouts].sort((a, b) => a.sort_order - b.sort_order);
  const visibleWidgets = orderedWidgets.filter((w) => w.is_visible);

  const toggleVisibility = useCallback(
    async (widgetId: string) => {
      if (!user?.id) return;
      const widget = layouts.find((w) => w.widget_id === widgetId);
      if (!widget) return;

      const newVisible = !widget.is_visible;

      // Optimistic update
      setLayouts((prev) =>
        prev.map((w) => (w.widget_id === widgetId ? { ...w, is_visible: newVisible } : w))
      );

      await supabase
        .from('user_dashboard_layouts')
        .upsert(
          {
            user_id: user.id,
            widget_id: widgetId,
            sort_order: widget.sort_order,
            is_visible: newVisible,
            column_span: widget.column_span,
          },
          { onConflict: 'user_id,widget_id' }
        );
    },
    [user?.id, layouts]
  );

  const moveWidget = useCallback(
    async (widgetId: string, direction: 'up' | 'down') => {
      if (!user?.id) return;
      const sorted = [...layouts].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex((w) => w.widget_id === widgetId);
      if (idx < 0) return;

      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;

      // Swap sort_order
      const newLayouts = [...sorted];
      const tempOrder = newLayouts[idx].sort_order;
      newLayouts[idx] = { ...newLayouts[idx], sort_order: newLayouts[swapIdx].sort_order };
      newLayouts[swapIdx] = { ...newLayouts[swapIdx], sort_order: tempOrder };

      setLayouts(newLayouts);

      // Persist both
      await Promise.all([
        supabase
          .from('user_dashboard_layouts')
          .upsert(
            {
              user_id: user.id,
              widget_id: newLayouts[idx].widget_id,
              sort_order: newLayouts[idx].sort_order,
              is_visible: newLayouts[idx].is_visible,
              column_span: newLayouts[idx].column_span,
            },
            { onConflict: 'user_id,widget_id' }
          ),
        supabase
          .from('user_dashboard_layouts')
          .upsert(
            {
              user_id: user.id,
              widget_id: newLayouts[swapIdx].widget_id,
              sort_order: newLayouts[swapIdx].sort_order,
              is_visible: newLayouts[swapIdx].is_visible,
              column_span: newLayouts[swapIdx].column_span,
            },
            { onConflict: 'user_id,widget_id' }
          ),
      ]);
    },
    [user?.id, layouts]
  );

  const resetToDefaults = useCallback(async () => {
    if (!user?.id) return;
    await supabase.from('user_dashboard_layouts').delete().eq('user_id', user.id);
    setLayouts(
      widgetDefs.map((w) => ({
        widget_id: w.id,
        sort_order: w.defaultOrder,
        is_visible: w.defaultVisible,
        column_span: w.defaultColSpan,
      }))
    );
  }, [user?.id, widgetDefs]);

  return {
    orderedWidgets,
    visibleWidgets,
    allWidgets: layouts,
    loading,
    editMode,
    setEditMode,
    toggleVisibility,
    moveWidget,
    resetToDefaults,
  };
}
