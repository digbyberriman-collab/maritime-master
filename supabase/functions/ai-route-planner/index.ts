import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Destination {
  name: string;
  country: string;
  lat: number;
  lng: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { destinations, vesselName, year } = await req.json() as {
      destinations: Destination[];
      vesselName?: string;
      year?: number;
    };

    if (!destinations || destinations.length < 2) {
      return new Response(
        JSON.stringify({ error: "At least 2 destinations are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const targetYear = year || new Date().getFullYear() + 1;
    const vesselContext = vesselName ? `for the superyacht "${vesselName}"` : "for a superyacht";

    const systemPrompt = `You are an expert superyacht itinerary planner and routing specialist. You have deep knowledge of:
- Seasonal weather patterns and optimal cruising windows for every major yachting region
- Transit distances and typical passage times between ports (in nautical miles and days at 12-14 knot cruising speed)
- Charter market demand by season and region
- Port facilities, marinas, and anchorages worldwide
- Repositioning logistics (transatlantic, transpacific crossings)
- Hurricane/cyclone seasons and avoidance
- Mediterranean summer vs Caribbean winter patterns
- Southeast Asia monsoon seasons
- South Pacific cyclone seasons

When planning routes, always consider:
1. Best months to visit each destination for weather, activities, and charter demand
2. Logical geographic flow to minimize unnecessary backtracking
3. Transit time between locations (assume 12-14 knot cruising speed)
4. Repositioning transits that can be combined with interesting stopovers
5. Mandatory seasonal moves (e.g., leaving Caribbean before hurricane season June-Nov)

Return your response as valid JSON only, no markdown.`;

    const userPrompt = `Plan an optimized annual itinerary ${vesselContext} for the year ${targetYear}, visiting these destinations:

${destinations.map((d, i) => `${i + 1}. ${d.name}, ${d.country} (${d.lat.toFixed(2)}°, ${d.lng.toFixed(2)}°)`).join('\n')}

Return a JSON object with this exact structure:
{
  "route_summary": "Brief 2-sentence overview of the proposed route",
  "total_transit_nm": <estimated total nautical miles>,
  "legs": [
    {
      "order": 1,
      "destination": "Location name",
      "country": "Country",
      "lat": <latitude>,
      "lng": <longitude>,
      "arrival_date": "YYYY-MM-DD",
      "departure_date": "YYYY-MM-DD",
      "stay_days": <number>,
      "season_rating": "excellent" | "good" | "fair" | "poor",
      "season_notes": "Why this time of year is ideal/suitable",
      "transit_from_previous": {
        "distance_nm": <nautical miles from previous stop>,
        "transit_days": <estimated days>,
        "notes": "Route notes, waypoints, or considerations"
      }
    }
  ],
  "repositioning_notes": "Notes about any major repositioning transits",
  "weather_warnings": "Key weather considerations for this route"
}

Make sure the first leg has transit_from_previous as null. Order the destinations for the most logical seasonal flow, not necessarily the order given. Add transit legs between distant locations if needed.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No content in AI response");
    }

    // Parse JSON from AI response (strip markdown fences if present)
    let routeData;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      routeData = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI response:", content);
      throw new Error("Failed to parse route plan from AI");
    }

    return new Response(JSON.stringify(routeData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Route planner error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
