import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();

    if (!query || query.length < 2) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use OpenStreetMap Nominatim for free global geocoding
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '8');
    url.searchParams.set('accept-language', 'en');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'InkfishMaritimeApp/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform to our format
    const results = data.map((item: any) => {
      const addr = item.address || {};
      const country = addr.country || '';
      const countryCode = addr.country_code?.toUpperCase() || '';
      
      // Derive region from lat/lon
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      const region = deriveRegion(lat, lon);
      const area = deriveArea(lat, lon);

      return {
        display_name: item.display_name,
        name: item.name || item.display_name.split(',')[0].trim(),
        country,
        country_code: countryCode,
        region,
        area,
        latitude: lat,
        longitude: lon,
        type: item.type,
        osm_id: item.osm_id,
      };
    });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Geocode search error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', results: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function deriveRegion(lat: number, lon: number): string {
  if (lat > 60) return 'Northern Europe';
  if (lat > 35 && lon >= -10 && lon <= 40) return 'Mediterranean';
  if (lat > 23 && lat <= 35 && lon >= -130 && lon <= -60) return 'North America';
  if (lat > 0 && lat <= 23 && lon >= -120 && lon <= -60) return 'Central America & Caribbean';
  if (lat <= 0 && lon >= -80 && lon <= -30) return 'South America';
  if (lat > 0 && lon >= 40 && lon <= 75) return 'Middle East';
  if (lat > 0 && lat <= 35 && lon >= 75) return 'South & Southeast Asia';
  if (lat > 35 && lon > 40) return 'East Asia';
  if (lat <= 0 && lon >= 90 && lon <= 180) return 'Oceania';
  if (lat > 0 && lat <= 35 && lon >= -30 && lon <= 40) return 'West Africa';
  if (lat <= 0 && lon >= 10 && lon <= 55) return 'East Africa';
  if (lat > 35 && lon >= -10 && lon <= 40) return 'Mediterranean';
  return 'International';
}

function deriveArea(lat: number, lon: number): string {
  if (lon >= -100 && lon <= -10 && lat >= 0 && lat <= 35) return 'Caribbean Sea';
  if (lon >= -10 && lon <= 40 && lat >= 30 && lat <= 46) return 'Mediterranean Sea';
  if (lon >= 90 && lon <= 140 && lat >= -10 && lat <= 25) return 'South China Sea';
  if (lon >= 30 && lon <= 75 && lat >= -40 && lat <= 30) return 'Indian Ocean';
  if (lon >= 140 && lat >= -50 && lat <= 0) return 'South Pacific';
  if (lon >= -80 && lon <= -10 && lat >= 0 && lat <= 60) return 'North Atlantic';
  if (lon >= -80 && lon <= -10 && lat < 0) return 'South Atlantic';
  if (lon >= -180 && lon <= -100 && lat >= 0) return 'North Pacific';
  return 'Open Ocean';
}
