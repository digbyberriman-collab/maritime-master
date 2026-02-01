import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';
import * as crypto from 'https://deno.land/std@0.190.0/crypto/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-webhook-signature',
};

interface WebhookPayload {
  event_type: 'create' | 'update' | 'delete' | 'sync';
  data_type: 'crew' | 'vessel' | 'document' | 'incident';
  data: Record<string, unknown> | Record<string, unknown>[];
  source_system?: string;
  timestamp?: string;
  idempotency_key?: string;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get webhook secret from header
    const webhookSecret = req.headers.get('x-webhook-secret');
    const webhookSignature = req.headers.get('x-webhook-signature');
    const ipAddress = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: 'Missing x-webhook-secret header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find matching webhook configuration
    const { data: webhookConfig, error: configError } = await supabaseAdmin
      .from('webhook_configurations')
      .select('*, companies(id, name)')
      .eq('webhook_secret', webhookSecret)
      .eq('is_active', true)
      .single();

    if (configError || !webhookConfig) {
      console.error('Invalid webhook secret or inactive configuration');
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive webhook configuration' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check IP whitelist if configured
    if (webhookConfig.allowed_ip_addresses && webhookConfig.allowed_ip_addresses.length > 0) {
      const clientIp = ipAddress.split(',')[0].trim();
      if (!webhookConfig.allowed_ip_addresses.includes(clientIp)) {
        console.error(`IP ${clientIp} not in allowed list`);
        return new Response(
          JSON.stringify({ error: 'IP address not authorized' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse the request body
    const body = await req.text();
    let payload: WebhookPayload;
    
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required fields
    if (!payload.event_type || !payload.data_type || !payload.data) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing required fields',
          required: ['event_type', 'data_type', 'data'],
          received: { event_type: payload.event_type, data_type: payload.data_type, has_data: !!payload.data }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if data type is allowed
    if (!webhookConfig.allowed_data_types.includes(payload.data_type)) {
      return new Response(
        JSON.stringify({ 
          error: `Data type '${payload.data_type}' not allowed for this webhook`,
          allowed: webhookConfig.allowed_data_types
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create webhook event record
    const { data: webhookEvent, error: eventError } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        webhook_config_id: webhookConfig.id,
        company_id: webhookConfig.company_id,
        event_type: payload.event_type,
        data_type: payload.data_type,
        payload: payload,
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (eventError) {
      console.error('Failed to create webhook event:', eventError);
      return new Response(
        JSON.stringify({ error: 'Failed to log webhook event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process the data based on type
    let recordsCreated = 0;
    let recordsUpdated = 0;
    let recordsFailed = 0;
    const errors: string[] = [];
    const dataArray = Array.isArray(payload.data) ? payload.data : [payload.data];

    for (const record of dataArray) {
      try {
        const result = await processRecord(
          supabaseAdmin,
          webhookConfig.company_id,
          payload.data_type,
          payload.event_type,
          record
        );
        
        if (result.created) recordsCreated++;
        if (result.updated) recordsUpdated++;
      } catch (err) {
        recordsFailed++;
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        errors.push(errorMessage);
        console.error(`Failed to process record:`, err);
      }
    }

    // Update webhook event with results
    const finalStatus = recordsFailed === dataArray.length ? 'failed' : 
                        recordsFailed > 0 ? 'partial' : 'completed';

    await supabaseAdmin
      .from('webhook_events')
      .update({
        status: finalStatus,
        processing_completed_at: new Date().toISOString(),
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
      .eq('id', webhookEvent.id);

    // Update last_used_at on webhook config
    await supabaseAdmin
      .from('webhook_configurations')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', webhookConfig.id);

    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        event_id: webhookEvent.id,
        status: finalStatus,
        summary: {
          total: dataArray.length,
          created: recordsCreated,
          updated: recordsUpdated,
          failed: recordsFailed,
        },
        processing_time_ms: processingTime,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: finalStatus === 'failed' ? 207 : 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Webhook processing error:', errorMessage);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseAdminClient = any;

async function processRecord(
  supabase: SupabaseAdminClient,
  companyId: string,
  dataType: string,
  eventType: string,
  record: Record<string, unknown>
): Promise<{ created: boolean; updated: boolean }> {
  
  switch (dataType) {
    case 'crew':
      return processCrewRecord(supabase, companyId, eventType, record);
    case 'vessel':
      return processVesselRecord(supabase, companyId, eventType, record);
    case 'document':
      return processDocumentRecord(supabase, companyId, eventType, record);
    case 'incident':
      return processIncidentRecord(supabase, companyId, eventType, record);
    default:
      throw new Error(`Unsupported data type: ${dataType}`);
  }
}

async function processCrewRecord(
  supabase: SupabaseAdminClient,
  companyId: string,
  eventType: string,
  record: Record<string, unknown>
): Promise<{ created: boolean; updated: boolean }> {
  // Map external crew data to profiles table
  const externalId = record.external_id as string || record.id as string;
  
  if (!externalId) {
    throw new Error('Crew record must have external_id or id');
  }

  // Check if profile exists by external reference
  const { data: existing }: { data: { id: string; user_id: string } | null } = await supabase
    .from('profiles')
    .select('id, user_id')
    .eq('company_id', companyId)
    .eq('employee_number', externalId)
    .single();

  const profileData = {
    company_id: companyId,
    employee_number: externalId,
    first_name: record.first_name as string || record.firstName as string,
    last_name: record.last_name as string || record.lastName as string,
    rank: record.rank as string || record.position as string,
    nationality: record.nationality as string,
    email: record.email as string,
    phone: record.phone as string || record.mobile as string,
    date_of_birth: record.date_of_birth as string || record.dob as string,
    passport_number: record.passport_number as string,
    passport_expiry: record.passport_expiry as string,
    seaman_book_number: record.seaman_book_number as string || record.cdc_number as string,
    status: mapCrewStatus(record.status as string),
  };

  // Filter out undefined values
  const cleanData = Object.fromEntries(
    Object.entries(profileData).filter(([_, v]) => v !== undefined && v !== null)
  );

  if (eventType === 'delete' && existing) {
    await supabase
      .from('profiles')
      .update({ status: 'inactive' })
      .eq('id', existing.id);
    return { created: false, updated: true };
  }

  if (existing) {
    await supabase
      .from('profiles')
      .update(cleanData)
      .eq('id', existing.id);
    return { created: false, updated: true };
  } else if (eventType !== 'delete') {
    // For new crew, we can only create a profile if we have required fields
    if (!cleanData.first_name || !cleanData.last_name) {
      throw new Error('New crew record requires first_name and last_name');
    }
    
    await supabase
      .from('profiles')
      .insert(cleanData);
    return { created: true, updated: false };
  }

  return { created: false, updated: false };
}

async function processVesselRecord(
  supabase: SupabaseAdminClient,
  companyId: string,
  eventType: string,
  record: Record<string, unknown>
): Promise<{ created: boolean; updated: boolean }> {
  const imoNumber = record.imo_number as string || record.imo as string;
  const mmsi = record.mmsi as string;
  
  if (!imoNumber && !mmsi) {
    throw new Error('Vessel record must have imo_number or mmsi');
  }

  // Find existing vessel
  let query = supabase.from('vessels').select('id').eq('company_id', companyId);
  if (imoNumber) {
    query = query.eq('imo_number', imoNumber);
  } else if (mmsi) {
    query = query.eq('mmsi', mmsi);
  }
  
  const { data: existing }: { data: { id: string } | null } = await query.single();

  const vesselData = {
    company_id: companyId,
    name: record.name as string || record.vessel_name as string,
    imo_number: imoNumber,
    mmsi: mmsi,
    call_sign: record.call_sign as string,
    flag_state: record.flag_state as string || record.flag as string,
    vessel_type: record.vessel_type as string || record.type as string,
    gross_tonnage: record.gross_tonnage as number,
    net_tonnage: record.net_tonnage as number,
    deadweight: record.deadweight as number || record.dwt as number,
    year_built: record.year_built as number,
    classification_society: record.classification_society as string || record.class as string,
    port_of_registry: record.port_of_registry as string,
    status: record.status as string || 'Active',
  };

  const cleanData = Object.fromEntries(
    Object.entries(vesselData).filter(([_, v]) => v !== undefined && v !== null)
  );

  if (eventType === 'delete' && existing) {
    await supabase
      .from('vessels')
      .update({ status: 'Sold' })
      .eq('id', existing.id);
    return { created: false, updated: true };
  }

  if (existing) {
    await supabase
      .from('vessels')
      .update(cleanData)
      .eq('id', existing.id);
    return { created: false, updated: true };
  } else if (eventType !== 'delete') {
    if (!cleanData.name) {
      throw new Error('New vessel record requires name');
    }
    
    await supabase.from('vessels').insert(cleanData);
    return { created: true, updated: false };
  }

  return { created: false, updated: false };
}

async function processDocumentRecord(
  supabase: SupabaseAdminClient,
  companyId: string,
  eventType: string,
  record: Record<string, unknown>
): Promise<{ created: boolean; updated: boolean }> {
  const documentNumber = record.document_number as string || record.doc_number as string;
  
  if (!documentNumber) {
    throw new Error('Document record must have document_number');
  }

  const { data: existing }: { data: { id: string } | null } = await supabase
    .from('documents')
    .select('id')
    .eq('company_id', companyId)
    .eq('document_number', documentNumber)
    .single();

  // Resolve vessel_id if vessel name or IMO provided
  let vesselId = record.vessel_id as string;
  if (!vesselId && (record.vessel_name || record.vessel_imo)) {
    const { data: vessel }: { data: { id: string } | null } = await supabase
      .from('vessels')
      .select('id')
      .eq('company_id', companyId)
      .or(`name.eq.${record.vessel_name},imo_number.eq.${record.vessel_imo}`)
      .single();
    vesselId = vessel?.id as string;
  }

  const documentData = {
    company_id: companyId,
    vessel_id: vesselId,
    document_number: documentNumber,
    title: record.title as string || record.document_title as string,
    category: record.category as string,
    status: record.status as string || 'active',
    issue_date: record.issue_date as string,
    next_review_date: record.next_review_date as string || record.review_date as string,
    file_url: record.file_url as string || record.url as string,
    notes: record.notes as string || record.description as string,
  };

  const cleanData = Object.fromEntries(
    Object.entries(documentData).filter(([_, v]) => v !== undefined && v !== null)
  );

  if (eventType === 'delete' && existing) {
    await supabase
      .from('documents')
      .update({ status: 'archived' })
      .eq('id', existing.id);
    return { created: false, updated: true };
  }

  if (existing) {
    await supabase.from('documents').update(cleanData).eq('id', existing.id);
    return { created: false, updated: true };
  } else if (eventType !== 'delete') {
    if (!cleanData.title) {
      throw new Error('New document record requires title');
    }
    
    await supabase.from('documents').insert(cleanData);
    return { created: true, updated: false };
  }

  return { created: false, updated: false };
}

async function processIncidentRecord(
  supabase: SupabaseAdminClient,
  companyId: string,
  eventType: string,
  record: Record<string, unknown>
): Promise<{ created: boolean; updated: boolean }> {
  const incidentNumber = record.incident_number as string || record.reference as string;
  
  // Resolve vessel_id
  let vesselId = record.vessel_id as string;
  if (!vesselId && (record.vessel_name || record.vessel_imo)) {
    const { data: vessel }: { data: { id: string } | null } = await supabase
      .from('vessels')
      .select('id')
      .eq('company_id', companyId)
      .or(`name.eq.${record.vessel_name},imo_number.eq.${record.vessel_imo}`)
      .single();
    vesselId = vessel?.id as string;
  }

  if (!vesselId) {
    throw new Error('Incident record must have vessel_id or valid vessel_name/vessel_imo');
  }

  let existing: { id: string } | null = null;
  if (incidentNumber) {
    const { data }: { data: { id: string } | null } = await supabase
      .from('incidents')
      .select('id')
      .eq('company_id', companyId)
      .eq('incident_number', incidentNumber)
      .single();
    existing = data;
  }

  const incidentData = {
    company_id: companyId,
    vessel_id: vesselId,
    incident_number: incidentNumber,
    incident_type: mapIncidentType(record.incident_type as string || record.type as string),
    title: record.title as string || record.description as string,
    description: record.description as string || record.details as string,
    incident_date: record.incident_date as string || record.date as string,
    incident_time: record.incident_time as string || record.time as string,
    location: record.location as string,
    severity: mapSeverity(record.severity as string),
    status: record.status as string || 'reported',
    reported_by_name: record.reported_by as string || record.reporter as string,
  };

  const cleanData = Object.fromEntries(
    Object.entries(incidentData).filter(([_, v]) => v !== undefined && v !== null)
  );

  if (eventType === 'delete' && existing) {
    // Incidents should not be deleted, only closed
    await supabase
      .from('incidents')
      .update({ status: 'closed' })
      .eq('id', existing.id);
    return { created: false, updated: true };
  }

  if (existing) {
    await supabase.from('incidents').update(cleanData).eq('id', existing.id);
    return { created: false, updated: true };
  } else if (eventType !== 'delete') {
    if (!cleanData.title || !cleanData.incident_type) {
      throw new Error('New incident record requires title and incident_type');
    }
    
    await supabase.from('incidents').insert(cleanData);
    return { created: true, updated: false };
  }

  return { created: false, updated: false };
}

// Helper mapping functions
function mapCrewStatus(status: string | undefined): string {
  if (!status) return 'onboard';
  const statusMap: Record<string, string> = {
    'active': 'onboard',
    'on_leave': 'on_leave',
    'leave': 'on_leave',
    'shore': 'on_leave',
    'terminated': 'inactive',
    'inactive': 'inactive',
    'pending': 'pending_join',
  };
  return statusMap[status.toLowerCase()] || status;
}

function mapIncidentType(type: string | undefined): string {
  if (!type) return 'other';
  const typeMap: Record<string, string> = {
    'injury': 'personal_injury',
    'accident': 'accident',
    'near_miss': 'near_miss',
    'nearmiss': 'near_miss',
    'environmental': 'environmental',
    'pollution': 'environmental',
    'security': 'security_breach',
    'equipment': 'equipment_failure',
    'damage': 'property_damage',
  };
  return typeMap[type.toLowerCase()] || type;
}

function mapSeverity(severity: string | undefined): string {
  if (!severity) return 'low';
  const severityMap: Record<string, string> = {
    'critical': 'critical',
    'high': 'high',
    'major': 'high',
    'medium': 'medium',
    'moderate': 'medium',
    'low': 'low',
    'minor': 'low',
  };
  return severityMap[severity.toLowerCase()] || 'low';
}
