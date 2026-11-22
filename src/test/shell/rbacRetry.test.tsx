/**
 * Deferred item 3 (D-56): when the role load fails the shell says so and
 * offers Retry. The strip appears with the store's `error`, stays while any
 * retry (automatic at 1 s / 4 s, or the button) is loading, with the button
 * waiting, and goes only once a load succeeds, so it never flickers. It never
 * blocks the page. `/` and the legacy redirects wait in FullPageLoading,
 * without a shell, so the same notice shows there.
 *
 * The real permissions store (its state set directly) and the real notice.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', async () => (await import('./fakeSupabase')).fakeSupabaseModule);

import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import ShellNotices from '@/shared/components/layout/topbar/ShellNotices';
import { RBAC_RETRY_MESSAGE } from '@/shared/components/layout/topbar/RbacRetryNotice';
import { FullPageLoading, ScopeLoading } from '@/app/router/ScopeStates';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';

const loadPermissions = vi.fn(async () => undefined);

function setStore(patch: { error?: string | null; isLoading?: boolean }) {
  act(() => {
    usePermissionsStore.setState(patch);
  });
}

const strip = () => screen.queryByText(RBAC_RETRY_MESSAGE);
const retryButton = () => screen.getByTestId(SHELL_TEST_IDS.rbacRetry);

beforeEach(() => {
  loadPermissions.mockClear();
  usePermissionsStore.setState({ error: null, isLoading: false, isInitialized: true, loadPermissions });
});

describe('the RBAC Retry strip in the shell', () => {
  it('is absent while roles load normally or have loaded', () => {
    usePermissionsStore.setState({ error: null, isLoading: true });
    render(<ShellNotices />);
    expect(screen.getByTestId(SHELL_TEST_IDS.shellNotices)).toBeEmptyDOMElement();
    setStore({ isLoading: false });
    expect(screen.getByTestId(SHELL_TEST_IDS.shellNotices)).toBeEmptyDOMElement();
  });

  it('appears on an error, as a polite status with a Retry that reloads the roles once', () => {
    usePermissionsStore.setState({ error: 'Failed to load permissions' });
    render(<ShellNotices />);
    const text = screen.getByText(RBAC_RETRY_MESSAGE);
    const region = text.closest('[role="status"]') as HTMLElement;
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toHaveClass('bg-warning-muted', 'text-warning');
    expect(retryButton()).toBeEnabled();
    fireEvent.click(retryButton());
    expect(loadPermissions).toHaveBeenCalledTimes(1);
  });

  it('stays, with the button waiting, while the retry loads (no flicker), and goes once a load succeeds', () => {
    usePermissionsStore.setState({ error: 'Failed to load permissions' });
    render(<ShellNotices />);
    fireEvent.click(retryButton());
    // loadPermissions clears the error and sets isLoading while it runs.
    setStore({ error: null, isLoading: true });
    expect(screen.getByText(RBAC_RETRY_MESSAGE)).toBeInTheDocument();
    expect(retryButton()).toBeDisabled();
    expect(retryButton()).toHaveTextContent('Retrying…');
    expect(retryButton().querySelector('svg')).toHaveClass('motion-safe:animate-spin');

    // The retry fails again: still there, Retry available again.
    setStore({ error: 'Failed again', isLoading: false });
    expect(screen.getByText(RBAC_RETRY_MESSAGE)).toBeInTheDocument();
    expect(retryButton()).toBeEnabled();

    // An automatic retry, then success.
    setStore({ error: null, isLoading: true });
    expect(screen.getByText(RBAC_RETRY_MESSAGE)).toBeInTheDocument();
    setStore({ error: null, isLoading: false });
    expect(strip()).toBeNull();
    expect(screen.queryByTestId(SHELL_TEST_IDS.rbacRetry)).toBeNull();
  });

  it('never blocks the page around it', () => {
    usePermissionsStore.setState({ error: 'Failed to load permissions' });
    render(
      <>
        <ShellNotices />
        <button type="button">Page action</button>
      </>,
    );
    const action = screen.getByRole('button', { name: 'Page action' });
    action.focus();
    expect(action).toHaveFocus();
    expect(document.querySelector('[aria-modal="true"]')).toBeNull();
  });
});

describe('the waiting screens', () => {
  it('FullPageLoading shows the same Retry when the role load failed', () => {
    usePermissionsStore.setState({ error: 'Could not read the signed-in session' });
    const { container } = render(<FullPageLoading />);
    expect(screen.getByText(RBAC_RETRY_MESSAGE)).toBeInTheDocument();
    fireEvent.click(retryButton());
    expect(loadPermissions).toHaveBeenCalledTimes(1);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-route-loading');
    expect(root).toHaveAttribute('aria-busy', 'true');
  });

  it('FullPageLoading is a plain spinner otherwise', () => {
    render(<FullPageLoading />);
    expect(screen.queryByText(RBAC_RETRY_MESSAGE)).toBeNull();
    expect(screen.getByText('Loading…')).toHaveClass('sr-only');
  });

  it('ScopeLoading carries the route-loading markers', () => {
    const { container } = render(<ScopeLoading label="Opening DRAAK…" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-route-loading');
    expect(root).toHaveAttribute('aria-busy', 'true');
  });
});
