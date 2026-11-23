// accept-invitation: legacy invitation-token flow before sign-in (Phase 2 spec §C.3; verify_jwt = false). Logic and tests in handler.ts.
import { createHandler } from './handler.ts';

Deno.serve(createHandler());
