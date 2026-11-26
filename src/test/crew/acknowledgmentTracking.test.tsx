/**
 * Acknowledgment tracking is honest (gap/02 FD7, X1-01 hygiene): the
 * reminder and export buttons sent and exported nothing ("Send Reminder"
 * only closed the dialog, and the dialog previewed an email that was never
 * sent, D-249). They are off, with a visible reason, until a real sender
 * exists; the outstanding list still opens.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('@/shared/components/layout/DashboardLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/modules/auth/hooks/useAcknowledgments', () => ({
  useAcknowledgmentStats: () => ({
    isLoading: false,
    data: [
      {
        documentId: 'd1', documentTitle: 'Garbage management plan', documentNumber: 'SMS-ENV-004', category: 'Environment',
        totalCrew: 3, acknowledged: 1, pending: 2, percentComplete: 33, lastReminderSent: null,
      },
    ],
  }),
  useCompanyCrew: () => ({
    data: [
      { user_id: 'u1', first_name: 'Deck', last_name: 'Rating', email: 'deck.rating@example.test' },
      { user_id: 'u2', first_name: 'Chief', last_name: 'Stew', email: 'chief.stew@example.test' },
      { user_id: 'u3', first_name: 'Bosun', last_name: 'Crew', email: 'bosun@example.test' },
    ],
  }),
  useDocumentAcknowledgments: (id: string | null) => ({ data: id ? [{ user_id: 'u3' }] : [] }),
}));
vi.mock('@/modules/vessels/hooks/useVessels', () => ({ useVessels: () => ({ vessels: [] }) }));
vi.mock('@/modules/documents/hooks/useDocuments', () => ({ useDocumentCategories: () => ({ data: [] }) }));

import AcknowledgmentTracking from '@/modules/crew/pages/AcknowledgmentTracking';

describe('AcknowledgmentTracking (FD7: no fake send)', () => {
  it('turns the bulk reminder and the export off and says why', () => {
    render(<AcknowledgmentTracking />);
    const reason = screen.getByText('Reminders and the export are not available yet.');
    for (const name of [/Send Bulk Reminder/, /Export Report/]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAttribute('aria-describedby', reason.id);
    }
  });

  it('still lists who is outstanding, with Send off and its reason, and no email preview', () => {
    render(<AcknowledgmentTracking />);
    fireEvent.click(screen.getByRole('button', { name: 'Show who has not acknowledged' }));
    const dialog = screen.getByRole('dialog', { name: 'Not acknowledged yet' });
    expect(within(dialog).getByText(/Deck Rating/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Chief Stew/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Bosun Crew/)).toBeNull();
    const send = within(dialog).getByRole('button', { name: /Send Reminder/ });
    expect(send).toBeDisabled();
    expect(within(dialog).getByText(/Sending reminders is not available yet, so nothing is sent from here/)).toHaveAttribute('id', send.getAttribute('aria-describedby'));
    expect(within(dialog).queryByText(/Email Preview/)).toBeNull();
    expect(within(dialog).queryByRole('checkbox')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
