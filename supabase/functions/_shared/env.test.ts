import { assert, assertEquals, assertFalse, assertThrows } from 'jsr:@std/assert@1.0.13';
import { allowedOriginsFrom, linkLanding, readEnv, requireSiteUrl } from './env.ts';
import { HttpError } from './http.ts';
import { TEST_ENV, envWith } from './testing/world.ts';

const source = (vars: Record<string, string>) => ({ get: (name: string) => vars[name] });

Deno.test('readEnv: missing required variables → 500 naming them, never their values', () => {
  const err = assertThrows(() => readEnv(source({ SUPABASE_URL: 'https://x.test', SUPABASE_ANON_KEY: 'secret-anon' })), HttpError);
  assertEquals(err.status, 500);
  assertEquals(err.code, 'server_misconfigured');
  assertEquals(err.details, { missing: 'SUPABASE_SERVICE_ROLE_KEY' });
  assertFalse(JSON.stringify(err.details).includes('secret-anon'));
});

Deno.test('readEnv: optional values are null when blank; no default sender', () => {
  const env = readEnv(source({
    SUPABASE_URL: 'https://x.test',
    SUPABASE_ANON_KEY: 'a',
    SUPABASE_SERVICE_ROLE_KEY: 's',
    STORM_SITE_URL: 'https://app.storm.test/',
    EMAIL_FROM: '  ',
    STORM_ALLOWED_ORIGINS: 'https://a.test/, https://b.test',
  }));
  assertEquals(env.siteUrl, 'https://app.storm.test');
  assertEquals(env.emailFrom, null);
  assertEquals(env.resendApiKey, null);
  assertEquals(env.allowedOrigins, ['https://a.test', 'https://b.test']);
  assertEquals(allowedOriginsFrom(source({})), []);
});

Deno.test('requireSiteUrl / linkLanding: links land on the site, never on client input', () => {
  assertEquals(linkLanding(TEST_ENV, 'invite'), 'https://app.storm.test/reset-password?flow=invite');
  assertEquals(linkLanding(TEST_ENV, 'recovery'), 'https://app.storm.test/reset-password?flow=recovery');
  for (const siteUrl of [null, 'javascript:alert(1)', 'not a url', 'https://user:pw@app.test']) {
    const err = assertThrows(() => requireSiteUrl(envWith({ siteUrl })), HttpError);
    assertEquals(err.code, 'server_misconfigured');
    assertEquals(err.details, { missing: 'STORM_SITE_URL' });
  }
  assert(requireSiteUrl(envWith({ siteUrl: 'http://localhost:8080' })).startsWith('http://localhost'));
});
