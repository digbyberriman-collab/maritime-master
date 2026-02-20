import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtractRequest {
  file_url?: string;
  file_base64?: string;
  file_mime_type?: string;
  document_type?: string;
  hint_title?: string;
}

const SUPPORTED_MULTIMODAL_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const body: ExtractRequest = await req.json();
    const { file_url, file_base64, file_mime_type, document_type, hint_title } = body;

    if (!file_url && !file_base64) {
      return new Response(
        JSON.stringify({ success: false, error: 'file_url or file_base64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let base64 = file_base64 || '';
    let mimeType = file_mime_type || 'application/pdf';

    if (!base64 && file_url) {
      const fileResponse = await fetch(file_url);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download file: ${fileResponse.status}`);
      }

      const fileBuffer = await fileResponse.arrayBuffer();
      const uint8Array = new Uint8Array(fileBuffer);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
      }
      base64 = btoa(binary);

      const contentType = fileResponse.headers.get('content-type');
      if (contentType) {
        mimeType = contentType.split(';')[0].trim();
      }
    }

    const systemPrompt = `You extract operational metadata from maritime documents.
Return ONLY valid JSON with this exact structure:
{
  "title": "best title for the document",
  "description": "concise description",
  "tags": ["tag1", "tag2"],
  "document_number": "document/control/reference number if visible, otherwise null",
  "detected_document_type": "short normalized type",
  "confidence": 0.0,
  "entities": {
    "crew_name": "full person name if visible, otherwise null",
    "vessel_name": "vessel name if visible, otherwise null",
    "booking_reference": "booking reference if visible, otherwise null",
    "origin_location": "origin city/airport/location if visible, otherwise null",
    "destination_location": "destination city/airport/location if visible, otherwise null"
  },
  "dates": {
    "issue_date": "YYYY-MM-DD or null",
    "valid_from": "YYYY-MM-DD or null",
    "valid_until": "YYYY-MM-DD or null",
    "next_review_date": "YYYY-MM-DD or null",
    "travel_date": "YYYY-MM-DD or null"
  }
}
Rules:
- Use null for unknown values.
- tags must be lowercase keywords (max 8).
- confidence must be between 0 and 1.
- Never return markdown or prose, JSON only.`;

    const userText = [
      'Extract metadata from this uploaded document.',
      document_type ? `Document type hint: ${document_type}` : null,
      hint_title ? `Title hint: ${hint_title}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const userContent: Array<Record<string, unknown>> = [
      { type: 'text', text: userText },
    ];

    if (base64 && SUPPORTED_MULTIMODAL_TYPES.has(mimeType)) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
        },
      });
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 2500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI metadata extraction error:', aiResponse.status, errorText);
      throw new Error(`AI metadata extraction failed (${aiResponse.status})`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult?.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('Empty AI response');
    }

    const normalized = parseAndNormalizeResult(content, hint_title);
    return new Response(JSON.stringify({ success: true, ...normalized }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('extract-document-metadata failed:', message);
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
        title: null,
        description: null,
        tags: [],
        document_number: null,
        detected_document_type: null,
        confidence: 0,
        entities: {},
        dates: {},
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

function parseAndNormalizeResult(content: string, hintTitle?: string): Record<string, unknown> {
  let cleaned = content.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(cleaned.trim());
  } catch {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    }
  }

  const title = asNullableString(parsed.title) || asNullableString(hintTitle) || 'Uploaded document';
  const description = asNullableString(parsed.description) || null;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .map((tag) => String(tag || '').toLowerCase().trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const confidenceRaw = Number(parsed.confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.6;

  const entities = (parsed.entities || {}) as Record<string, unknown>;
  const dates = (parsed.dates || {}) as Record<string, unknown>;

  return {
    title,
    description,
    tags,
    document_number: asNullableString(parsed.document_number),
    detected_document_type: asNullableString(parsed.detected_document_type),
    confidence,
    entities: {
      crew_name: asNullableString(entities.crew_name),
      vessel_name: asNullableString(entities.vessel_name),
      booking_reference: asNullableString(entities.booking_reference),
      origin_location: asNullableString(entities.origin_location),
      destination_location: asNullableString(entities.destination_location),
    },
    dates: {
      issue_date: normalizeIsoDate(dates.issue_date),
      valid_from: normalizeIsoDate(dates.valid_from),
      valid_until: normalizeIsoDate(dates.valid_until),
      next_review_date: normalizeIsoDate(dates.next_review_date),
      travel_date: normalizeIsoDate(dates.travel_date),
    },
  };
}

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'unknown') return null;
  return trimmed;
}

function normalizeIsoDate(value: unknown): string | null {
  const normalized = asNullableString(value);
  if (!normalized) return null;
  const datePart = normalized.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
}

