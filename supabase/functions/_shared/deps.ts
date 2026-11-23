/**
 * Dependencies every function handler takes (Phase 2 spec §C.1; D-130).
 * `index.ts` builds the handler with the defaults (`Deno.env`, the real
 * supabase-js client); tests pass `env` and a fake `createClient`. The
 * environment is read per request, so a missing variable becomes a JSON
 * 500 `server_misconfigured` instead of a crashed isolate.
 */
import { type ClientFactory, defaultCreateClient } from './auth.ts';
import { type EdgeEnv, readEnv } from './env.ts';

export interface EdgeDeps {
  env: () => EdgeEnv;
  createClient: ClientFactory;
}

export function edgeDeps(patch: Partial<EdgeDeps> = {}): EdgeDeps {
  return { env: patch.env ?? (() => readEnv()), createClient: patch.createClient ?? defaultCreateClient };
}

/** CORS origins for `withHttp`, from the same env (empty when the env cannot be read). */
export function originsOf(deps: EdgeDeps): () => readonly string[] {
  return () => deps.env().allowedOrigins;
}
