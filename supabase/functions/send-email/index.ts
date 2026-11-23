// send-email: internal, service-role-only email transport (Phase 2 spec §C.3; gap/08 NO4). Logic and tests in handler.ts.
import { createHandler } from './handler.ts';

Deno.serve(createHandler());
