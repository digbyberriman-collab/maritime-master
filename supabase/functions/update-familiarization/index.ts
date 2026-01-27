import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateFamiliarizationRequest {
  crewId: string;
  sectionId: string;
  checklistItemIndex: number;
  completed: boolean;
  notes?: string;
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

    // Only DPA, Master, and Supervisors can update familiarization
    if (!['dpa', 'master', 'shore_management', 'chief_officer', 'chief_engineer'].includes(profile.role)) {
      throw new Error('Insufficient permissions');
    }

    const body: UpdateFamiliarizationRequest = await req.json();

    // Get familiarization record
    const { data: familiarization, error: famError } = await supabaseAdmin
      .from('familiarization_records')
      .select('*')
      .eq('user_id', body.crewId)
      .eq('id', body.sectionId)
      .single();

    if (famError || !familiarization) {
      throw new Error('Familiarization record not found');
    }

    // Update checklist progress
    const checklistProgress = familiarization.checklist_progress || [];
    checklistProgress[body.checklistItemIndex] = {
      completed: body.completed,
      completed_at: body.completed ? new Date().toISOString() : null,
      completed_by: body.completed ? userData.user.id : null,
      notes: body.notes,
    };

    // Calculate completion percentage
    const totalItems = checklistProgress.length;
    const completedItems = checklistProgress.filter((item: { completed: boolean }) => item?.completed).length;
    const completionPercentage = Math.round((completedItems / totalItems) * 100);

    // Determine status
    let status = 'In_Progress';
    if (completionPercentage === 100) {
      status = 'Completed';
    } else if (completionPercentage === 0) {
      status = 'Not_Started';
    }

    // Check if overdue
    const requiredCompletionDate = new Date(familiarization.required_completion_date);
    if (status !== 'Completed' && requiredCompletionDate < new Date()) {
      status = 'Overdue';
    }

    const { error: updateError } = await supabaseAdmin
      .from('familiarization_records')
      .update({
        checklist_progress: checklistProgress,
        completion_percentage: completionPercentage,
        status,
        completed_at: status === 'Completed' ? new Date().toISOString() : null,
        signed_off_by: status === 'Completed' ? userData.user.id : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.sectionId);

    if (updateError) {
      throw new Error(`Failed to update familiarization: ${updateError.message}`);
    }

    console.log(`Familiarization updated for crew ${body.crewId}, section ${body.sectionId}`);

    return new Response(
      JSON.stringify({
        success: true,
        completionPercentage,
        status,
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
