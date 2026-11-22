/**
 * QueryCacheReset (src/app/QueryCacheReset.tsx): one user's cached query
 * results are never shown to the next user (D-25).
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const auth = vi.hoisted(() => ({ value: { user: null as { id: string } | null } }));
vi.mock('@/modules/auth/contexts/AuthContext', () => ({ useAuth: () => auth.value }));

import QueryCacheReset from '@/app/QueryCacheReset';

function setup() {
  const client = new QueryClient();
  client.setQueryData(['vessels'], ['ALPHA']);
  const clear = vi.spyOn(client, 'clear');
  const tree = () => (
    <QueryClientProvider client={client}>
      <QueryCacheReset />
    </QueryClientProvider>
  );
  const view = render(tree());
  const as = (user: { id: string } | null) => {
    auth.value = { user };
    view.rerender(tree());
  };
  return { client, clear, as };
}

describe('QueryCacheReset', () => {
  it('keeps the cache on the first sign-in', () => {
    auth.value = { user: null };
    const { client, clear, as } = setup();
    as({ id: 'uA' });
    expect(clear).not.toHaveBeenCalled();
    expect(client.getQueryData(['vessels'])).toEqual(['ALPHA']);
  });

  it('keeps the cache for a user already signed in when the app mounts', () => {
    auth.value = { user: { id: 'uA' } };
    const { clear, as } = setup();
    as({ id: 'uA' });
    expect(clear).not.toHaveBeenCalled();
  });

  it('clears the cache on sign-out', () => {
    auth.value = { user: { id: 'uA' } };
    const { client, clear, as } = setup();
    as(null);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['vessels'])).toBeUndefined();
  });

  it('clears the cache on a direct switch to another account', () => {
    auth.value = { user: { id: 'uA' } };
    const { client, clear, as } = setup();
    as({ id: 'uB' });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(['vessels'])).toBeUndefined();
  });

  it('does not clear again when the next user signs in after a sign-out', () => {
    auth.value = { user: { id: 'uA' } };
    const { clear, as } = setup();
    as(null);
    as({ id: 'uB' });
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

describe('App wiring', () => {
  it('mounts QueryCacheReset inside AuthProvider, under QueryClientProvider', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
    const at = (needle: string) => app.indexOf(needle);
    expect(at('<QueryCacheReset />')).toBeGreaterThan(at('<QueryClientProvider'));
    expect(at('<QueryCacheReset />')).toBeGreaterThan(at('<AuthProvider>'));
    expect(at('<QueryCacheReset />')).toBeLessThan(at('</AuthProvider>'));
    expect(at('</QueryClientProvider>')).toBeGreaterThan(at('</AuthProvider>'));
  });
});
