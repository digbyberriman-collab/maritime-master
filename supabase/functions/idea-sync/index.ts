import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IdeaDefect {
  id: string;
  equipmentId: string;
  equipmentName: string;
  description: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'in_progress' | 'pending_parts' | 'closed';
  reportedDate: string;
  dueDate?: string;
}

interface IdeaEquipment {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
  modelNumber: string;
  ismCritical: boolean;
  lastServiceDate?: string;
  nextServiceDue?: string;
  runningHours?: number;
}

interface IdeaSyncRequest {
  vesselId: string;
  syncType?: 'full' | 'incremental';
  since?: string;
}

// Map IDEA priority to our severity
function mapSeverity(priority: string | number): 'critical' | 'major' | 'minor' {
  const p = String(priority).toLowerCase();
  if (p === '1' || p === 'critical' || p === 'high') return 'critical';
  if (p === '2' || p === 'major' || p === 'medium') return 'major';
  return 'minor';
}

// Map IDEA status to our status
function mapStatus(status: string): 'open' | 'in_progress' | 'pending_parts' | 'closed' {
  const s = status.toLowerCase();
  if (s.includes('closed') || s.includes('complete')) return 'closed';
  if (s.includes('progress') || s.includes('work')) return 'in_progress';
  if (s.includes('parts') || s.includes('pending')) return 'pending_parts';
  return 'open';
}

// Fetch data from IDEA API (mock implementation)
async function fetchFromIdea(baseUrl: string, apiKey: string, vesselExternalId: string, endpoint: string): Promise<unknown[]> {
  console.log(`[IDEA] Fetching ${endpoint} for vessel ${vesselExternalId}`);
  
  // In production, this would call the actual IDEA API
  // const response = await fetch(`${baseUrl}/vessels/${vesselExternalId}/${endpoint}`, {
  //   headers: { 'Authorization': `Bearer ${apiKey}` }
  // });
  // return await response.json();
  
  // Mock data for development
  if (endpoint === 'defects') {
    return [
      {
        defect_id: 'DEF-001',
        equipment_id: 'EQ-001',
        equipment_name: 'Main Engine',
        description: 'Oil leak detected at cylinder 3',
        priority: 'major',
        status: 'Open',
        created_at: new Date().toISOString(),
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        defect_id: 'DEF-002',
        equipment_id: 'EQ-002',
        equipment_name: 'Generator #1',
        description: 'Abnormal vibration during operation',
        priority: 'minor',
        status: 'In Progress',
        created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }
  
  if (endpoint === 'equipment') {
    return [
      {
        equipment_id: 'EQ-001',
        name: 'Main Engine',
        category: 'Propulsion',
        manufacturer: 'MAN B&W',
        model: '6S50MC-C',
        ism_critical: true,
        last_service: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        next_service: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
        running_hours: 12500,
      },
      {
        equipment_id: 'EQ-002',
        name: 'Generator #1',
        category: 'Power Generation',
        manufacturer: 'Caterpillar',
        model: 'CAT 3516',
        ism_critical: true,
        last_service: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        next_service: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
        running_hours: 8750,
      },
    ];
  }
  
  return [];
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

    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    let isAuthorized = false;
    let companyId: string | null = null;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: userData } = await supabaseAdmin.auth.getUser(token);
      
      if (userData?.user) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role, company_id')
          .eq('user_id', userData.user.id)
          .single();
        
        if (profile && ['dpa', 'shore_management'].includes(profile.role)) {
          isAuthorized = true;
          companyId = profile.company_id;
        }
      }
    }

    // Allow system-level calls
    const systemKey = req.headers.get('x-system-key');
    if (systemKey === Deno.env.get('SYSTEM_API_KEY')) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new Error('Unauthorized');
    }

    const body: IdeaSyncRequest = await req.json();

    if (!body.vesselId) {
      throw new Error('vesselId is required');
    }

    // Get vessel and its IDEA external ID
    const { data: vessel, error: vesselError } = await supabaseAdmin
      .from('vessels')
      .select('id, name, idea_external_id, company_id')
      .eq('id', body.vesselId)
      .single();

    if (vesselError || !vessel) {
      throw new Error('Vessel not found');
    }

    // Verify company access
    if (companyId && vessel.company_id !== companyId) {
      throw new Error('Access denied to this vessel');
    }

    const ideaApiKey = Deno.env.get('IDEA_API_KEY');
    const ideaBaseUrl = Deno.env.get('IDEA_BASE_URL') || 'https://api.idea-marine.com';
    const vesselExternalId = vessel.idea_external_id || vessel.id;

    let defectsSynced = 0;
    let equipmentSynced = 0;
    const errors: string[] = [];

    // Fetch and sync defects
    try {
      const ideaDefects = await fetchFromIdea(ideaBaseUrl, ideaApiKey || '', vesselExternalId, 'defects') as Array<{
        defect_id: string;
        equipment_id: string;
        equipment_name: string;
        description: string;
        priority: string;
        status: string;
        created_at: string;
        due_date?: string;
      }>;
      
      for (const d of ideaDefects) {
        const mappedDefect = {
          idea_defect_id: d.defect_id,
          vessel_id: body.vesselId,
          equipment_name: d.equipment_name,
          description: d.description,
          severity: mapSeverity(d.priority),
          status: mapStatus(d.status),
          reported_date: d.created_at,
          due_date: d.due_date,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabaseAdmin
          .from('idea_defects_cache')
          .upsert(mappedDefect, { onConflict: 'idea_defect_id' });

        if (error) {
          console.error('Failed to upsert defect:', error);
        } else {
          defectsSynced++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Defects sync failed: ${msg}`);
    }

    // Fetch and sync equipment
    try {
      const ideaEquipment = await fetchFromIdea(ideaBaseUrl, ideaApiKey || '', vesselExternalId, 'equipment') as Array<{
        equipment_id: string;
        name: string;
        category: string;
        manufacturer: string;
        model: string;
        ism_critical: boolean;
        last_service?: string;
        next_service?: string;
        running_hours?: number;
      }>;
      
      for (const e of ideaEquipment) {
        const mappedEquipment = {
          idea_equipment_id: e.equipment_id,
          vessel_id: body.vesselId,
          name: e.name,
          category: e.category,
          manufacturer: e.manufacturer,
          model_number: e.model,
          ism_critical: e.ism_critical,
          last_service_date: e.last_service,
          next_service_due: e.next_service,
          running_hours: e.running_hours,
          synced_at: new Date().toISOString(),
        };

        const { error } = await supabaseAdmin
          .from('idea_equipment_cache')
          .upsert(mappedEquipment, { onConflict: 'idea_equipment_id' });

        if (error) {
          console.error('Failed to upsert equipment:', error);
        } else {
          equipmentSynced++;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Equipment sync failed: ${msg}`);
    }

    // Update sync timestamp
    await supabaseAdmin
      .from('vessels')
      .update({ idea_last_sync: new Date().toISOString() })
      .eq('id', body.vesselId);

    console.log(`IDEA sync complete for ${vessel.name}: ${defectsSynced} defects, ${equipmentSynced} equipment`);

    return new Response(
      JSON.stringify({
        success: true,
        vesselId: body.vesselId,
        vesselName: vessel.name,
        defectsSynced,
        equipmentSynced,
        lastSyncAt: new Date().toISOString(),
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in idea-sync:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
