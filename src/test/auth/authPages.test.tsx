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

function renderAt(entry: string | { pathname: string; state?: unknown }, element: React.ReactElement, path = '/auth') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path={path} element={element} />
        {path === '/auth' ? null : <Route path="/auth" element={<Auth />} />}
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

const session = (email = 'fleet.manager@demo-fleet.example') => ({ user: { id: 'u1', email } }) as unknown as Session;

const errorTextFor = (input: HTMLElement) => {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
};

beforeEach(() => {
  h.auth.user = null;
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

  it('returns to the page the user asked for after signing in', async () => {
    renderAt({ pathname: '/auth', state: { from: { pathname: '/v/dra/crew/list', search: '?tab=active', hash: '#top' } } }, <Auth />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'master@demo-fleet.example' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
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
    expect(screen.getByText(/Email link is invalid or has expired/)).toBeInTheDocument();
    expect(h.supabaseAuth.onAuthStateChange).not.toHaveBeenCalled();
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
