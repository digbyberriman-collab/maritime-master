/**
 * Regression: Fleet › Reports › Incident Analytics re-fetched in an endless
 * loop. The page built a fresh date range (new Date()) on every render and the
 * hooks keyed their queries on those Date objects, so every fetch changed the
 * key and started another. The page now memoises the range and the hooks key
 * on day strings, so either fix alone stops the loop.
 */
import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, afterEach, beforeAll } from "vitest";

const counts = { incidents: 0 };
const now = Date.now();
const iso = (days: number) => new Date(now - days * 86_400_000).toISOString();
const fixture = [
  { id: "1", vessel_id: "v1", incident_type: "Injury", severity_actual: 4, severity_potential: 5, status: "Closed", location: "Deck", incident_date: iso(5), updated_at: iso(2), root_cause: "Slip", vessel: { id: "v1", name: "Alpha" } },
  { id: "2", vessel_id: "v1", incident_type: "Near Miss", severity_actual: 1, severity_potential: 3, status: "Open", location: "Engine", incident_date: iso(10), updated_at: iso(9), root_cause: "Slip", vessel: { id: "v1", name: "Alpha" } },
  { id: "3", vessel_id: "v2", incident_type: "Near Miss", severity_actual: 1, severity_potential: 2, status: "Open", location: "Deck", incident_date: iso(12), updated_at: iso(11), root_cause: "Other", vessel: { id: "v2", name: "Bravo" } },
];

type Result = { data: typeof fixture; error: null };
interface Builder extends PromiseLike<Result> {
  [method: string]: unknown;
}

vi.mock("@/integrations/supabase/client", () => {
  const builder = (): Builder => {
    const b = {} as Builder;
    for (const m of ["select", "gte", "lte", "lt", "eq", "order", "in", "not", "is"]) b[m] = () => b;
    b.then = (onFulfilled, onRejected) =>
      new Promise((r) => setTimeout(r, 2))
        .then((): Result => ({ data: fixture, error: null }))
        .then(onFulfilled, onRejected);
    return b;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === "incidents") counts.incidents++;
        return builder();
      },
    },
  };
});
vi.mock("@/modules/vessels/hooks/useVessels", () => ({ useVessels: () => ({ vessels: [] }) }));
vi.mock("@/shared/components/layout/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import IncidentAnalytics from "@/modules/incidents/pages/IncidentAnalytics";
import {
  getDateRangeFromPreset,
  useIncidentAnalytics,
  useVesselComparison,
} from "@/modules/analytics/hooks/useIncidentAnalytics";

beforeAll(() => {
  const g = globalThis as { ResizeObserver?: unknown };
  if (!g.ResizeObserver) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** from('incidents') count at two checkpoints after the first load settled. */
async function countsAfterSettle(): Promise<[number, number]> {
  await wait(250);
  const a = counts.incidents;
  await wait(250);
  return [a, counts.incidents];
}

afterEach(() => {
  cleanup();
  counts.incidents = 0;
});

describe("Incident Analytics fetches once per filter change", () => {
  it("the page settles and renders the fixture data", async () => {
    wrap(<IncidentAnalytics />);
    // 1 injury, 2 near misses: the ratio tile only shows this once data loaded.
    expect(await screen.findByText("2.0:1", undefined, { timeout: 2000 })).toBeInTheDocument();
    const [first, second] = await countsAfterSettle();
    expect(second).toBe(first);
    // Current + previous period for analytics, one for the vessel comparison.
    expect(first).toBeLessThanOrEqual(6);
    // No fake Export (R19, D-384): the control is disabled with its reason.
    const exportButton = screen.getByRole("button", { name: /export/i });
    expect(exportButton).toBeDisabled();
    expect(exportButton).toHaveAccessibleDescription("Export is not available for this report yet");
  });

  it("the hooks do not loop even when a caller rebuilds the range every render", async () => {
    const Unmemoised = () => {
      const range = getDateRangeFromPreset("last30"); // new Date objects each render
      const analytics = useIncidentAnalytics(range);
      const comparison = useVesselComparison(range);
      return (
        <div data-testid="out">
          {analytics.data ? String(analytics.data.totalIncidents) : "..."}|{comparison.data?.length ?? "-"}
        </div>
      );
    };
    wrap(<Unmemoised />);
    expect(await screen.findByText("3|2", undefined, { timeout: 2000 })).toBeInTheDocument();
    const [first, second] = await countsAfterSettle();
    expect(second).toBe(first);
    expect(first).toBeLessThanOrEqual(6);
  });
});
