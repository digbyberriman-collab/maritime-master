/**
 * Sign-in and reset-password screens (BUILD-PLAN S6, gap/10 DS22): autocomplete
 * and input modes, inline error semantics (aria-invalid + aria-describedby),
 * toasts through notify, 44 px controls on coarse pointers (D-35), the return
 * path after sign-in, and the reset-link states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { readRepoFile } from '../design/cssTokens';

const h = vi.hoisted(() => ({
  auth: {
    user: null as null | { id: string },
    signIn: vi.fn(),
    signUp: vi.fn(),
    resetPassword: vi.fn(),
    signOut: vi.fn(),
    accountCheck: 'idle' as 'idle' | 'checking' | 'allowed' | 'disabled' | 'error',
    retryAccountCheck: vi.fn(),
    accessNotice: null as null | 'disabled',
    clearAccessNotice: vi.fn(),
  },
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() },
  supabaseAuth: {
    getSession: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    onAuthStateChange: vi.fn(),
  },
  oauth: vi.fn(),
  authListener: null as null | ((event: string, session: Session | null) => void),
}));

vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('@/shared/lib/notify', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/lib/notify')>()),
  notify: h.notify,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: h.supabaseAuth } }));
vi.mock('@/integrations/lovable', () => ({ lovable: { auth: { signInWithOAuth: h.oauth } } }));

import Auth from '@/modules/auth/pages/Auth';
import ResetPassword, { RESET_LINK_TIMEOUT_MS } from '@/modules/auth/pages/ResetPassword';
import { afterSignInPath, initialAuthMode } from '@/modules/auth/pages/authRedirect';
import { passwordStrength } from '@/modules/auth/components/brand/passwordStrength';
import { describedBy } from '@/modules/auth/components/brand/describedBy';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</p>;
}

function tree(entry: string | { pathname: string; state?: unknown }, element: React.ReactElement, path = '/auth') {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={element} />
        {path === '/auth' ? null : <Route path="/auth" element={<Auth />} />}
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderAt(entry: string | { pathname: string; state?: unknown }, element: React.ReactElement, path = '/auth') {
  return render(tree(entry, element, path));
}

const session = (email = 'fleet.manager@demo-fleet.example') => ({ user: { id: 'u1', email } }) as unknown as Session;

const errorTextFor = (input: HTMLElement) => {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
};

beforeEach(() => {
  h.auth.user = null;
  h.auth.accountCheck = 'idle';
  h.auth.accessNotice = null;
  h.auth.retryAccountCheck.mockReset();
  h.auth.clearAccessNotice.mockReset();
  h.auth.signOut.mockReset().mockResolvedValue(undefined);
  h.auth.signIn.mockReset().mockResolvedValue({ error: null });
  h.auth.signUp.mockReset().mockResolvedValue({ error: null });
  h.auth.resetPassword.mockReset().mockResolvedValue({ error: null });
  Object.values(h.notify).forEach((fn) => fn.mockReset());
  h.supabaseAuth.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
  h.supabaseAuth.getUser.mockReset().mockResolvedValue({ data: { user: null }, error: null });
  h.supabaseAuth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  h.authListener = null;
  h.supabaseAuth.onAuthStateChange.mockReset().mockImplementation((cb: (event: string, s: Session | null) => void) => {
    h.authListener = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  h.oauth.mockReset();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sign-in screen', () => {
  it('has one h1, the STORM wordmark and a labelled form', () => {
    renderAt('/auth', <Auth />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
    expect(screen.getByText('STORM')).toBeInTheDocument();
    expect(screen.getByText('Maritime Master')).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('uses email and current-password autocomplete with the email keyboard', () => {
    renderAt('/auth', <Auth />);
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('inputmode', 'email');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toHaveAttribute('autocapitalize', 'none');
    expect(email).toHaveAttribute('spellcheck', 'false');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('marks empty fields invalid, links the messages, focuses the first one and sends nothing', async () => {
    renderAt('/auth', <Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(errorTextFor(email)).toContain('Enter your email address');
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(errorTextFor(password)).toContain('Enter your password');
    expect(email).toHaveFocus();
    expect(h.auth.signIn).not.toHaveBeenCalled();
    expect(h.notify.error).not.toHaveBeenCalled();

    fireEvent.change(email, { target: { value: 'not-an-email' } });
    expect(email).not.toHaveAttribute('aria-invalid');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(errorTextFor(screen.getByLabelText('Email'))).toContain('Enter a valid email address');
  });

  it('shows a sign-in failure inline (role=alert) and as a toast through notify', async () => {
    h.auth.signIn.mockResolvedValue({ error: new Error('Invalid login credentials') });
    renderAt('/auth', <Auth />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'master@demo-fleet.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That email and password do not match an account');
    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('aria-describedby', alert.id);
    expect(h.auth.signIn).toHaveBeenCalledWith('master@demo-fleet.example', 'wrong-password');
    expect(h.notify.error).toHaveBeenCalledWith(expect.stringContaining('do not match'), expect.objectContaining({ title: 'Sign-in failed' }));
  });

  it('normalises transport errors into the network sentence', async () => {
    h.auth.signIn.mockResolvedValue({ error: new Error('Failed to fetch') });
    renderAt('/auth', <Auth />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'master@demo-fleet.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server");
  });

  it('returns to the page the user asked for once the account check lets the user in', async () => {
    const entry = { pathname: '/auth', state: { from: { pathname: '/v/dra/crew/list', search: '?tab=active', hash: '#top' } } };
    const view = renderAt(entry, <Auth />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'master@demo-fleet.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(h.auth.signIn).toHaveBeenCalled());
    // Signed in, account check running: the app does not open yet.
    h.auth.accountCheck = 'checking';
    view.rerender(tree(entry, <Auth />));
    expect(await screen.findByRole('button', { name: /Checking your account/ })).toBeDisabled();
    expect(screen.queryByTestId('where')).not.toBeInTheDocument();
    // Admitted: the context's user appears and the screen moves on.
    h.auth.accountCheck = 'allowed';
    h.auth.user = { id: 'u1' };
    view.rerender(tree(entry, <Auth />));
    expect(await screen.findByTestId('where')).toHaveTextContent('/v/dra/crew/list?tab=active#top');
    expect(h.notify.error).not.toHaveBeenCalled();
  });

  it('sends a signed-in visitor straight on', async () => {
    h.auth.user = { id: 'u1' };
    renderAt('/auth', <Auth />);
    expect(await screen.findByTestId('where')).toHaveTextContent('/dashboard');
  });

  it('toggles password visibility with a pressed-state button', () => {
    renderAt('/auth', <Auth />);
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });

  it('requests a reset link and confirms without saying whether the account exists', async () => {
    renderAt('/auth', <Auth />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reset your password');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByLabelText('Email')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' bosun@demo-fleet.example ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    await waitFor(() => expect(h.auth.resetPassword).toHaveBeenCalledWith('bosun@demo-fleet.example'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Check your inbox');
    expect(screen.getByRole('status')).toHaveTextContent('If an account exists for bosun@demo-fleet.example');
    expect(h.notify.success).toHaveBeenCalledWith('Reset link sent', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sign in');
    expect(screen.getByLabelText('Email')).toHaveFocus();
  });

  it('opens the reset request when another screen asks for it', () => {
    renderAt({ pathname: '/auth', state: { mode: 'forgot-password' } }, <Auth />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reset your password');
  });

  it('register mode uses given-name, family-name, organization and new-password', () => {
    renderAt('/auth', <Auth initialMode="register" />);
    expect(screen.getByLabelText('First name')).toHaveAttribute('autocomplete', 'given-name');
    expect(screen.getByLabelText('Last name')).toHaveAttribute('autocomplete', 'family-name');
    expect(screen.getByLabelText('Company')).toHaveAttribute('autocomplete', 'organization');
    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(password, { target: { value: 'Abcdefgh1!xy' } });
    expect(password.getAttribute('aria-describedby')).toContain('auth-password-strength');
    expect(screen.getByText('Strong')).toBeInTheDocument();
  });

  it('keeps 44 px targets on coarse pointers: control-height primitives and coarse min-heights', () => {
    renderAt('/auth', <Auth />);
    for (const field of [screen.getByLabelText('Email'), screen.getByLabelText('Password')]) {
      expect(field.className).toContain('h-[var(--control-h)]');
    }
    expect(screen.getByRole('button', { name: 'Sign in' }).className).toContain('h-[var(--control-h)]');
    expect(screen.getByRole('button', { name: /Continue with Google/ }).className).toContain('h-[var(--control-h)]');
    expect(screen.getByRole('button', { name: 'Show password' }).className).toContain('w-[var(--control-h)]');
    expect(screen.getByRole('button', { name: 'Forgot password?' }).className).toContain('[@media(pointer:coarse)]:min-h-11');

    // --control-h is 44 px on coarse pointers in every density (D-35).
    const css = readRepoFile('src/index.css');
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*:root,\s*\[data-density\] \{\s*--control-h: 44px;/);
  });

  it('draws the Google mark from an SVG asset, not hex literals in TSX', () => {
    renderAt('/auth', <Auth />);
    const button = screen.getByRole('button', { name: /Continue with Google/ });
    const img = within(button).getByRole('presentation', { hidden: true });
    expect(img.getAttribute('src')).toMatch(/google-g\.svg/);
    const source = readRepoFile('src/modules/auth/pages/Auth.tsx');
    expect(source).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(readRepoFile('src/modules/auth/components/brand/google-g.svg')).toContain('#4285F4');
  });

  it('reports a Google sign-in error through notify and inline', async () => {
    h.oauth.mockResolvedValue({ error: new Error('popup_closed') });
    renderAt('/auth', <Auth />);
    fireEvent.click(screen.getByRole('button', { name: /Continue with Google/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('popup_closed');
    expect(h.notify.error).toHaveBeenCalledWith('popup_closed', expect.objectContaining({ title: 'Google sign-in failed' }));
  });
});

describe('reset password screen', () => {
  it('waits for the recovery session, then offers the form with new-password autocomplete', async () => {
    h.supabaseAuth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checking your reset link');

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Set a new password');
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('autocomplete', 'new-password');
    // Password managers file the new password under the account.
    const username = document.querySelector('input[autocomplete="username"]');
    expect(username).toHaveValue('fleet.manager@demo-fleet.example');
  });

  it('accepts a PASSWORD_RECOVERY event', async () => {
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    await waitFor(() => expect(h.authListener).not.toBeNull());
    act(() => h.authListener?.('PASSWORD_RECOVERY', session()));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Set a new password');
  });

  it('validates length and match inline and focuses the field at fault', async () => {
    h.supabaseAuth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    const password = await screen.findByLabelText('New password');
    fireEvent.change(password, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(password).toHaveAttribute('aria-invalid', 'true');
    expect(errorTextFor(password)).toContain('Use at least 8 characters');
    expect(password).toHaveFocus();

    fireEvent.change(password, { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    const confirm = screen.getByLabelText('Confirm new password');
    expect(confirm).toHaveAttribute('aria-invalid', 'true');
    expect(errorTextFor(confirm)).toContain('The two passwords do not match');
    expect(confirm).toHaveFocus();
    expect(h.supabaseAuth.updateUser).not.toHaveBeenCalled();
  });

  it('shows an update failure inline and through notify, and success afterwards', async () => {
    h.supabaseAuth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    h.supabaseAuth.updateUser.mockResolvedValueOnce({ data: {}, error: { name: 'AuthApiError', message: 'New password should be different from the old password.', status: 422 } });
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    fireEvent.change(await screen.findByLabelText('New password'), { target: { value: 'long-enough-1' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'long-enough-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('New password should be different');
    expect(h.notify.error).toHaveBeenCalledWith(expect.stringContaining('different'), expect.objectContaining({ title: 'Could not change the password' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Password changed');
    expect(h.supabaseAuth.updateUser).toHaveBeenLastCalledWith({ password: 'long-enough-1' });
    expect(h.notify.success).toHaveBeenCalledWith('Password changed');
  });

  it('calls a link with no session unusable after the timeout and offers a new one', async () => {
    vi.useFakeTimers();
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checking your reset link');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESET_LINK_TIMEOUT_MS + 10);
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This link can't be used");
    vi.useRealTimers();

    fireEvent.click(screen.getByRole('button', { name: 'Request a new link' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Reset your password');
  });

  it('says why at once when the link carries an error', () => {
    window.history.replaceState(null, '', '/reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This link can't be used");
    // STORM's own sentence for the code; the URL's description is never shown.
    expect(screen.getByText(/This reset link has expired or was already used\./)).toBeInTheDocument();
    expect(screen.queryByText(/Email link is invalid or has expired/)).toBeNull();
    expect(document.body).not.toHaveTextContent('Email link is invalid');
    expect(h.supabaseAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it.each([
    ['query', '/reset-password?error=server_error&error_code=made_up_code&error_description='],
    ['hash', '/reset-password#error=made_up_code&error_description='],
    ['description only', '/reset-password?error_description='],
  ])('never renders a crafted error_description (%s): only the generic sentence', (_label, prefix) => {
    const crafted = 'Your STORM account is suspended. Call the security desk on +00 0000 000 000';
    window.history.replaceState(null, '', `${prefix}${encodeURIComponent(crafted)}`);
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent("This link can't be used");
    expect(screen.getByText(/This reset link cannot be used\./)).toBeInTheDocument();
    expect(screen.queryByText(crafted, { exact: false })).toBeNull();
    expect(document.body).not.toHaveTextContent('suspended');
    expect(h.supabaseAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it.each([
    ['flow_state_expired', 'This reset link has expired.'],
    ['flow_state_not_found', 'This reset link is no longer valid.'],
    ['access_denied', 'This reset link cannot be used.'],
    ['constructor', 'This reset link cannot be used.'],
  ])('maps the %s code to STORM copy', (code, sentence) => {
    window.history.replaceState(null, '', `/reset-password?error_code=${code}`);
    renderAt('/reset-password', <ResetPassword />, '/reset-password');
    expect(screen.getByText(sentence, { exact: false })).toBeInTheDocument();
  });
});

describe('sign-in screen: account check states (spec §B.3)', () => {
  it('a disabled account shows the notice instead of the form, and "Sign in with another account" clears it', async () => {
    h.auth.accessNotice = 'disabled';
    const view = renderAt('/auth', <Auth />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Access disabled');
    expect(screen.getByRole('alert')).toHaveTextContent('Your access has been disabled by your account administrator.');
    expect(screen.queryByRole('form', { name: 'Sign in' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with another account' }));
    expect(h.auth.clearAccessNotice).toHaveBeenCalled();
    h.auth.accessNotice = null;
    view.rerender(tree('/auth', <Auth />));
    expect(await screen.findByRole('form', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('a banned sign-in raises the notice in the context and shows no failure toast', async () => {
    h.auth.signIn.mockResolvedValue({ error: new Error('User is banned'), accountDisabled: true });
    renderAt('/auth', <Auth />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'deckhand@demo-fleet.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(h.auth.signIn).toHaveBeenCalled());
    expect(h.notify.error).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an OAuth return with error_code=user_banned shows the notice (the URL description is never shown)', () => {
    window.history.replaceState(null, '', '/auth#error=access_denied&error_code=user_banned&error_description=Call+this+number');
    renderAt('/auth', <Auth />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Access disabled');
    expect(document.body).not.toHaveTextContent('Call this number');
  });

  it('a failed check keeps the app closed: the error sentence with Retry and Sign out', async () => {
    h.auth.accountCheck = 'error';
    renderAt('/auth', <Auth />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Account check failed');
    expect(screen.getByRole('alert')).toHaveTextContent('We could not check your account. Try again.');
    expect(screen.queryByTestId('where')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.auth.retryAccountCheck).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(h.auth.signOut).toHaveBeenCalledTimes(1));
  });

  it('while the check runs the form is busy and does not move on', () => {
    h.auth.accountCheck = 'checking';
    renderAt({ pathname: '/auth', state: { from: { pathname: '/fleet/dashboard' } } }, <Auth />);
    expect(screen.getByRole('button', { name: /Checking your account/ })).toBeDisabled();
    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByTestId('where')).toBeNull();
  });
});

describe('reset password screen: invitation links (flow=invite)', () => {
  it('uses the invite copy: "Set your password to finish joining STORM"', async () => {
    h.supabaseAuth.getSession.mockResolvedValue({ data: { session: session('deckhand@demo-fleet.example') }, error: null });
    renderAt('/reset-password?flow=invite', <ResetPassword />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Checking your invitation link');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Set your password to finish joining STORM');
    expect(screen.getByRole('form', { name: 'Set your password to finish joining STORM' })).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByRole('button', { name: 'Save password and join' })).toBeInTheDocument();
  });

  it('saves the first password and says the person is in', async () => {
    h.supabaseAuth.getSession.mockResolvedValue({ data: { session: session() }, error: null });
    renderAt('/reset-password?flow=invite', <ResetPassword />, '/reset-password');
    await screen.findByRole('button', { name: 'Save password and join' });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-long-password-1' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'a-long-password-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password and join' }));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent("You're in");
    expect(h.notify.success).toHaveBeenCalledWith('Password saved');
  });

  it('an expired invitation link says so and points to the administrator, not a self-service reset', () => {
    window.history.replaceState(null, '', '/reset-password?flow=invite#error=access_denied&error_code=otp_expired');
    renderAt('/reset-password?flow=invite', <ResetPassword />, '/reset-password');
    expect(screen.getByText(/This invitation link has expired or was already used\./)).toBeInTheDocument();
    expect(screen.getByText(/send a new invitation/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request a new link' })).toBeNull();
    expect(screen.getByRole('button', { name: /Back to sign in/ })).toBeInTheDocument();
  });

  it('without flow=invite the reset copy stays', () => {
    window.history.replaceState(null, '', '/reset-password?flow=recovery#error_code=otp_expired');
    renderAt('/reset-password?flow=recovery', <ResetPassword />, '/reset-password');
    expect(screen.getByText(/This reset link has expired or was already used\./)).toBeInTheDocument();
  });
});

describe('auth layout', () => {
  it('stacks the watermark and hero behind the card inside an isolated root', () => {
    const { container } = renderAt('/auth', <Auth />);
    const root = container.querySelector('[data-auth-screen]');
    expect(root?.className).toMatch(/\bisolate\b/);
    expect(root?.className).toContain('bg-background');
    const layer = root?.querySelector('[data-auth-watermark-layer]');
    expect(layer?.className).toContain('-z-10');
    expect(layer?.querySelector('[data-watermark="inkfish"]')).not.toBeNull();
    const backdrop = root?.querySelector('[data-auth-backdrop]');
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    expect(backdrop?.innerHTML).toContain('bg-gradient-primary');
    // No Inkfish mark in the hero: the wordmark is STORM's own.
    expect(root?.querySelector('[data-storm-wordmark] img')).toBeNull();
  });
});

describe('helpers', () => {
  it('afterSignInPath keeps in-app paths and refuses everything else', () => {
    expect(afterSignInPath(null)).toBe('/dashboard');
    expect(afterSignInPath({ from: { pathname: '/fleet/documents', search: '?q=1', hash: '#a' } })).toBe('/fleet/documents?q=1#a');
    expect(afterSignInPath({ from: { pathname: '//evil.example/x' } })).toBe('/dashboard');
    expect(afterSignInPath({ from: { pathname: 'https://evil.example' } })).toBe('/dashboard');
    expect(afterSignInPath({ from: { pathname: '/auth' } })).toBe('/dashboard');
    expect(afterSignInPath({ from: { pathname: '/reset-password' } })).toBe('/dashboard');
    expect(afterSignInPath({ from: { pathname: '/me/profile', search: 'bad', hash: 3 } })).toBe('/me/profile');
  });

  it('initialAuthMode only honours the reset request', () => {
    expect(initialAuthMode({ mode: 'forgot-password' })).toBe('forgot-password');
    expect(initialAuthMode({ mode: 'register' })).toBe('login');
    expect(initialAuthMode(undefined, 'register')).toBe('register');
  });

  it('passwordStrength scores length, case, digits and symbols', () => {
    expect(passwordStrength('abc')).toMatchObject({ level: 'weak', score: 0 });
    expect(passwordStrength('abcdefgh1A')).toMatchObject({ level: 'medium', score: 3 });
    expect(passwordStrength('Abcdefgh1!xy')).toMatchObject({ level: 'strong', score: 5 });
  });

  it('describedBy drops empty ids', () => {
    expect(describedBy(undefined, false, '')).toBeUndefined();
    expect(describedBy('a', undefined, 'b')).toBe('a b');
  });
});
