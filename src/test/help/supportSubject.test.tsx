/**
 * Support takes its starting subject from `?subject=` (gap/10 W3: a planned
 * page's "Tell us what you need" link names what was asked for). The value
 * is trimmed and capped at 120 characters, and only seeds the field: the
 * user can still change it.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => {
  const chain = {
    select: () => chain,
    order: () => chain,
    limit: async () => ({ data: [], error: null }),
  };
  return { supabase: { from: () => chain } };
});
vi.mock('@/modules/auth/contexts/AuthContext', () => ({
  useAuth: () => ({ profile: { id: 'p-1', user_id: 'u-1', company_id: 'co-1', role: 'crew' } }),
}));
vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SupportPage, { SEEDED_SUBJECT_MAX } from '@/modules/help/pages/SupportPage';

/** What a planned page's "Tell us what you need" links to (PlaceholderPage). */
const placeholderSupportHref = (title: string) => `/help/support?subject=${encodeURIComponent(`Request: ${title}`)}`;

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <SupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const subjectField = () => screen.getByLabelText('Subject') as HTMLInputElement;

describe('Support subject from the link', () => {
  it('seeds the subject from a planned page’s link', () => {
    renderAt(placeholderSupportHref('Vessel Details'));
    expect(subjectField().value).toBe('Request: Vessel Details');
  });

  it('starts empty without a subject', () => {
    renderAt('/help/support');
    expect(subjectField().value).toBe('');
  });

  it('trims and caps a long subject at 120 characters', () => {
    const long = `   ${'x'.repeat(300)}   `;
    renderAt(`/help/support?subject=${encodeURIComponent(long)}`);
    expect(subjectField().value).toBe('x'.repeat(SEEDED_SUBJECT_MAX));
    expect(SEEDED_SUBJECT_MAX).toBe(120);
  });

  it('only seeds the field: the user can change it', () => {
    renderAt('/help/support?subject=Request%3A%20Fleet%20groups');
    fireEvent.change(subjectField(), { target: { value: 'Something else' } });
    expect(subjectField().value).toBe('Something else');
  });

  it('a whitespace-only subject seeds nothing, and a cap that lands on a space is trimmed', () => {
    const first = renderAt('/help/support?subject=%20%20%20');
    expect(subjectField().value).toBe('');
    first.unmount();
    renderAt(`/help/support?subject=${encodeURIComponent(`${'a'.repeat(119)} b`)}`);
    expect(subjectField().value).toBe('a'.repeat(119));
  });
});
