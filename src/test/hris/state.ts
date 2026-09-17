/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mutable state read by the vi.mock factories in HRIS page tests.
 *
 * This module has NO imports on purpose: the mock factory for
 * `@/integrations/supabase/client` imports it, and anything it imported that
 * itself imported the Supabase client would deadlock the mock registry.
 */
export const authState: { value: any } = { value: null };

let currentSupabase: any = null;
export const setCurrentSupabase = (client: any) => { currentSupabase = client; };
export const supabaseProxy: any = new Proxy({}, {
  get: (_t, prop) => {
    if (!currentSupabase) throw new Error('setupSupabase() was not called before rendering');
    return currentSupabase[prop];
  },
});
