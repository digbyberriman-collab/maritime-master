import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

/**
 * Imports exercises into `pt_exercises` from an external source.
 *
 * This runs server side for one reason: the ExerciseDB connector needs a
 * RapidAPI key, and that key must never reach the browser. The key is read
 * from the company's `pt_exercise_sources.credential` row, which only a
 * wellness admin can see, and is used here and nowhere else.
 *
 * Called with the signed-in user's JWT:
 *   supabase.functions.invoke('pt-exercise-import', {
 *     body: { source_key: 'wger' | 'exercisedb', limit?: number, language?: string }
 *   })
 * Returns { imported, skipped, failed, message }.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface ExerciseRow {
  company_id: string;
  name: string;
  category: string;
  body_part: string | null;
  target_muscle: string | null;
  secondary_muscles: string[];
  equipment: string | null;
  instructions: string | null;
  video_url: string | null;
  image_url: string | null;
  source: string;
  source_id: string;
  source_licence: string | null;
  attribution: string | null;
  is_rehab: boolean;
}

/** wger categories map onto ours; anything unknown becomes `strength`. */
const WGER_CATEGORY: Record<string, string> = {
  Arms: 'strength',
  Legs: 'strength',
  Abs: 'core',
  Chest: 'strength',
  Back: 'strength',
  Shoulders: 'strength',
  Calves: 'strength',
  Cardio: 'cardio',
};

const stripHtml = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
};

// The connector base URL comes out of the database and the pagination cursor
// comes out of the remote response, so neither is trusted. Every outbound
// request is pinned to the connector's own host over https: without this a
// hostile upstream could walk the loop onto a link-local metadata address and
// have the result written back with the service-role key, and a rewritten
// base_url would carry the RapidAPI key to a host of the attacker's choosing.
const ALLOWED_HOSTS: Record<string, string[]> = {
  wger: ['wger.de', 'www.wger.de'],
  exercisedb: ['exercisedb.p.rapidapi.com'],
};

function assertAllowedUrl(sourceKey: string, candidate: string): URL {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error(`${candidate} is not a valid URL`);
  }
  if (url.protocol !== 'https:') {
    throw new Error(`${sourceKey} must be reached over https`);
  }
  const allowed = ALLOWED_HOSTS[sourceKey] ?? [];
  if (!allowed.includes(url.hostname.toLowerCase())) {
    throw new Error(`${url.hostname} is not an approved host for ${sourceKey}`);
  }
  return url;
}

async function fetchWger(companyId: string, baseUrl: string, limit: number, language: string) {
  const rows: ExerciseRow[] = [];
  const errors: string[] = [];
  const pageSize = Math.min(limit, 100);
  const origin = assertAllowedUrl('wger', baseUrl);
  let url: string | null =
    `${baseUrl.replace(/\/$/, '')}/exercisebaseinfo/?limit=${pageSize}&offset=0`;

  while (url && rows.length < limit) {
    const response: Response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      errors.push(`wger responded ${response.status}`);
      break;
    }
    const payload = await response.json();
    for (const base of payload.results ?? []) {
      if (rows.length >= limit) break;
      const translations = base.exercises ?? base.translations ?? [];
      const preferred =
        translations.find((t: Record<string, unknown>) => String(t.language) === language) ??
        translations.find((t: Record<string, unknown>) => Number(t.language) === 2) ??
        translations[0];
      if (!preferred?.name) continue;

      rows.push({
        company_id: companyId,
        name: String(preferred.name).trim(),
        category: WGER_CATEGORY[base.category?.name ?? ''] ?? 'strength',
        body_part: base.category?.name ?? null,
        target_muscle: base.muscles?.[0]?.name_en ?? base.muscles?.[0]?.name ?? null,
        secondary_muscles: (base.muscles_secondary ?? [])
          .map((m: Record<string, unknown>) => String(m.name_en ?? m.name ?? ''))
          .filter(Boolean),
        equipment: (base.equipment ?? [])
          .map((e: Record<string, unknown>) => String(e.name ?? ''))
          .filter(Boolean)
          .join(', ') || null,
        instructions: stripHtml(preferred.description),
        video_url: base.videos?.[0]?.video ?? null,
        image_url: base.images?.[0]?.image ?? null,
        source: 'wger',
        source_id: String(base.id),
        source_licence: 'CC-BY-SA 4.0',
        attribution: 'Exercise data from wger.de, licensed CC-BY-SA 4.0',
        is_rehab: false,
      });
    }
    // The cursor is remote input: keep it on the host we started from.
    const next = rows.length < limit ? (payload.next ?? null) : null;
    if (next) {
      const nextUrl = assertAllowedUrl('wger', String(next));
      if (nextUrl.host !== origin.host) {
        errors.push('wger returned a pagination link on another host; stopping.');
        break;
      }
      url = nextUrl.toString();
    } else {
      url = null;
    }
  }

  return { rows, errors };
}

