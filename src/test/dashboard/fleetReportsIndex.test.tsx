/**
 * The Fleet reports index (the Reports leaf, /fleet/reports) links every
 * report inside the Fleet scope, on design tokens only. Moved unchanged from
 * src/test/router/fleetReachable.test.tsx by platform-prep PP2; the page is
 * the dashboard module's (X5 replaces it with the reports hub, X5-03A).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FleetReportsIndex, { FLEET_REPORT_PATHS } from '@/modules/dashboard/pages/FleetReportsIndex';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('Fleet reports index', () => {
  it('the reports index renders relative links that stay in the Fleet scope', () => {
    render(
      <MemoryRouter initialEntries={['/fleet/reports']}>
        <Routes>
          <Route path="/fleet/reports" element={<FleetReportsIndex />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Fleet Reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Risk overview/ })).toHaveAttribute('href', '/fleet/reports/risk-overview');
    expect(screen.getByRole('link', { name: /CAPA tracker/ })).toHaveAttribute('href', '/fleet/reports/capa-tracker');
    expect(screen.getAllByRole('link')).toHaveLength(FLEET_REPORT_PATHS.length);
  });

  it('the reports index uses design tokens only', () => {
    const source = read('src/modules/dashboard/pages/FleetReportsIndex.tsx');
    expect(source).not.toMatch(/(?<![\w-])(?:bg|text|border|ring|from|to)-(?:white|black|(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3})/);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\bdark:/);
  });
});
