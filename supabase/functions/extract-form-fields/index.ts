import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtractRequest {
  file_url: string;
  file_type?: string;
  template_name?: string;
}

interface ExtractedField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
  pageNumber?: number;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const body: ExtractRequest = await req.json();
    const { file_url, file_type, template_name } = body;

    if (!file_url) {
      return new Response(
        JSON.stringify({ error: 'file_url is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracting form fields from:', file_url, 'Type:', file_type);

    // Build the prompt for AI extraction
    const extractionPrompt = `You are a maritime forms expert. Analyze the following document and extract all form fields that should be converted to digital form fields.

Document URL: ${file_url}
Document Type: ${file_type || 'PDF'}
Template Name: ${template_name || 'Unknown'}

For each field you identify, determine:
1. Field type (text, textarea, checkbox, yes_no, yes_no_na, date, datetime, time, number, dropdown, signature, table, file, section)
2. Field label (the text that describes what should be entered)
3. Whether it's required
4. Any options (for dropdowns)
5. Placeholder text suggestion
6. Which page it's on (if multi-page)

Return a JSON object with this structure:
{
  "extracted_fields": [
    {
      "id": "field_1",
      "type": "text",
      "label": "Vessel Name",
      "required": true,
      "placeholder": "Enter vessel name",
      "pageNumber": 1
    }
  ],
  "pages": [
    { "id": "page_1", "number": 1, "title": "Page 1" }
  ],
  "document_title": "Pre-Departure Checklist",
  "document_description": "Safety checklist completed before vessel departure",
  "confidence": 0.85,
  "notes": "Any observations about the document structure"
}

Focus on identifying:
- Text input fields
- Checkbox items (Yes/No, checkmarks)
- Date/time fields
- Signature blocks
- Tables with repeated entries
- Section headers that group related fields
- Dropdown/select fields with predefined options

For maritime checklists, common field patterns include:
- Equipment status checks (Yes/No/N/A)
- Officer/crew signatures with date/time
- Weather and sea conditions
- Fuel and tank levels (numbers)
- Safety equipment inspection items
- Watch handover entries

Return ONLY valid JSON, no additional text.`;

    // Call Lovable AI Gateway
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a document analysis expert specializing in maritime forms and checklists. You extract form field definitions from documents and return structured JSON.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('AI extraction response received');

    // Parse the JSON response
    let extractedData;
    try {
      // Clean the response - remove markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.slice(7);
      }
      if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.slice(3);
      }
      if (cleanedContent.endsWith('```')) {
        cleanedContent = cleanedContent.slice(0, -3);
      }
      
      extractedData = JSON.parse(cleanedContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw response:', content);
      
      // Return fallback with basic fields
      extractedData = {
        extracted_fields: [
          { id: 'field_1', type: 'text', label: 'Field 1', required: false, pageNumber: 1 },
          { id: 'field_2', type: 'text', label: 'Field 2', required: false, pageNumber: 1 },
        ],
        pages: [{ id: 'page_1', number: 1, title: 'Page 1' }],
        confidence: 0.3,
        notes: 'Fallback extraction - manual adjustment recommended'
      };
    }

    // Ensure field IDs are unique
    const fields: ExtractedField[] = (extractedData.extracted_fields || []).map((field: ExtractedField, index: number) => ({
      ...field,
      id: field.id || `field_${Date.now()}_${index}`,
    }));

    console.log(`Extracted ${fields.length} fields`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_fields: fields,
        pages: extractedData.pages || [{ id: 'page_1', number: 1, title: 'Page 1' }],
        document_title: extractedData.document_title,
        document_description: extractedData.document_description,
        extraction_confidence: extractedData.confidence || 0.7,
        extraction_notes: extractedData.notes,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in extract-form-fields:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        // Return empty structure so UI can still function
        extracted_fields: [],
        pages: [{ id: 'page_1', number: 1, title: 'Page 1' }],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
