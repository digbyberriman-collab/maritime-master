import React from 'react';
import { toast } from 'sonner';
import { Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { DashboardLayoutState } from '@/modules/dashboard/hooks/useDashboardLayout';

interface DashboardLayoutControlsProps {
  layout: Pick<DashboardLayoutState, 'editMode' | 'setEditMode' | 'resetToDefaults' | 'loading'>;
}

/**
 * Reset / Customize for the widget grid, placed in the page header's actions.
 * Disabled until the saved layout has loaded, so nothing acts on defaults the
 * user has not seen.
 */
const DashboardLayoutControls: React.FC<DashboardLayoutControlsProps> = ({ layout }) => {
  const { editMode, setEditMode, resetToDefaults, loading } = layout;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="hidden gap-1.5 text-muted-foreground sm:inline-flex [@media(pointer:coarse)]:min-h-11"
        disabled={loading}
        onClick={async () => {
          await resetToDefaults();
          toast.success('Dashboard reset — all widgets restored');
        }}
        title="Restore all widgets and the default order"
      >
        <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
        Reset
      </Button>
      <Button
        variant={editMode ? 'default' : 'outline'}
        size="sm"
        className="gap-1.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11"
        disabled={loading}
        onClick={() => setEditMode(!editMode)}
      >
        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="sr-only sm:not-sr-only">{editMode ? 'Done' : 'Customize'}</span>
      </Button>
    </>
  );
};

export default DashboardLayoutControls;
