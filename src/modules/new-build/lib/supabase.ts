/**
 * Module-local supabase handle that casts the typed client to `any`.
 * The nb_* tables aren't in the generated types yet, so we re-export the
 * project's shared client with a loose type to keep page queries compiling.
 */
import { supabase as typedClient } from '@/integrations/supabase/client';
export const supabase: any = typedClient;
