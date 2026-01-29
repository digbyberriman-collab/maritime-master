import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FlightData {
  airline: string;
  flightNumber: string;
  departureAirport: string;
  departureCity: string;
  departureDateTime: string;
  arrivalAirport: string;
  arrivalCity: string;
  arrivalDateTime: string;
  bookingClass?: string;
  terminal?: string;
}

interface ExtractionResult {
  passengerName: string;
  bookingReference?: string;
  ticketNumber?: string;
  flights: FlightData[];
  confidence: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { filePath, documentType, base64Content } = await req.json();

    if (!filePath && !base64Content) {
      throw new Error("Either filePath or base64Content is required");
    }

    let fileBase64 = base64Content;
    let mimeType = "application/pdf";

    // If filePath provided, download from storage
    if (filePath && !base64Content) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      const { data: fileData, error: downloadError } = await supabase.storage
        .from("crew-travel-documents")
        .download(filePath);

      if (downloadError) {
        throw new Error(`Failed to download file: ${downloadError.message}`);
      }

      const arrayBuffer = await fileData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      fileBase64 = btoa(String.fromCharCode(...uint8Array));
      
      // Determine MIME type from file extension
      if (filePath.toLowerCase().endsWith('.png')) {
        mimeType = "image/png";
      } else if (filePath.toLowerCase().endsWith('.jpg') || filePath.toLowerCase().endsWith('.jpeg')) {
        mimeType = "image/jpeg";
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build extraction prompt based on document type
    const extractionPrompt = buildExtractionPrompt(documentType);

    // Call Lovable AI Gateway with vision capabilities
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert at extracting structured data from travel documents. Extract flight information accurately and return it as valid JSON only. If you cannot extract certain fields, use null. Be precise with airport codes (3-letter IATA codes), dates (ISO 8601 format), and passenger names.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${fileBase64}`,
                },
              },
              {
                type: "text",
                text: extractionPrompt,
              },
            ],
          },
        ],
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse the JSON from AI response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON found in response:", content);
      throw new Error("Failed to extract structured data from document");
    }

    const extractedData: ExtractionResult = JSON.parse(jsonMatch[0]);

    // Add confidence score based on completeness
    extractedData.confidence = calculateConfidence(extractedData);

    console.log("Extracted flight data:", JSON.stringify(extractedData, null, 2));

    return new Response(JSON.stringify(extractedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Flight data extraction error:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred",
        flights: [],
        passengerName: null,
        confidence: 0,
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildExtractionPrompt(documentType: string): string {
  const basePrompt = `Extract the following information from this travel document and return it as a JSON object:

{
  "passengerName": "Full name as shown on document",
  "bookingReference": "PNR or booking reference code",
  "ticketNumber": "E-ticket number if available",
  "flights": [
    {
      "airline": "Airline name",
      "flightNumber": "Flight number (e.g., BA123)",
      "departureAirport": "3-letter IATA code",
      "departureCity": "City name",
      "departureDateTime": "ISO 8601 format (YYYY-MM-DDTHH:mm:ss)",
      "arrivalAirport": "3-letter IATA code",
      "arrivalCity": "City name", 
      "arrivalDateTime": "ISO 8601 format",
      "bookingClass": "Class code if shown",
      "terminal": "Terminal number if shown"
    }
  ]
}`;

  const typeSpecificInstructions: Record<string, string> = {
    flight_ticket: `\n\nThis is a flight ticket. Look for:
- Passenger name (usually at top)
- Flight details including flight number, route, dates/times
- Booking reference / PNR
- E-ticket number`,
    
    e_ticket: `\n\nThis is an e-ticket/electronic ticket receipt. Extract:
- Passenger name
- E-ticket number (usually 13 digits starting with airline code)
- All flight segments with full details
- Booking reference`,
    
    boarding_pass: `\n\nThis is a boarding pass. Extract:
- Passenger name
- Flight number and date
- Departure and arrival airports
- Gate and seat if shown
- Boarding time`,
    
    itinerary: `\n\nThis is a travel itinerary. Extract all flight segments with:
- Complete passenger information
- All connecting flights in order
- Departure and arrival times for each segment`,
  };

  return basePrompt + (typeSpecificInstructions[documentType] || "");
}

function calculateConfidence(data: ExtractionResult): number {
  let score = 0;
  const maxScore = 10;

  if (data.passengerName) score += 2;
  if (data.bookingReference) score += 1;
  if (data.flights && data.flights.length > 0) {
    score += 2;
    const flight = data.flights[0];
    if (flight.departureAirport && flight.departureAirport.length === 3) score += 1;
    if (flight.arrivalAirport && flight.arrivalAirport.length === 3) score += 1;
    if (flight.departureDateTime) score += 1;
    if (flight.arrivalDateTime) score += 1;
    if (flight.flightNumber) score += 1;
  }

  return Math.round((score / maxScore) * 100) / 100;
}