async function fetchExerciseDb(
  companyId: string,
  baseUrl: string,
  credential: string,
  limit: number,
) {
  const host = assertAllowedUrl('exercisedb', baseUrl).host;
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/exercises?limit=${limit}`, {
    headers: {
      'X-RapidAPI-Key': credential,
      'X-RapidAPI-Host': host,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    return {
      rows: [] as ExerciseRow[],
      errors: [
        response.status === 401 || response.status === 403
          ? 'ExerciseDB rejected the API key.'
          : `ExerciseDB responded ${response.status}`,
      ],
    };
  }

  const payload = await response.json();
  const rows: ExerciseRow[] = (Array.isArray(payload) ? payload : []).slice(0, limit).map(
    (item: Record<string, unknown>) => ({
      company_id: companyId,
      name: String(item.name ?? '').trim(),
      category: item.bodyPart === 'cardio' ? 'cardio' : 'strength',
      body_part: (item.bodyPart as string) ?? null,
      target_muscle: (item.target as string) ?? null,
      secondary_muscles: ((item.secondaryMuscles as string[]) ?? []).filter(Boolean),
      equipment: (item.equipment as string) ?? null,
      instructions: Array.isArray(item.instructions)
        ? (item.instructions as string[]).join('\n')
        : ((item.instructions as string) ?? null),
      video_url: null,
      image_url: (item.gifUrl as string) ?? null,
      source: 'exercisedb',
      source_id: String(item.id ?? item.name ?? ''),
      source_licence: 'Commercial',
      attribution: 'ExerciseDB via RapidAPI',
      is_rehab: false,
    }),
  );

  return { rows: rows.filter((r) => r.name && r.source_id), errors: [] as string[] };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // The caller's own client: RLS decides whether they may read the
  // connector row at all, which is how admin-only access is enforced.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();
  if (userError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: { source_key?: string; limit?: number; language?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Expected a JSON body' }, 400);
  }

  const sourceKey = body.source_key ?? '';
  if (sourceKey !== 'wger' && sourceKey !== 'exercisedb') {
    return json({ error: 'Only the wger and exercisedb connectors import over the API.' }, 400);
  }
  const limit = Math.min(Math.max(body.limit ?? 200, 1), 1000);
  const language = body.language ?? '2';

  const { data: source, error: sourceError } = await caller
    .from('pt_exercise_sources')
    .select('id, company_id, source_key, base_url, credential, is_enabled')
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (sourceError) return json({ error: sourceError.message }, 400);
  if (!source) {
    return json(
      { error: 'That connector is not set up for your company, or you cannot manage it.' },
      403,
    );
  }
  if (!source.is_enabled) {
    return json({ error: 'That connector is switched off. Enable it before importing.' }, 400);
  }

  const baseUrl =
    source.base_url ?? (sourceKey === 'wger' ? 'https://wger.de/api/v2' : 'https://exercisedb.p.rapidapi.com');

  let result: { rows: ExerciseRow[]; errors: string[] };
  try {
    if (sourceKey === 'wger') {
      result = await fetchWger(source.company_id, baseUrl, limit, language);
    } else {
      if (!source.credential) {
        return json({ error: 'No API key is stored for ExerciseDB. Add one first.' }, 400);
      }
      result = await fetchExerciseDb(source.company_id, baseUrl, source.credential, limit);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await caller
      .from('pt_exercise_sources')
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: 'failed', last_sync_message: message })
      .eq('id', source.id);
    return json({ error: `Could not reach ${sourceKey}: ${message}` }, 502);
  }

  if (result.rows.length === 0) {
    const message = result.errors[0] ?? 'The source returned nothing.';
    await caller
      .from('pt_exercise_sources')
      .update({ last_synced_at: new Date().toISOString(), last_sync_status: 'failed', last_sync_message: message })
      .eq('id', source.id);
    return json({ imported: 0, skipped: 0, failed: 0, message }, 200);
  }

  // Write with the service role so the import is not limited by the
  // caller's row policies, after RLS has already proved they may manage
  // this company's connector.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const batchSize = 100;

  for (let i = 0; i < result.rows.length; i += batchSize) {
    const batch = result.rows.slice(i, i + batchSize);
    const { data, error } = await admin
      .from('pt_exercises')
      .upsert(batch, { onConflict: 'company_id,source,source_id', ignoreDuplicates: false })
      .select('id');
    if (error) {
      failed += batch.length;
      result.errors.push(error.message);
      console.error('[pt-exercise-import] batch failed:', error.message);
    } else {
      imported += data?.length ?? 0;
      skipped += batch.length - (data?.length ?? 0);
    }
  }

  const message = failed
    ? `Imported ${imported}, ${failed} failed. ${result.errors[0] ?? ''}`.trim()
    : `Imported ${imported} exercises from ${sourceKey}.`;

  await admin
    .from('pt_exercise_sources')
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: failed ? 'partial' : 'success',
      last_sync_message: message,
      imported_count: imported,
    })
    .eq('id', source.id);

  return json({ imported, skipped, failed, message });
});
