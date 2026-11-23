/**
 * The report form preselects the vessel it was opened for
 * (`defaultVesselId`, from `/incidents?new=true&vessel=<id>`), only when that
 * vessel is in its list (D-04: an unknown id leaves the field empty), and a
 * cancelled or submitted form starts again from the same default.
 */
import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  vessels: [] as { id: string; name: string }[],
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({
  useVessels: () => ({ vessels: h.vessels, isLoading: false }),
}));
vi.mock('@/modules/crew/hooks/useCrew', () => ({ useCrew: () => ({ crew: [] }) }));
vi.mock('@/modules/incidents/hooks/useIncidents', () => ({
  useCreateIncident: () => ({ mutateAsync: vi.fn(async () => undefined), isPending: false }),
  useUploadIncidentAttachment: () => ({ mutateAsync: vi.fn(async () => 'url') }),
}));

import { ReportIncidentModal } from '@/modules/incidents/components/ReportIncidentModal';

const DRAAK = { id: 'v-dra', name: 'DRAAK' };
const HYDRA = { id: 'v-hyd', name: 'HYDRA' };

/** The first select of step 1 is the vessel. */
const vesselSelect = () => screen.getAllByRole('combobox')[0];

const Harness: React.FC<{ defaultVesselId?: string }> = ({ defaultVesselId }) => {
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <ReportIncidentModal open={open} onOpenChange={setOpen} defaultVesselId={defaultVesselId} />
    </>
  );
};

beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  h.vessels = [DRAAK, HYDRA];
});

describe('ReportIncidentModal defaultVesselId', () => {
  it('preselects a vessel that is in the list', async () => {
    render(<Harness defaultVesselId={DRAAK.id} />);
    await screen.findByRole('dialog', { name: /Report Incident/ });
    await waitFor(() => expect(vesselSelect()).toHaveTextContent('DRAAK'));
  });

  it('leaves the field empty for a vessel that is not in the list', async () => {
    render(<Harness defaultVesselId="v-unknown" />);
    await screen.findByRole('dialog', { name: /Report Incident/ });
    expect(vesselSelect()).toHaveTextContent('Select vessel');
  });

  it('leaves the field empty with no default', async () => {
    render(<Harness />);
    await screen.findByRole('dialog', { name: /Report Incident/ });
    expect(vesselSelect()).toHaveTextContent('Select vessel');
  });

  it('starts again from the default after Cancel', async () => {
    render(<Harness defaultVesselId={DRAAK.id} />);
    await screen.findByRole('dialog', { name: /Report Incident/ });
    await waitFor(() => expect(vesselSelect()).toHaveTextContent('DRAAK'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    await screen.findByRole('dialog', { name: /Report Incident/ });
    expect(vesselSelect()).toHaveTextContent('DRAAK');
  });
});
