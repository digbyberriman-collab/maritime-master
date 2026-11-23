/**
 * The incidents page does what its URL promises (D-81: an action is offered
 * only when it acts; D-04). `/incidents?new=true` opens the report form and
 * drops the flag from the URL; `&vessel=<id>` preselects that vessel in the
 * form and in the list filter, but only once the user's vessels are in and
 * only for one of them: an unknown id is ignored, never preselected. The
 * palette's "Report an incident", Quick actions and pinned shortcuts all
 * link here.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({
  vessels: [] as { id: string; name: string }[],
  vesselsLoading: false,
  incidentFilters: [] as unknown[],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({
  useVessels: () => ({ vessels: h.vessels, isLoading: h.vesselsLoading }),
}));
vi.mock('@/modules/incidents/hooks/useIncidents', () => ({
  useIncidents: (filters: unknown) => {
    h.incidentFilters.push(filters);
    return { data: [], isLoading: false };
  },
  useIncidentStats: () => ({ data: undefined }),
}));
vi.mock('@/modules/incidents/components/IncidentDetailView', () => ({ IncidentDetailView: () => null }));
vi.mock('@/modules/incidents/components/ReportIncidentModal', () => ({
  ReportIncidentModal: ({ open, defaultVesselId }: { open: boolean; defaultVesselId?: string }) =>
    open ? <div role="dialog" aria-label="Report Incident" data-default-vessel={defaultVesselId ?? ''} /> : null,
}));

import Incidents from '@/modules/incidents/pages/Incidents';

const DRAAK = { id: 'v-dra', name: 'DRAAK' };
const HYDRA = { id: 'v-hyd', name: 'HYDRA' };

let currentLocation = '';
const LocationProbe: React.FC = () => {
  const location = useLocation();
  currentLocation = `${location.pathname}${location.search}`;
  return null;
};

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route
        path="/incidents"
        element={
          <>
            <Incidents />
            <LocationProbe />
          </>
        }
      />
    </Routes>
  </MemoryRouter>
);

const lastVesselFilter = () => (h.incidentFilters.at(-1) as { vesselId?: string } | undefined)?.vesselId;
const vesselFilterTrigger = () => screen.getAllByRole('combobox')[0];

beforeEach(() => {
  h.vessels = [DRAAK, HYDRA];
  h.vesselsLoading = false;
  h.incidentFilters = [];
  currentLocation = '';
});

describe('/incidents?new=true', () => {
  it('opens the report form for a known vessel, preselects it, and drops new=true from the URL', async () => {
    render(tree(`/incidents?new=true&vessel=${DRAAK.id}`));
    const dialog = await screen.findByRole('dialog', { name: 'Report Incident' });
    await waitFor(() => expect(dialog).toHaveAttribute('data-default-vessel', DRAAK.id));
    await waitFor(() => expect(currentLocation).toBe(`/incidents?vessel=${DRAAK.id}`));
    expect(new URLSearchParams(currentLocation.split('?')[1]).has('new')).toBe(false);
    // The list is filtered to that vessel too.
    expect(lastVesselFilter()).toBe(DRAAK.id);
    expect(vesselFilterTrigger()).toHaveTextContent('DRAAK');
  });

  it('opens the form with no default for a vessel that is not one of the user’s', async () => {
    render(tree('/incidents?new=true&vessel=v-unknown'));
    const dialog = await screen.findByRole('dialog', { name: 'Report Incident' });
    await waitFor(() => expect(currentLocation).toBe('/incidents?vessel=v-unknown'));
    expect(dialog).toHaveAttribute('data-default-vessel', '');
    expect(lastVesselFilter()).toBeUndefined();
    expect(vesselFilterTrigger()).toHaveTextContent('All Vessels');
  });

  it('opens the form with no default when no vessel is named', async () => {
    render(tree('/incidents?new=true'));
    const dialog = await screen.findByRole('dialog', { name: 'Report Incident' });
    await waitFor(() => expect(currentLocation).toBe('/incidents'));
    expect(dialog).toHaveAttribute('data-default-vessel', '');
  });

  it('waits for the user’s vessels before preselecting (never decides on an empty list)', async () => {
    h.vessels = [];
    h.vesselsLoading = true;
    const view = render(tree(`/incidents?new=true&vessel=${DRAAK.id}`));
    const dialog = await screen.findByRole('dialog', { name: 'Report Incident' });
    expect(dialog).toHaveAttribute('data-default-vessel', '');
    expect(lastVesselFilter()).toBeUndefined();

    h.vessels = [DRAAK, HYDRA];
    h.vesselsLoading = false;
    view.rerender(tree(`/incidents?new=true&vessel=${DRAAK.id}`));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Report Incident' })).toHaveAttribute('data-default-vessel', DRAAK.id));
    expect(lastVesselFilter()).toBe(DRAAK.id);
  });
});

describe('/incidents', () => {
  it('without new=true the form stays closed and the list is not filtered', async () => {
    render(tree('/incidents'));
    expect(await screen.findByRole('heading', { name: 'Incidents & Near Misses' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentLocation).toBe('/incidents');
    expect(lastVesselFilter()).toBeUndefined();
  });

  it('a vessel alone filters the list but opens no form', async () => {
    render(tree(`/incidents?vessel=${HYDRA.id}`));
    await waitFor(() => expect(lastVesselFilter()).toBe(HYDRA.id));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(currentLocation).toBe(`/incidents?vessel=${HYDRA.id}`);
  });
});
