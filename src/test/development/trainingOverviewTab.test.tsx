/**
 * Fleet › Training › Overview tiles (kpi-good-count-all-clear): an empty
 * programme is not a clean bill. The good and programme counts
 * (Applications, Approved not completed, Completed, Clawback active) read a
 * neutral, muted line at zero, never the green "All clear"; the queue and
 * problem counts (Awaiting approval, Waiting more than 7 days) keep it.
 */
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrainingOverviewTab } from '@/modules/development/components/training/TrainingOverviewTab';
import { DEFAULT_CATEGORY_LABELS } from '@/modules/development/lib/settingsSchema';

const ready = <T extends object>(data: T) => ({ status: 'ready' as const, updatedAt: 0, refreshing: false, retry: () => undefined, ...data });

function renderEmpty() {
  return render(
    <MemoryRouter>
      <TrainingOverviewTab
        register={ready({ rows: [], stagesSetUp: true })}
        expenses={ready({ totals: { reimbursedUsd: 0, pendingClaims: 0 } })}
        mode="both"
        vessels={[]}
        categoryLabels={DEFAULT_CATEGORY_LABELS}
        today="2026-11-27"
        now={new Date('2026-11-27T10:00:00Z')}
        onOpen={() => undefined}
      />
    </MemoryRouter>,
  );
}

const tile = (label: string) => screen.getByText(label, { selector: '.type-eyebrow' }).closest('[data-state]') as HTMLElement;

describe('TrainingOverviewTab: zero tiles', () => {
  it.each([
    ['Applications', 'None submitted yet'],
    ['Approved, not completed', 'None waiting to complete'],
    ['Completed', 'None completed yet'],
    ['Clawback active', 'None in a clawback window'],
  ])('%s at zero reads "%s", muted, with no success colour or check', (label, zeroLabel) => {
    renderEmpty();
    const t = tile(label);
    expect(t).toHaveAttribute('data-state', 'zero');
    expect(within(t).getByText(zeroLabel)).toHaveClass('text-muted-foreground');
    expect(t.querySelector('.text-success')).toBeNull();
    expect(t).not.toHaveTextContent('All clear');
  });

  it('queue and problem counts keep "All clear" at zero', () => {
    renderEmpty();
    for (const label of ['Awaiting approval', 'Waiting more than 7 days']) {
      const t = tile(label);
      expect(t).toHaveAttribute('data-state', 'zero');
      expect(within(t).getByText('All clear')).toHaveClass('text-success');
    }
  });
});
