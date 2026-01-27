import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Navigation status codes
const NAV_STATUS_CODES: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by her draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  15: 'Undefined',
};

interface AISPosition {
  mmsi: string;
  latitude: number;
  longitude: number;
  sog: number;
  cog: number;
  heading?: number;
  navStatus: string;
  timestampUtc: string;
}

interface AISRefreshRequest {
  vesselIds?: string[];
  mmsiList?: string[];
  forceRefresh?: boolean;
}

// In-memory cache for demo purposes (in production, use Redis or DB cache)
const positionCache = new Map<string, { position: AISPosition; cachedAt: Date }>();
const CACHE_TTL_MINUTES = 5;

function isCacheValid(cachedAt: Date): boolean {
  const ageMinutes = (Date.now() - cachedAt.getTime()) / 1000 / 60;
  return ageMinutes < CACHE_TTL_MINUTES;
}

// Mock AIS data generator (replace with actual API calls)
function generateMockAISData(mmsi: string): AISPosition {
  // Generate realistic-looking mock data
  const baseLat = 25.0 + Math.random() * 20; // Around Mediterranean/Caribbean
  const baseLng = -80.0 + Math.random() * 100;
  
  return {
    mmsi,
    latitude: baseLat,
    longitude: baseLng,
    sog: Math.round(Math.random() * 15 * 10) / 10, // 0-15 knots
    cog: Math.round(Math.random() * 360),
    heading: Math.round(Math.random() * 360),
    navStatus: NAV_STATUS_CODES[Math.floor(Math.random() * 9)] || 'Under way using engine',
    timestampUtc: new Date().toISOString(),
  };
}

// MarineTraffic API integration (placeholder)
async function fetchFromMarineTraffic(apiKey: string, mmsiList: string[]): Promise<AISPosition[]> {
  // In production, this would call the actual MarineTraffic API
  // https://services.marinetraffic.com/api/exportvessels/...
  
  console.log(`[MarineTraffic] Fetching positions for ${mmsiList.length} vessels`);
  
  // For now, return mock data
  return mmsiList.map(mmsi => generateMockAISData(mmsi));
}

// VesselFinder API integration (placeholder)
async function fetchFromVesselFinder(apiKey: string, mmsiList: string[]): Promise<AISPosition[]> {
  console.log(`[VesselFinder] Fetching positions for ${mmsiList.length} vessels`);
  return mmsiList.map(mmsi => generateMockAISData(mmsi));
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

    // This can be called by a cron job or system trigger
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

    // Also allow system-level calls (e.g., from cron)
    const systemKey = req.headers.get('x-system-key');
    if (systemKey === Deno.env.get('SYSTEM_API_KEY')) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      throw new Error('Unauthorized');
    }

    const body: AISRefreshRequest = req.method === 'POST' ? await req.json() : {};

    // Get vessels to update
    let query = supabaseAdmin
      .from('vessels')
      .select('id, mmsi_number, name')
      .not('mmsi_number', 'is', null);

    if (companyId) {
      query = query.eq('company_id', companyId);
    }

    if (body.vesselIds && body.vesselIds.length > 0) {
      query = query.in('id', body.vesselIds);
    }

    const { data: vessels, error: vesselError } = await query;

    if (vesselError) {
      throw new Error(`Failed to fetch vessels: ${vesselError.message}`);
    }

    if (!vessels || vessels.length === 0) {
      return new Response(
        JSON.stringify({ success: true, positionsUpdated: 0, message: 'No vessels with MMSI found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const mmsiList = body.mmsiList || vessels.map(v => v.mmsi_number).filter(Boolean);
    const mmsiToVesselId = new Map(vessels.map(v => [v.mmsi_number, v.id]));

    // Check cache for non-forced refreshes
    const uncachedMmsi: string[] = [];
    const cachedPositions: AISPosition[] = [];

    if (!body.forceRefresh) {
      for (const mmsi of mmsiList) {
        const cached = positionCache.get(mmsi);
        if (cached && isCacheValid(cached.cachedAt)) {
          cachedPositions.push(cached.position);
        } else {
          uncachedMmsi.push(mmsi);
        }
      }
    } else {
      uncachedMmsi.push(...mmsiList);
    }

    // Fetch from AIS providers
    let fetchedPositions: AISPosition[] = [];
    const errors: string[] = [];

    if (uncachedMmsi.length > 0) {
      const aisApiKey = Deno.env.get('AIS_API_KEY');
      const aisProvider = Deno.env.get('AIS_PROVIDER') || 'mock';

      try {
        if (aisProvider === 'marinetraffic' && aisApiKey) {
          fetchedPositions = await fetchFromMarineTraffic(aisApiKey, uncachedMmsi);
        } else if (aisProvider === 'vesselfinder' && aisApiKey) {
          fetchedPositions = await fetchFromVesselFinder(aisApiKey, uncachedMmsi);
        } else {
          // Mock data for development
          fetchedPositions = uncachedMmsi.map(mmsi => generateMockAISData(mmsi));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`Provider error: ${errorMessage}`);
        console.error('AIS provider error:', error);
      }
    }

    // Update cache and database
    const allPositions = [...cachedPositions, ...fetchedPositions];
    let positionsUpdated = 0;

    for (const position of fetchedPositions) {
      // Update cache
      positionCache.set(position.mmsi, { position, cachedAt: new Date() });

      // Store in database
      const vesselId = mmsiToVesselId.get(position.mmsi);
      if (vesselId) {
        const { error: insertError } = await supabaseAdmin
          .from('ais_snapshots')
          .insert({
            vessel_id: vesselId,
            latitude: position.latitude,
            longitude: position.longitude,
            sog: position.sog,
            cog: position.cog,
            heading: position.heading,
            nav_status: position.navStatus,
            timestamp_utc: position.timestampUtc,
            source_provider: Deno.env.get('AIS_PROVIDER') || 'mock',
            raw_data: position,
          });

        if (insertError) {
          console.error(`Failed to insert AIS snapshot for ${position.mmsi}:`, insertError);
        } else {
          positionsUpdated++;
        }
      }
    }

    console.log(`AIS refresh complete: ${positionsUpdated} positions updated`);

    return new Response(
      JSON.stringify({
        success: true,
        positionsUpdated,
        totalVessels: mmsiList.length,
        fromCache: cachedPositions.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in ais-refresh:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
