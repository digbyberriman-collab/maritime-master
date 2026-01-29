import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface AdminActionRequest {
  action: 'reset_account' | 'toggle_access' | 'reallocate_vessel' | 'verify_pin' | 'set_pin';
  targetUserId?: string;
  resetType?: 'password_reset' | 'invalidate_sessions' | 'resend_invitation';
  enableAccess?: boolean;
  vesselId?: string;
  effectiveDate?: string;
  endDate?: string;
  reason?: string;
  pin?: string;
  position?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: userData, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const userId = userData.user.id;

    // Check if user has DPA/superadmin role in user_roles table
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('role', ['dpa', 'superadmin']);

    // Also check legacy profile.role for backwards compatibility
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const legacyRole = profile?.role?.toLowerCase();
    const hasLegacyAdminRole = legacyRole === 'dpa' || legacyRole === 'shore_management' || legacyRole === 'superadmin';
    const hasNewRoleAccess = roles && roles.length > 0;

    if (!hasNewRoleAccess && !hasLegacyAdminRole) {
      console.log('Permission denied for user:', userId, 'Legacy role:', legacyRole, 'New roles:', roles);
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const body: AdminActionRequest = await req.json();
    const { action, targetUserId, resetType, enableAccess, vesselId, effectiveDate, endDate, reason, pin, position } = body;

    // Get actor's profile for logging
    const { data: actorProfile } = await supabaseAdmin
      .from('profiles')
      .select('first_name, last_name, company_id')
      .eq('user_id', userId)
      .single();

    let result: any = {};

    switch (action) {
      case 'set_pin': {
        if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
          return new Response(JSON.stringify({ error: 'PIN must be exactly 6 digits' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Hash the PIN using bcrypt-like approach (using crypto)
        const encoder = new TextEncoder();
        const data = encoder.encode(pin + userId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        // Upsert PIN
        const { error: pinError } = await supabaseAdmin
          .from('admin_pins')
          .upsert({
            user_id: userId,
            pin_hash: pinHash,
            failed_attempts: 0,
            locked_until: null,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (pinError) throw pinError;

        // Log action
        await supabaseAdmin.from('admin_action_log').insert({
          actor_user_id: userId,
          action_type: 'SET_PIN',
          target_user_id: userId,
          after_json: { action: 'PIN set/updated' }
        });

        result = { success: true, message: 'PIN set successfully' };
        break;
      }

      case 'verify_pin': {
        if (!pin) {
          return new Response(JSON.stringify({ error: 'PIN required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get PIN record
        const { data: pinRecord } = await supabaseAdmin
          .from('admin_pins')
          .select('*')
          .eq('user_id', userId)
          .single();

        if (!pinRecord) {
          return new Response(JSON.stringify({ error: 'No PIN set', needsSetup: true }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Check if locked
        if (pinRecord.locked_until && new Date(pinRecord.locked_until) > new Date()) {
          const lockMinutes = Math.ceil((new Date(pinRecord.locked_until).getTime() - Date.now()) / 60000);
          return new Response(JSON.stringify({ 
            error: `Account locked. Try again in ${lockMinutes} minute(s)`,
            locked: true
          }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify PIN
        const encoder = new TextEncoder();
        const data = encoder.encode(pin + userId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const pinHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (pinHash !== pinRecord.pin_hash) {
          const failedAttempts = (pinRecord.failed_attempts || 0) + 1;
          const updateData: any = { failed_attempts: failedAttempts };
          
          if (failedAttempts >= 5) {
            updateData.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min lockout
          }

          await supabaseAdmin
            .from('admin_pins')
            .update(updateData)
            .eq('user_id', userId);

          return new Response(JSON.stringify({ 
            error: `Invalid PIN. ${5 - failedAttempts} attempts remaining`,
            attemptsRemaining: 5 - failedAttempts
          }), {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Success - update last confirmed and reset attempts
        await supabaseAdmin
          .from('admin_pins')
          .update({
            failed_attempts: 0,
            locked_until: null,
            last_confirmed_at: new Date().toISOString()
          })
          .eq('user_id', userId);

        result = { success: true, confirmedUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString() };
        break;
      }

      case 'reset_account': {
        if (!targetUserId || !resetType) {
          return new Response(JSON.stringify({ error: 'Missing targetUserId or resetType' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get target user's profile
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', targetUserId)
          .single();

        if (!targetProfile) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify same company
        if (targetProfile.company_id !== actorProfile?.company_id) {
          return new Response(JSON.stringify({ error: 'Cannot manage users from different company' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const beforeState = { email: targetProfile.email, account_status: targetProfile.account_status };

        switch (resetType) {
          case 'password_reset':
            // Send password reset email
            const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'recovery',
              email: targetProfile.email,
            });
            if (resetError) throw resetError;
            result = { success: true, message: 'Password reset email sent' };
            break;

          case 'invalidate_sessions':
            // Sign out user from all sessions
            const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(targetUserId, 'global');
            if (signOutError) throw signOutError;
            result = { success: true, message: 'All sessions invalidated' };
            break;

          case 'resend_invitation':
            // Resend invitation via magic link
            const { error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'magiclink',
              email: targetProfile.email,
            });
            if (inviteError) throw inviteError;
            
            // Update status
            await supabaseAdmin
              .from('profiles')
              .update({ account_status: 'invited', invited_at: new Date().toISOString() })
              .eq('user_id', targetUserId);
              
            result = { success: true, message: 'Invitation resent' };
            break;
        }

        // Log action
        await supabaseAdmin.from('admin_action_log').insert({
          actor_user_id: userId,
          action_type: 'RESET_ACCOUNT',
          target_user_id: targetUserId,
          target_crew_id: targetProfile.id,
          before_json: beforeState,
          after_json: { resetType, result: result.message },
          reason
        });

        break;
      }

      case 'toggle_access': {
        if (!targetUserId || enableAccess === undefined) {
          return new Response(JSON.stringify({ error: 'Missing targetUserId or enableAccess' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get target user's profile
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', targetUserId)
          .single();

        if (!targetProfile) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify same company
        if (targetProfile.company_id !== actorProfile?.company_id) {
          return new Response(JSON.stringify({ error: 'Cannot manage users from different company' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const beforeState = { account_status: targetProfile.account_status };
        const newStatus = enableAccess ? 'active' : 'disabled';

        // Update profile status
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({ account_status: newStatus })
          .eq('user_id', targetUserId);

        if (updateError) throw updateError;

        // If disabling, also sign out the user
        if (!enableAccess) {
          await supabaseAdmin.auth.admin.signOut(targetUserId, 'global');
        }

        // Log action
        await supabaseAdmin.from('admin_action_log').insert({
          actor_user_id: userId,
          action_type: 'TOGGLE_ACCESS',
          target_user_id: targetUserId,
          target_crew_id: targetProfile.id,
          before_json: beforeState,
          after_json: { account_status: newStatus },
          reason
        });

        result = { success: true, message: enableAccess ? 'Account enabled' : 'Account disabled', newStatus };
        break;
      }

      case 'reallocate_vessel': {
        if (!targetUserId || !vesselId || !reason) {
          return new Response(JSON.stringify({ error: 'Missing required fields (targetUserId, vesselId, reason)' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get target user's profile
        const { data: targetProfile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('user_id', targetUserId)
          .single();

        if (!targetProfile) {
          return new Response(JSON.stringify({ error: 'User not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Verify same company
        if (targetProfile.company_id !== actorProfile?.company_id) {
          return new Response(JSON.stringify({ error: 'Cannot manage users from different company' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Get current assignment
        const { data: currentAssignment } = await supabaseAdmin
          .from('crew_assignments')
          .select('*, vessels:vessel_id(name)')
          .eq('user_id', targetUserId)
          .eq('is_current', true)
          .single();

        const transferDate = effectiveDate || new Date().toISOString().split('T')[0];
        const beforeState = currentAssignment ? {
          vessel_id: currentAssignment.vessel_id,
          vessel_name: (currentAssignment.vessels as any)?.name,
          position: currentAssignment.position
        } : null;

        // End current assignment if exists
        if (currentAssignment) {
          await supabaseAdmin
            .from('crew_assignments')
            .update({
              is_current: false,
              leave_date: transferDate
            })
            .eq('id', currentAssignment.id);
        }

        // Get vessel name
        const { data: vessel } = await supabaseAdmin
          .from('vessels')
          .select('name')
          .eq('id', vesselId)
          .single();

        // Create new assignment
        const { error: assignError } = await supabaseAdmin
          .from('crew_assignments')
          .insert({
            user_id: targetUserId,
            vessel_id: vesselId,
            position: position || currentAssignment?.position || targetProfile.rank || 'Crew',
            join_date: transferDate,
            end_date: endDate || null,
            is_current: true
          });

        if (assignError) throw assignError;

        const afterState = {
          vessel_id: vesselId,
          vessel_name: vessel?.name,
          position: position || currentAssignment?.position || targetProfile.rank || 'Crew',
          effective_date: transferDate,
          end_date: endDate
        };

        // Log action
        await supabaseAdmin.from('admin_action_log').insert({
          actor_user_id: userId,
          action_type: 'REALLOCATE_VESSEL',
          target_user_id: targetUserId,
          target_crew_id: targetProfile.id,
          before_json: beforeState,
          after_json: afterState,
          reason
        });

        result = { 
          success: true, 
          message: `Vessel assignment updated to ${vessel?.name}`,
          newAssignment: afterState
        };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Admin action error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});