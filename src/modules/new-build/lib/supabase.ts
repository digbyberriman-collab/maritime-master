/**
 * Module-local supabase handle that casts the typed client to `any`.
 * Phase A only — the nb_* tables don't exist in the generated types yet.
 * Replace with the typed client after Phase B's migration runs and the
 * supabase types regen.
 */
import { supabase as typedClient } from '@/modules/new-build/lib/supabase';
export const supabase: any = typedClient;
