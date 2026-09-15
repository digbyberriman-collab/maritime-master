import { describe, expect, it } from 'vitest';
import { getSupabaseConfig } from './supabase';

describe('STORM public backend configuration', () => {
  it('boots a published build without an untracked env file', () => {
    const config = getSupabaseConfig();
    expect(config.url).toBe('https://pfvtrtkqkvjbnbaabgpv.supabase.co');
    const claims = JSON.parse(atob(config.publicKey.split('.')[1]));
    expect(claims.role).toBe('anon');
    expect(claims.ref).toBe('pfvtrtkqkvjbnbaabgpv');
  });
  it('allows an explicit environment to replace the connection as a pair', () => {
    expect(getSupabaseConfig(' https://example.supabase.co ', ' public-key '))
      .toEqual({ url: 'https://example.supabase.co', publicKey: 'public-key' });
  });
  it('rejects partial overrides rather than mixing project settings', () => {
    expect(() => getSupabaseConfig('https://example.supabase.co')).toThrow('Set both');
    expect(() => getSupabaseConfig(undefined, 'public-key')).toThrow('Set both');
  });
});
