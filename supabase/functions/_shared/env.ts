/**
 * Typed environment access for edge functions (Phase 2 spec §C.1; gap/00 F1).
 * Missing required variables raise `server_misconfigured` naming the
 * variables only, never their values.
 */
import { HttpError } from './http.ts';

export interface EnvSource {
  get(name: string): string | undefined;
}

export interface EdgeEnv {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  /** `STORM_SITE_URL`: where invite and reset links land (no trailing slash). */
  siteUrl: string | null;
  /** `STORM_ALLOWED_ORIGINS`: comma-separated; empty = `*` (bearer-token API, no cookies). */
  allowedOrigins: readonly string[];
  /** `RESEND_API_KEY`: null when email is not configured (sends then fail honestly). */
  resendApiKey: string | null;
  /** `EMAIL_FROM`: fixed, verified sender; callers can never choose it. Null = not configured (sends fail honestly). */
  emailFrom: string | null;
}

export const denoEnv: EnvSource = { get: (name) => Deno.env.get(name) };

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

function value(source: EnvSource, name: string): string | null {
  const raw = source.get(name);
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/** `STORM_ALLOWED_ORIGINS` without the required variables (never throws; used for CORS before anything else). */
export function allowedOriginsFrom(source: EnvSource = denoEnv): readonly string[] {
  return (source.get('STORM_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function readEnv(source: EnvSource = denoEnv): EdgeEnv {
  const missing = REQUIRED.filter((name) => !value(source, name));
  if (missing.length > 0) {
    throw new HttpError(500, 'server_misconfigured', 'The server is not configured.', { missing: missing.join(',') });
  }
  const site = value(source, 'STORM_SITE_URL')?.replace(/\/+$/, '') || null;
  return {
    supabaseUrl: value(source, 'SUPABASE_URL') as string,
    anonKey: value(source, 'SUPABASE_ANON_KEY') as string,
    serviceRoleKey: value(source, 'SUPABASE_SERVICE_ROLE_KEY') as string,
    siteUrl: site,
    allowedOrigins: allowedOriginsFrom(source),
    resendApiKey: value(source, 'RESEND_API_KEY'),
    emailFrom: value(source, 'EMAIL_FROM'),
  };
}

/**
 * The site origin that invite and reset links land on (spec §C.3). Required
 * by the invite and reset paths: missing or not an http(s) URL → 500
 * `server_misconfigured` before anything is sent or stamped. Client-supplied
 * `redirectTo` values are never used.
 */
export function requireSiteUrl(env: EdgeEnv): string {
  const site = env.siteUrl;
  if (site) {
    try {
      const url = new URL(site);
      if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) {
        return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
      }
    } catch {
      // fall through: not a URL
    }
  }
  throw new HttpError(500, 'server_misconfigured', 'The server is not configured.', { missing: 'STORM_SITE_URL' });
}

/** Where an auth link lands: `${STORM_SITE_URL}/reset-password?flow=invite|recovery` (spec §C.3, CC-24). */
export function linkLanding(env: EdgeEnv, flow: 'invite' | 'recovery'): string {
  return `${requireSiteUrl(env)}/reset-password?flow=${flow}`;
}
