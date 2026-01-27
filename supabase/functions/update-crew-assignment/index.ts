import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateAssignmentRequest {
  assignmentId: string;
  joinDate?: string;
  position?: string;
  department?: string;
}

interface ReassignVesselRequest {
  userId: string;
  currentAssignmentId?: string;
  newVesselId: string;
  position: string;
  startDate: string;
  endCurrentAssignment?: boolean;
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
      .select('role, company_id, user_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile) {
      throw new Error('Profile not found');
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'update';

    if (action === 'update') {
      // Update join date or other assignment fields
      if (!['dpa', 'shore_management', 'master'].includes(profile.role)) {
        throw new Error('Insufficient permissions');
      }

      const body: UpdateAssignmentRequest = await req.json();

      if (!body.assignmentId) {
        throw new Error('Assignment ID is required');
      }

      // Get the assignment to verify access
      const { data: assignment, error: assignmentError } = await supabaseAdmin
        .from('crew_assignments')
        .select('*, vessels(company_id)')
        .eq('id', body.assignmentId)
        .single();

      if (assignmentError || !assignment) {
        throw new Error('Assignment not found');
      }

      // Verify company access
      if ((assignment.vessels as any)?.company_id !== profile.company_id) {
        throw new Error('Access denied');
      }

      // Get old values for audit log
      const oldValues = {
        join_date: assignment.join_date,
        position: assignment.position,
        department: assignment.department,
      };

      // Build update object
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (body.joinDate !== undefined) {
        updateData.join_date = body.joinDate;
      }
      if (body.position !== undefined) {
        updateData.position = body.position;
      }
      if (body.department !== undefined) {
        updateData.department = body.department;
      }

      const { error: updateError } = await supabaseAdmin
        .from('crew_assignments')
        .update(updateData)
        .eq('id', body.assignmentId);

      if (updateError) {
        throw new Error(`Failed to update assignment: ${updateError.message}`);
      }

      // Log audit entry
      await supabaseAdmin.from('audit_logs').insert({
        entity_type: 'crew_assignment',
        entity_id: body.assignmentId,
        action: 'UPDATE',
        actor_user_id: userData.user.id,
        actor_email: userData.user.email,
        actor_role: profile.role,
        old_values: oldValues,
        new_values: updateData,
        changed_fields: Object.keys(updateData).filter(k => k !== 'updated_at'),
      });

      console.log(`Updated assignment ${body.assignmentId}`);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (action === 'reassign') {
      // Reassign crew to different vessel
      if (!['dpa', 'shore_management', 'master'].includes(profile.role)) {
        throw new Error('Insufficient permissions');
      }

      const body: ReassignVesselRequest = await req.json();

      if (!body.userId || !body.newVesselId || !body.position || !body.startDate) {
        throw new Error('Missing required fields');
      }

      // Verify the user belongs to same company
      const { data: targetProfile } = await supabaseAdmin
        .from('profiles')
        .select('company_id')
        .eq('user_id', body.userId)
        .single();

      if (!targetProfile || targetProfile.company_id !== profile.company_id) {
        throw new Error('User not found or access denied');
      }

      // Verify the new vessel belongs to same company
      const { data: vessel } = await supabaseAdmin
        .from('vessels')
        .select('id, company_id')
        .eq('id', body.newVesselId)
        .single();

      if (!vessel || vessel.company_id !== profile.company_id) {
        throw new Error('Vessel not found or access denied');
      }

      // End current assignment if specified
      if (body.currentAssignmentId && body.endCurrentAssignment !== false) {
        const { error: endError } = await supabaseAdmin
          .from('crew_assignments')
          .update({
            is_current: false,
            leave_date: body.startDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', body.currentAssignmentId);

        if (endError) {
          console.error('Error ending current assignment:', endError);
        }
      } else if (!body.currentAssignmentId) {
        // End any current assignments for this user
        await supabaseAdmin
          .from('crew_assignments')
          .update({
            is_current: false,
            leave_date: body.startDate,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', body.userId)
          .eq('is_current', true);
      }

      // Create new assignment
      const { data: newAssignment, error: createError } = await supabaseAdmin
        .from('crew_assignments')
        .insert({
          user_id: body.userId,
          vessel_id: body.newVesselId,
          position: body.position,
          join_date: body.startDate,
          start_date: body.startDate,
          is_current: true,
          created_by: userData.user.id,
        })
        .select()
        .single();

      if (createError) {
        throw new Error(`Failed to create new assignment: ${createError.message}`);
      }

      // Log audit entry
      await supabaseAdmin.from('audit_logs').insert({
        entity_type: 'crew_assignment',
        entity_id: newAssignment.id,
        action: 'REASSIGN',
        actor_user_id: userData.user.id,
        actor_email: userData.user.email,
        actor_role: profile.role,
        new_values: {
          vessel_id: body.newVesselId,
          position: body.position,
          start_date: body.startDate,
          notes: body.notes,
        },
      });

      console.log(`Reassigned user ${body.userId} to vessel ${body.newVesselId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          assignmentId: newAssignment.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in update-crew-assignment:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
