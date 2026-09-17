import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Marks one familiarization checklist item complete/incomplete on behalf of a
 * supervisor. The parent familiarization_records row (completion_percentage,
 * status, actual_completion_date) is recomputed by the
 * trg_recompute_familiarization_progress database trigger, so this function
 * only touches the checklist item.
 */
interface UpdateFamiliarizationRequest {
  familiarizationId: string;
  checklistItemId: string;
  completed: boolean;
  notes?: string;
  evidenceUrl?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const body: UpdateFamiliarizationRequest = await req.json();
    if (!body.familiarizationId || !body.checklistItemId || typeof body.completed !== 'boolean') {
      throw new Error('familiarizationId, checklistItemId and completed are required');
    }

    // Load the record with its vessel so we can scope the permission check.
    const { data: familiarization, error: famError } = await supabaseAdmin
      .from('familiarization_records')
      .select('id, user_id, supervisor_id, vessel_id, vessels!inner(company_id)')
      .eq('id', body.familiarizationId)
      .single();

    if (famError || !familiarization) {
      throw new Error('Familiarization record not found');
    }

    const recordCompanyId = (familiarization as unknown as { vessels: { company_id: string } }).vessels?.company_id;
    if (recordCompanyId !== profile.company_id) {
      throw new Error('Familiarization record not found');
    }

    const isSupervisor = familiarization.supervisor_id === userData.user.id;
    const isManager = ['dpa', 'master', 'shore_management', 'chief_officer', 'chief_engineer'].includes(profile.role);
    if (!isSupervisor && !isManager) {
      throw new Error('Insufficient permissions');
    }

    const { error: updateError } = await supabaseAdmin
      .from('familiarization_checklist_items')
      .update({
        completed: body.completed,
        completed_date: body.completed ? new Date().toISOString() : null,
        completed_by_id: body.completed ? userData.user.id : null,
        notes: body.notes ?? null,
        evidence_url: body.evidenceUrl ?? null,
      })
      .eq('id', body.checklistItemId)
      .eq('familiarization_id', body.familiarizationId);

    if (updateError) {
      throw new Error(`Failed to update checklist item: ${updateError.message}`);
    }

    // The trigger has already recomputed the parent; read it back for the caller.
    const { data: updated } = await supabaseAdmin
      .from('familiarization_records')
      .select('completion_percentage, status, actual_completion_date')
      .eq('id', body.familiarizationId)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        completionPercentage: updated?.completion_percentage ?? null,
        status: updated?.status ?? null,
        actualCompletionDate: updated?.actual_completion_date ?? null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in update-familiarization:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
