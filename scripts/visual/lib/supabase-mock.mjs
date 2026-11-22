/**
 * Supabase mock for the visual harness.
 *
 * The live project is not reachable from the build box (DECISIONS D-01), so
 * the dev server is pointed at a URL nothing listens on and every request to
 * it is answered here, inside the browser context, through `page.route`:
 *
 *   /auth/v1/**       a fake signed-in user (token refresh, user, sessions …)
 *   /rest/v1/<table>  fixtures/<table>.json through the PostgREST look-alike
 *   /rest/v1/rpc/<fn> fixtures/rpc/<fn>.json, else null
 *   /storage/v1/**    empty lists, signed URLs, a 1×1 PNG for objects
 *   /functions/v1/**  200 {}
 *   realtime ws       accepted and answered with empty joins (fails quietly)
 *
 * The session is seeded into localStorage before any app script runs, under
 * the key supabase-js derives from the URL (`sb-<first host label>-auth-token`)
 * — the app's client (src/integrations/supabase/client.ts) uses the default
 * key, and previewAuthStorage falls back to plain localStorage off the
 * Lovable preview hosts, which is the case on 127.0.0.1.
 */

import { handleRest } from './postgrest.mjs';

const base64url = (input) => Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** An unsigned-looking JWT: valid structure, fake signature. Never accepted by a real server. */
export function fakeJwt(payload) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.${base64url('visual-harness-not-a-real-signature')}`;
}

/** The publishable (anon) key handed to Vite. Looks like a JWT so nothing trips on its shape. */
export const FAKE_PUBLISHABLE_KEY = fakeJwt({ iss: 'supabase', ref: 'visual-harness', role: 'anon', iat: 1_700_000_000, exp: 4_102_444_800 });

/** supabase-js default: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`. */
export const storageKeyFor = (supabaseUrl) => `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

const DEFAULT_AUTH = {
  id: 'a0000000-0000-4000-8000-000000000001',
  email: 'fleet.manager@demo-fleet.example',
  user_metadata: { first_name: 'Demo', last_name: 'Fleet Manager' },
};

/** A GoTrue user object for the fixture identity. */
export function buildAuthUser(auth, now = new Date()) {
  const a = { ...DEFAULT_AUTH, ...(auth ?? {}) };
  const created = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  return {
    id: a.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: a.email,
    email_confirmed_at: created,
    phone: '',
    confirmed_at: created,
    last_sign_in_at: now.toISOString(),
    app_metadata: { provider: 'email', providers: ['email'], ...(a.app_metadata ?? {}) },
    user_metadata: { ...(a.user_metadata ?? {}) },
    identities: [],
    factors: [],
    created_at: created,
    updated_at: now.toISOString(),
    is_anonymous: false,
  };
}

/** A session that stays valid for the whole run (no refresh needed). */
export function buildSession(user, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000);
  const expiresIn = 7 * 24 * 3600;
  return {
    access_token: fakeJwt({
      aud: 'authenticated',
      exp: iat + expiresIn,
      iat,
      iss: 'visual-harness',
      sub: user.id,
      email: user.email,
      phone: '',
      role: 'authenticated',
      aal: 'aal1',
      amr: [{ method: 'password', timestamp: iat }],
      session_id: '5e550000-0000-4000-8000-000000000001',
      is_anonymous: false,
    }),
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: iat + expiresIn,
    refresh_token: 'visual-harness-refresh-token',
    user,
  };
}

/**
 * Per-browser-context mock state. Fixtures are deep-copied so writes made by
 * one capture never leak into the next.
 */
export function createMockState({ fixtures, signedIn = true, now = new Date() }) {
  const user = buildAuthUser(fixtures.auth, now);
  return {
    signedIn,
    user,
    session: buildSession(user, now),
    db: {
      tables: JSON.parse(JSON.stringify(fixtures.tables)),
      rpc: JSON.parse(JSON.stringify(fixtures.rpc)),
      missingTables: new Set(fixtures.config?.missingTables ?? []),
    },
    /** @type {{ kind: string, method: string, path: string, table?: string, rpc?: string, fixture: boolean, status: number }[]} */
    log: [],
  };
}

// 1×1 transparent PNG, for storage object URLs used as <img src>.
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const JSON_TYPE = { 'content-type': 'application/json; charset=utf-8' };
const json = (status, value, meta = {}) => ({ status, headers: JSON_TYPE, body: JSON.stringify(value), meta });

function handleAuth(state, request) {
  const path = request.url.pathname.replace(/^\/auth\/v1/, '');
  const unauthenticated = () =>
    json(401, { code: 401, error_code: 'no_authorization', msg: 'This endpoint requires a valid Bearer token' });

  if (path === '/user') {
    if (!state.signedIn) return unauthenticated();
    if (request.method === 'PUT' && request.body && typeof request.body === 'object') {
      const body = /** @type {Record<string, unknown>} */ (request.body);
      if (body.data && typeof body.data === 'object') state.user.user_metadata = { ...state.user.user_metadata, ...body.data };
    }
    return json(200, state.user);
  }
  if (path === '/token') {
    const grant = request.url.searchParams.get('grant_type');
    // A password sign-in on /auth signs the fixture user in, whatever was typed.
    if (grant === 'password') state.signedIn = true;
    if (!state.signedIn) return json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
    state.session = buildSession(state.user);
    return json(200, state.session);
  }
  if (path === '/logout') {
    state.signedIn = false;
    return { status: 204, headers: {}, body: '', meta: {} };
  }
  if (path === '/settings') {
    return json(200, {
      external: { email: true, phone: false },
      disable_signup: true,
      mailer_autoconfirm: false,
      phone_autoconfirm: false,
      sms_provider: '',
      saml_enabled: false,
    });
  }
  if (path === '/factors' || path === '/sessions' || path.startsWith('/admin/users')) return json(200, []);
  if (path === '/.well-known/jwks.json') return json(200, { keys: [] });
  return json(200, {});
}

function handleStorage(request) {
  const path = request.url.pathname.replace(/^\/storage\/v1/, '');
  if (/^\/object\/list\//.test(path)) return json(200, []);
  if (path === '/bucket' || path.startsWith('/bucket?')) return json(200, []);
  const signBatch = /^\/object\/sign\/([^/]+)$/.exec(path);
  if (signBatch && request.method === 'POST') {
    const body = request.body && typeof request.body === 'object' ? /** @type {{ paths?: string[] }} */ (request.body) : {};
    return json(200, (body.paths ?? []).map((p) => ({ path: p, signedURL: `/object/sign/${signBatch[1]}/${p}?token=visual`, error: null })));
  }
  if (/^\/object\/sign\//.test(path) && request.method === 'POST') {
    return json(200, { signedURL: `${path}?token=visual` });
  }
  if (/^\/(object|render\/image)\//.test(path) && (request.method === 'GET' || request.method === 'HEAD')) {
    return { status: 200, headers: { 'content-type': 'image/png' }, body: PIXEL_PNG, meta: {} };
  }
  return json(200, {});
}

/**
 * Answer one request to the mock Supabase origin.
 * @param {ReturnType<typeof createMockState>} state
 * @param {{ method: string, url: URL, headers: Record<string, string>, body: unknown }} request
 */
export function handleSupabaseRequest(state, request) {
  const { pathname } = request.url;
  let response;
  let kind;
  if (pathname.startsWith('/rest/v1')) {
    response = handleRest(state.db, request);
    kind = response.meta.rpc ? 'rpc' : 'rest';
  } else if (pathname.startsWith('/auth/v1')) {
    response = handleAuth(state, request);
    kind = 'auth';
  } else if (pathname.startsWith('/storage/v1')) {
    response = handleStorage(request);
    kind = 'storage';
  } else if (pathname.startsWith('/functions/v1')) {
    response = json(200, {});
    kind = 'functions';
  } else {
    response = json(404, { message: 'Not found in the visual harness mock' });
    kind = 'other';
  }
  state.log.push({
    kind,
    method: request.method,
    path: pathname,
    table: response.meta?.table,
    rpc: response.meta?.rpc,
    fixture: Boolean(response.meta?.fixture),
    status: response.status,
  });
  return response;
}

function corsHeaders(requestHeaders) {
  return {
    'access-control-allow-origin': requestHeaders.origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS',
    'access-control-allow-headers': requestHeaders['access-control-request-headers'] ?? '*',
    'access-control-expose-headers': 'content-range, content-profile, range-unit, x-total-count, preference-applied',
    'access-control-max-age': '600',
  };
}

const parseBody = (raw) => {
  if (raw === null || raw === undefined || raw === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

/** Answer Phoenix joins and heartbeats so the realtime client settles instead of retrying. */
function answerRealtime(ws) {
  ws.onMessage((message) => {
    if (typeof message !== 'string') return;
    let frame;
    try {
      frame = JSON.parse(message);
    } catch {
      return;
    }
    // Serializer v2 frames are arrays: [join_ref, ref, topic, event, payload].
    const isArray = Array.isArray(frame);
    const joinRef = isArray ? frame[0] : frame.join_ref;
    const ref = isArray ? frame[1] : frame.ref;
    const topic = isArray ? frame[2] : frame.topic;
    const event = isArray ? frame[3] : frame.event;
    const payload = (isArray ? frame[4] : frame.payload) ?? {};
    if (event !== 'phx_join' && event !== 'heartbeat' && event !== 'access_token' && event !== 'phx_leave') return;
    const changes = Array.isArray(payload?.config?.postgres_changes) ? payload.config.postgres_changes : [];
    const response = event === 'phx_join'
      ? { postgres_changes: changes.map((c, i) => ({ ...c, id: i + 1 })) }
      : {};
    const reply = { status: 'ok', response };
    ws.send(JSON.stringify(isArray ? [joinRef, ref, topic, 'phx_reply', reply] : { topic, event: 'phx_reply', payload: reply, ref, join_ref: joinRef }));
  });
}

/**
 * Wire the mock into a Playwright browser context.
 * @param {import('playwright').BrowserContext} context
 * @param {{ supabaseUrl: string, state: ReturnType<typeof createMockState>, localStorage?: Record<string, string> }} options
 */
export async function installSupabaseMock(context, { supabaseUrl, state, localStorage = {} }) {
  const origin = new URL(supabaseUrl).origin;
  await context.addInitScript(
    ({ key, session, extra }) => {
      try {
        if (session) window.localStorage.setItem(key, JSON.stringify(session));
        else window.localStorage.removeItem(key);
        for (const [k, v] of Object.entries(extra)) window.localStorage.setItem(k, v);
      } catch {
        /* storage blocked: the app shows the sign-in page, which the report flags */
      }
    },
    { key: storageKeyFor(supabaseUrl), session: state.signedIn ? state.session : null, extra: localStorage },
  );

  await context.route((url) => url.origin === origin, async (route) => {
    const req = route.request();
    const headers = req.headers();
    const cors = corsHeaders(headers);
    if (req.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors, body: '' });
      return;
    }
    const response = handleSupabaseRequest(state, {
      method: req.method(),
      url: new URL(req.url()),
      headers,
      body: parseBody(req.postData()),
    });
    await route.fulfill({ status: response.status, headers: { ...cors, ...response.headers }, body: response.body });
  });

  const wsOrigin = origin.replace(/^http/, 'ws');
  await context.routeWebSocket((url) => url.href.startsWith(wsOrigin), (ws) => answerRealtime(ws));
}
