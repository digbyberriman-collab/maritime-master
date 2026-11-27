/**
 * Fleet › Reports › Drill analytics (src/modules/drills/pages/DrillAnalytics.tsx,
 * a legacy hub page): no export control that does nothing (R19, D-384; its
 * export is X5 wave 2's). Export is disabled with its reason beside it.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/drills/hooks/useDrills', () => ({
  useDrills: () => ({ drills: [], drillTypes: [], completedDrills: [], thisYearDrills: [] }),
  useDrillDetails: () => ({ data: null }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVessels: () => ({ vessels: [] }) }));
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>();
  return { ...actual, ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div> };
});

import DrillAnalytics from '@/modules/drills/pages/DrillAnalytics';

describe('Drill analytics: export (R19, D-384)', () => {
  it('shows one Export control, disabled with its reason (the no-op buttons are gone)', () => {
    render(
      <MemoryRouter>
        <DrillAnalytics />
      </MemoryRouter>,
    );
    const buttons = screen.getAllByRole('button', { name: /export/i });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
    expect(buttons[0]).toHaveAccessibleDescription('Export is not available for this report yet');
    expect(screen.queryByRole('button', { name: /excel/i })).toBeNull();
  });
});
