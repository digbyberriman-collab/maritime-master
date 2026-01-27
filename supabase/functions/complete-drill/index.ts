import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CompleteDrillRequest {
  drillId: string;
  actualDate: string;
  durationMinutes: number;
  overallRating: number;
  weatherConditions?: string;
  lessonsLearnedPositive?: string;
  lessonsLearnedImprovement?: string;
  recommendations?: string;
  participants: {
    userId: string;
    attended: boolean;
    absentReason?: string;
    performanceRating?: number;
    lateArrivalMinutes?: number;
    comments?: string;
  }[];
  evaluations: {
    objectiveIndex: number;
    objectiveText: string;
    achieved: boolean;
    notes?: string;
  }[];
  deficiencies?: {
    description: string;
    severity: 'minor' | 'major' | 'critical';
    photoUrls?: string[];
  }[];
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

    // Only DPA, Master, and Safety Officer can complete drills
    if (!['dpa', 'master', 'shore_management'].includes(profile.role)) {
      throw new Error('Insufficient permissions');
    }

    const body: CompleteDrillRequest = await req.json();

    // Get drill
    const { data: drill, error: drillError } = await supabaseAdmin
      .from('drills')
      .select('*, vessels(*)')
      .eq('id', body.drillId)
      .single();

    if (drillError || !drill) {
      throw new Error('Drill not found');
    }

    if (drill.status === 'Completed') {
      throw new Error('Drill is already completed');
    }

    // Update drill
    const { error: updateError } = await supabaseAdmin
      .from('drills')
      .update({
        status: 'Completed',
        drill_date_actual: body.actualDate,
        drill_duration_minutes: body.durationMinutes,
        overall_rating: body.overallRating,
        weather_conditions: body.weatherConditions,
        lessons_learned_positive: body.lessonsLearnedPositive,
        lessons_learned_improvement: body.lessonsLearnedImprovement,
        recommendations: body.recommendations,
        conducted_by_id: userData.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.drillId);

    if (updateError) {
      throw new Error(`Failed to update drill: ${updateError.message}`);
    }

    // Record participants
    if (body.participants.length > 0) {
      const participantRecords = body.participants.map(p => ({
        drill_id: body.drillId,
        user_id: p.userId,
        attended: p.attended,
        absent_reason: p.absentReason,
        performance_rating: p.performanceRating,
        late_arrival_minutes: p.lateArrivalMinutes,
        comments: p.comments,
        expected_to_attend: true,
      }));

      // Delete existing participants first
      await supabaseAdmin
        .from('drill_participants')
        .delete()
        .eq('drill_id', body.drillId);

      await supabaseAdmin
        .from('drill_participants')
        .insert(participantRecords);
    }

    // Record evaluations
    if (body.evaluations.length > 0) {
      const evaluationRecords = body.evaluations.map(e => ({
        drill_id: body.drillId,
        objective_index: e.objectiveIndex,
        objective_text: e.objectiveText,
        achieved: e.achieved,
        notes: e.notes,
        evaluator_id: userData.user.id,
      }));

      // Delete existing evaluations first
      await supabaseAdmin
        .from('drill_evaluations')
        .delete()
        .eq('drill_id', body.drillId);

      await supabaseAdmin
        .from('drill_evaluations')
        .insert(evaluationRecords);
    }

    // Record deficiencies and create corrective actions
    if (body.deficiencies && body.deficiencies.length > 0) {
      for (const deficiency of body.deficiencies) {
        // Create deficiency record
        const { data: deficiencyRecord } = await supabaseAdmin
          .from('drill_deficiencies')
          .insert({
            drill_id: body.drillId,
            deficiency_description: deficiency.description,
            severity: deficiency.severity,
            photo_urls: deficiency.photoUrls,
          })
          .select()
          .single();

        // Auto-create corrective action for major/critical deficiencies
        if (deficiency.severity !== 'minor' && deficiencyRecord) {
          const actionNumber = `CAPA-DRILL-${Date.now()}`;
          
          const { data: capaRecord } = await supabaseAdmin
            .from('corrective_actions')
            .insert({
              action_number: actionNumber,
              action_type: 'corrective',
              description: `Drill deficiency: ${deficiency.description}`,
              status: 'Open',
              assigned_by: userData.user.id,
              assigned_to: userData.user.id, // Default to conductor
              company_id: profile.company_id,
              due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            })
            .select()
            .single();

          // Link CAPA to deficiency
          if (capaRecord) {
            await supabaseAdmin
              .from('drill_deficiencies')
              .update({ corrective_action_id: capaRecord.id })
              .eq('id', deficiencyRecord.id);
          }
        }
      }
    }

    console.log(`Drill ${drill.drill_number} completed`);

    return new Response(
      JSON.stringify({
        success: true,
        drillId: body.drillId,
        status: 'Completed',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in complete-drill:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
