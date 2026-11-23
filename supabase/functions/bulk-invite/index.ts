// bulk-invite: up to 50 honest invitations (Phase 2 spec §C.3). Logic and tests in handler.ts.
import { createHandler } from './handler.ts';

Deno.serve(createHandler());
