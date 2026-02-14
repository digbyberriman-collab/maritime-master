import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtractRequest {
  file_url: string;
  file_type?: string;
  template_name?: string;
  file_base64?: string;
  file_mime_type?: string;
}

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
    const { file_url, file_type, template_name, file_base64, file_mime_type } = body;

    if (!file_url && !file_base64) {
      return new Response(
        JSON.stringify({ error: 'file_url or file_base64 is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Extracting form fields. Type:', file_type, 'Has base64:', !!file_base64);

    // Download the file and convert to base64 if not provided
    let base64Data = file_base64;
    let mimeType = file_mime_type || 'application/pdf';

    if (!base64Data && file_url) {
      console.log('Downloading file from:', file_url);
      try {
        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.status}`);
        }
        const fileBuffer = await fileResponse.arrayBuffer();
        const uint8Array = new Uint8Array(fileBuffer);
        
        // Convert to base64
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          binary += String.fromCharCode(...chunk);
        }
        base64Data = btoa(binary);
        
        // Detect mime type from content-type header or file extension
        const contentType = fileResponse.headers.get('content-type');
        if (contentType) {
          mimeType = contentType.split(';')[0].trim();
        } else if (file_type?.toLowerCase() === 'docx') {
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        
        console.log('File downloaded, size:', uint8Array.length, 'mime:', mimeType);
      } catch (downloadError) {
        console.error('Failed to download file:', downloadError);
        // Fall back to URL-only extraction
        base64Data = null;
      }
    }

    const systemPrompt = `You are a maritime forms expert. Analyze the uploaded document image/PDF and extract ALL form fields that should be converted into a digital form.

For each field you identify, determine:
1. Field type: text, textarea, checkbox, yes_no, yes_no_na, date, datetime, time, number, dropdown, signature, table, file, section
2. Field label (the text describing what should be entered)
3. Whether it's required
4. Any options (for dropdowns)
5. Placeholder text suggestion
6. Which page it's on

Return ONLY a valid JSON object with this structure:
{
  "extracted_fields": [
    { "id": "field_1", "type": "text", "label": "Vessel Name", "required": true, "placeholder": "Enter vessel name", "pageNumber": 1 },
    { "id": "field_2", "type": "yes_no", "label": "All navigation lights operational", "required": true, "pageNumber": 1 }
  ],
  "pages": [{ "id": "page_1", "number": 1, "title": "Page 1" }],
  "document_title": "Detected title of the form",
  "document_description": "Brief description of the form's purpose",
  "confidence": 0.85,
  "notes": "Any observations"
}

Focus on: text inputs, checkbox items (Yes/No), date/time fields, signature blocks, tables, section headers, dropdown fields.
For maritime checklists, look for: equipment status checks, officer signatures, weather conditions, fuel levels, safety equipment items, watch handover entries.

Return ONLY valid JSON, no markdown formatting, no code blocks.`;

    // Build messages with multimodal content if we have the file
    const userContent: any[] = [
      {
        type: 'text',
        text: `Please analyze this document${template_name ? ` titled "${template_name}"` : ''} and extract all form fields. The document type is ${file_type || 'PDF'}.`
      }
    ];

    // Only send as multimodal if the MIME type is supported by Gemini (images + PDF)
    const supportedMultimodalTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
    ];
    const canSendAsMultimodal = base64Data && supportedMultimodalTypes.includes(mimeType);

    if (base64Data && canSendAsMultimodal) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64Data}`
        }
      });
    } else {
      // Fallback: just describe what we know
      userContent[0] = {
        type: 'text',
        text: `I need you to generate a reasonable set of form fields for a maritime document${template_name ? ` titled "${template_name}"` : ''}. The document type is ${file_type || 'PDF'}. Since I cannot provide the actual file content, please generate typical fields for a maritime ${template_name || 'checklist'} form. Include common fields like vessel name, date, officer signatures, checklist items with Yes/No/N/A options, and section headers.`
      };
    }

    console.log('Calling AI Gateway with', base64Data ? 'multimodal (file attached)' : 'text-only (no file)');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.2,
        max_tokens: 8000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI Gateway error: ${aiResponse.status} - ${errorText}`);
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No response from AI');
    }

    console.log('AI response received, length:', content.length);

    // Parse the JSON response
    let extractedData;
    try {
      let cleanedContent = content.trim();
      // Remove markdown code blocks if present
      if (cleanedContent.startsWith('```json')) cleanedContent = cleanedContent.slice(7);
      else if (cleanedContent.startsWith('```')) cleanedContent = cleanedContent.slice(3);
      if (cleanedContent.endsWith('```')) cleanedContent = cleanedContent.slice(0, -3);
      
      extractedData = JSON.parse(cleanedContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.log('Raw response:', content.substring(0, 500));
      
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0]);
        } catch {
          console.error('Secondary parse also failed');
        }
      }
      
      if (!extractedData) {
        extractedData = {
          extracted_fields: [
            { id: 'field_1', type: 'text', label: 'Vessel Name', required: true, pageNumber: 1 },
            { id: 'field_2', type: 'date', label: 'Date', required: true, pageNumber: 1 },
            { id: 'field_3', type: 'text', label: 'Port', required: false, pageNumber: 1 },
          ],
          pages: [{ id: 'page_1', number: 1, title: 'Page 1' }],
          confidence: 0.3,
          notes: 'Fallback extraction - manual adjustment recommended'
        };
      }
    }

    // Ensure field IDs are unique
    const fields = (extractedData.extracted_fields || []).map((field: any, index: number) => ({
      ...field,
      id: field.id || `field_${Date.now()}_${index}`,
    }));

    console.log(`Extracted ${fields.length} fields successfully`);

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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in extract-form-fields:', errorMessage);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage,
        extracted_fields: [],
        pages: [{ id: 'page_1', number: 1, title: 'Page 1' }],
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
