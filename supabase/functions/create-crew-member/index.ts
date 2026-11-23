// create-crew-member: add a crew profile and invite it through the one invitation path (Phase 2 spec §C.3). Logic and tests in handler.ts.
import { createHandler } from './handler.ts';

Deno.serve(createHandler());
