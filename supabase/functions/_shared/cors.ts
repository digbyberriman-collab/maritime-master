/**
 * CORS for edge functions (Phase 2 spec §C.1; gap/00 F1). Bearer-token API,
 * no cookies: `*` unless `STORM_ALLOWED_ORIGINS` lists origins, in which case
 * only a listed request origin is echoed (with `Vary: Origin`).
 */
const ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeaders(req: Request | null, allowedOrigins: readonly string[] = []): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': ALLOW_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
  };
  if (allowedOrigins.length === 0) {
    headers['Access-Control-Allow-Origin'] = '*';
    return headers;
  }
  const origin = req?.headers.get('Origin') ?? '';
  headers['Vary'] = 'Origin';
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

/** The preflight answer, or null when `req` is not a preflight. */
export function handleOptions(req: Request, allowedOrigins: readonly string[] = []): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response(null, { status: 204, headers: corsHeaders(req, allowedOrigins) });
}
