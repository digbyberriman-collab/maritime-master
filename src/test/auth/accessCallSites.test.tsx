/**
 * The crew-side call sites of the access edge functions (Phase 2 spec
 * §C.3): the reset and access dialogs, the onboarding invite and the crew
 * roster invite all report the outcome the server gave.
 *
 * - "sent" / "turned off" only after the answer says so;
 * - a failed email says "could not be sent" with Try again / Retry;
 * - `partial_failure` names the part that failed;
 * - ending sessions is offered as not available yet (the function answers
 *   501 `not_supported`);
 * - a reason is required to turn access off;
 * - no client `redirectTo` is sent anywhere.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readRepoFile } from '../design/cssTokens';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  notify: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}));

vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'update']) chain[op] = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'pin' }], error: null }).then(resolve);
  return { supabase: { from: () => chain, rpc: () => Promise.resolve({ data: null, error: null }), functions: { invoke: (...args: unknown[]) => h.invoke(...args) } } };
});
vi.mock('@/shared/lib/notify', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/shared/lib/notify')>()), notify: h.notify }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => ({ profile: { id: 'p-admin', company_id: 'c-1', role: 'dpa' }, user: { id: 'u-admin', email: 'fleet.manager@demo-fleet.example' } }) }));
vi.mock('@/shared/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));

import ResetAccountModal from '@/modules/crew/components/ResetAccountModal';
import ToggleAccessModal from '@/modules/crew/components/ToggleAccessModal';
import { useOnboardingMutations } from '@/modules/hris/hooks/useOnboarding';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

const member = (patch: Partial<CrewMember> = {}) =>
  ({ id: 'p-14', user_id: 'u-14', first_name: 'Demo', last_name: 'Bosun', email: 'bosun.14@demo-fleet.example', account_status: 'active', ...patch }) as CrewMember;

const ok = (data: unknown) => h.invoke.mockResolvedValueOnce({ data, error: null });
const httpError = (status: number, body: unknown) =>
  h.invoke.mockResolvedValueOnce({ data: null, error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) } });

function wrap(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.invoke.mockReset();
  Object.values(h.notify).forEach((fn) => fn.mockReset());
});

describe('ResetAccountModal', () => {
  it('a sent reset closes the dialog with a success toast', async () => {
    ok({ ok: true, reset: { status: 'sent' } });
    const onOpenChange = vi.fn();
    render(wrap(<ResetAccountModal open onOpenChange={onOpenChange} crewMember={member()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'reset_account', resetType: 'password_reset', targetUserId: 'u-14' } });
    expect(h.notify.success).toHaveBeenCalledWith('Password reset email sent', { description: 'STORM emailed a reset link to bosun.14@demo-fleet.example.' });
  });

  it('a failed reset email stays open, says it could not be sent, and offers Try again', async () => {
    httpError(502, { error: { code: 'send_failed', message: 'The reset email could not be sent.', details: { email_error: 'provider_unavailable' } } });
    const onOpenChange = vi.fn();
    render(wrap(<ResetAccountModal open onOpenChange={onOpenChange} crewMember={member()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));
    expect(await screen.findByText('The reset email could not be sent')).toBeInTheDocument();
    expect(screen.getByText(/did not answer/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('a resend to someone without a login goes by profile, and a cooldown is said honestly', async () => {
    httpError(429, { error: { code: 'cooldown', message: 'x', details: { retry_after_seconds: 240 } } });
    render(wrap(<ResetAccountModal open onOpenChange={vi.fn()} crewMember={member({ user_id: null, account_status: 'invited' })} />));
    fireEvent.click(screen.getByLabelText(/Resend the invitation/));
    fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));
    expect(await screen.findByText('Could not send the invitation')).toBeInTheDocument();
    expect(screen.getByText(/Try again in about 4 minutes/)).toBeInTheDocument();
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'reset_account', resetType: 'resend_invitation', targetProfileId: 'p-14' } });
  });

  it('ending sessions is shown as not available yet, and cannot be chosen', () => {
    render(wrap(<ResetAccountModal open onOpenChange={vi.fn()} crewMember={member()} />));
    expect(screen.getByText('Ending sessions from STORM is not available yet. Turn off their access to stop new sign-ins.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Sign out everywhere/ })).toBeDisabled();
  });
});

describe('ToggleAccessModal', () => {
  it('turning access off needs a reason: nothing is sent without one', async () => {
    render(wrap(<ToggleAccessModal open onOpenChange={vi.fn()} crewMember={member()} />));
    expect(screen.getByLabelText('Reason (required)')).toBeRequired();
    fireEvent.click(screen.getByRole('button', { name: 'Turn access off' }));
    expect(await screen.findByText('Give a reason for turning access off.')).toBeInTheDocument();
    expect(screen.getByLabelText('Reason (required)')).toHaveAttribute('aria-invalid', 'true');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('both steps done: "Access turned off" and the dialog closes', async () => {
    ok({ ok: true, statusStored: true, banApplied: true, accountStatus: 'disabled' });
    const onOpenChange = vi.fn();
    render(wrap(<ToggleAccessModal open onOpenChange={onOpenChange} crewMember={member()} />));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Signed off for good' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn access off' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(h.invoke).toHaveBeenCalledWith('admin-actions', { body: { action: 'toggle_access', targetUserId: 'u-14', enableAccess: false, reason: 'Signed off for good' } });
    expect(h.notify.success).toHaveBeenCalledWith('Access turned off', { description: 'Demo Bosun can no longer sign in to STORM.' });
  });

  it('a partial failure names the part that failed and never says "turned off"', async () => {
    httpError(502, { error: { code: 'partial_failure', message: 'x', details: { statusStored: true, banApplied: false } } });
    render(wrap(<ToggleAccessModal open onOpenChange={vi.fn()} crewMember={member()} />));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Left' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn access off' }));
    expect(await screen.findByText('Access is off in STORM, but sign-in could not be blocked. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(h.notify.success).not.toHaveBeenCalled();
  });

  it('turning access back on needs no reason', async () => {
    ok({ ok: true, statusStored: true, banApplied: true, accountStatus: 'active' });
    const onOpenChange = vi.fn();
    render(wrap(<ToggleAccessModal open onOpenChange={onOpenChange} crewMember={member({ account_status: 'disabled' })} />));
    fireEvent.click(screen.getByRole('button', { name: 'Turn access on' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(h.notify.success).toHaveBeenCalledWith('Access turned on', expect.anything());
  });

  it('someone without a login cannot be toggled', () => {
    render(wrap(<ToggleAccessModal open onOpenChange={vi.fn()} crewMember={member({ user_id: null })} />));
    expect(screen.getByText(/has not joined STORM yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn access off' })).toBeNull();
  });
});

describe('onboarding invite', () => {
  const hook = () => renderHook(() => useOnboardingMutations(), { wrapper: ({ children }) => wrap(children) });

  it('sends only the profile id; "Invitation sent" only after a 200 status sent', async () => {
    ok({ ok: true, invitation: { status: 'sent', stored: true, id: 'inv-1' } });
    const { result } = hook();
    await act(async () => {
      result.current.sendInvitation.mutate({ profileId: 'p-20', email: 'second.engineer.20@demo-fleet.example' });
    });
    await waitFor(() => expect(h.notify.success).toHaveBeenCalled());
    expect(h.invoke).toHaveBeenCalledWith('send-invitation', { body: { profileId: 'p-20' } });
    expect(h.notify.success.mock.calls[0][0]).toBe('Invitation sent');
  });

  it('a failed email is an error with Retry, not a success', async () => {
    const failed = () => ({ data: null, error: { name: 'FunctionsHttpError', context: new Response(JSON.stringify({ error: { code: 'send_failed', message: 'x', details: { email_error: 'provider_rejected' } }, invitation: { status: 'send_failed', stored: true, id: 'inv-2' } }), { status: 502 }) } });
    h.invoke.mockImplementation(async () => failed());
    const { result } = hook();
    await act(async () => {
      result.current.sendInvitation.mutate({ profileId: 'p-20', email: null });
    });
    await waitFor(() => expect(h.notify.error).toHaveBeenCalled());
    expect(h.notify.success).not.toHaveBeenCalled();
    const options = h.notify.error.mock.calls[0][1] as { title: string; action?: { label: string; onClick: () => void } };
    expect(options.title).toBe('The invitation email could not be sent');
    expect(options.action?.label).toBe('Retry');
    await act(async () => options.action?.onClick());
    await waitFor(() => expect(h.invoke).toHaveBeenCalledTimes(2));
  });
});

describe('no client redirectTo, and every invite goes through the wrapper', () => {
  it.each([
    'src/modules/crew/pages/CrewRoster.tsx',
    'src/modules/hris/hooks/useOnboarding.ts',
    'src/modules/auth/hooks/useAdminActions.ts',
    'src/modules/users-access/hooks/useInvitations.ts',
  ])('%s', (file) => {
    const source = readRepoFile(file);
    expect(source).not.toMatch(/redirectTo\s*:/);
    expect(source).not.toContain('/auth/accept-invitation');
    expect(source).not.toMatch(/functions\.invoke\(\s*['"](send-invitation|bulk-invite|admin-actions)/);
  });

  it('CrewRoster uses the invite wrapper and its notice', () => {
    const source = readRepoFile('src/modules/crew/pages/CrewRoster.tsx');
    expect(source).toContain('sendInvitation(member.id)');
    expect(source).toContain('inviteNotice(outcome, member.email)');
  });
});
