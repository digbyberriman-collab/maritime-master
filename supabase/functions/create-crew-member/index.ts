import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateCrewRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  nationality?: string;
  rank?: string;
  role: string;
  companyId: string;
  vesselId?: string;
  position?: string;
  joinDate?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verify the calling user is authenticated and has permission
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error('Unauthorized');
    }

    const userId = userData.user.id;

    // Check if user has DPA/superadmin role in user_roles table (RBAC system)
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('role', ['dpa', 'superadmin', 'shore_management']);

    // Also check legacy profile.role for backwards compatibility
    const { data: callerProfile, error: callerError } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', userId)
      .single();

    if (callerError || !callerProfile) {
      throw new Error('Could not verify permissions');
    }

    const legacyRole = callerProfile.role?.toLowerCase();
    const hasLegacyAdminRole = legacyRole === 'dpa' || legacyRole === 'shore_management' || legacyRole === 'superadmin';
    const hasNewRoleAccess = roles && roles.length > 0;

    // Only DPA, Shore Management, or superadmin can create crew members
    if (!hasNewRoleAccess && !hasLegacyAdminRole) {
      throw new Error('Insufficient permissions to create crew members');
    }

    const body: CreateCrewRequest = await req.json();

    // Validate required fields
    if (!body.email || !body.password || !body.firstName || !body.lastName || !body.companyId) {
      throw new Error('Missing required fields');
    }

    // Ensure the company matches the caller's company
    if (body.companyId !== callerProfile.company_id) {
      throw new Error('Cannot create crew for a different company');
    }

    console.log(`Creating crew member: ${body.email}`);

    // Create the auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true, // Auto-confirm the email
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      throw new Error(`Failed to create user: ${authError.message}`);
    }

    if (!authData.user) {
      throw new Error('No user returned from creation');
    }

    console.log(`Created auth user: ${authData.user.id}`);

    // Create the profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        email: body.email,
        first_name: body.firstName,
        last_name: body.lastName,
        phone: body.phone || null,
        nationality: body.nationality || null,
        rank: body.rank || null,
        role: body.role,
        company_id: body.companyId,
        status: 'Active',
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Try to clean up the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    console.log('Created profile');

    // Create vessel assignment if vessel info provided
    if (body.vesselId && body.position && body.joinDate) {
      const { error: assignmentError } = await supabaseAdmin
        .from('crew_assignments')
        .insert({
          user_id: authData.user.id,
          vessel_id: body.vesselId,
          position: body.position,
          join_date: body.joinDate,
          is_current: true,
        });

      if (assignmentError) {
        console.error('Assignment creation error:', assignmentError);
        // Don't fail completely, just log the error
      } else {
        console.log('Created crew assignment');
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId: authData.user.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in create-crew-member:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
