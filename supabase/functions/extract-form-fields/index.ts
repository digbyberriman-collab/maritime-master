import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import mammoth from 'npm:mammoth@1.8.0';

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
    let fileBytes: Uint8Array | null = null;

    if (!base64Data && file_url) {
      console.log('Downloading file from:', file_url);
      try {
        const fileResponse = await fetch(file_url);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.status}`);
        }
        const fileBuffer = await fileResponse.arrayBuffer();
        const uint8Array = new Uint8Array(fileBuffer);
        fileBytes = uint8Array;
        
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
        base64Data = undefined;
      }
    } else if (base64Data) {
      // Decode base64 to bytes for potential DOCX text extraction
      try {
        const binary = atob(base64Data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        fileBytes = bytes;
      } catch (e) {
        console.error('Failed to decode base64 to bytes:', e);
      }
    }

    // ========== DOCX TEXT EXTRACTION ==========
    // Multimodal AI (Gemini) does NOT accept DOCX. We must extract the text
    // structure (including tables) server-side using mammoth, then send as
    // a text prompt. This preserves section headers and checklist rows.
    const isDocx =
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      file_type?.toLowerCase() === 'docx';

    let docxText: string | null = null;
    let docxHtml: string | null = null;
    if (isDocx && fileBytes) {
      try {
        console.log('Extracting DOCX content with mammoth...');
        const buffer = fileBytes.buffer.slice(
          fileBytes.byteOffset,
          fileBytes.byteOffset + fileBytes.byteLength
        ) as ArrayBuffer;
        const [textResult, htmlResult] = await Promise.all([
          mammoth.extractRawText({ arrayBuffer: buffer }),
          mammoth.convertToHtml({ arrayBuffer: buffer }),
        ]);
        docxText = textResult.value;
        docxHtml = htmlResult.value;
        console.log(
          `DOCX extracted: ${docxText.length} chars text, ${docxHtml.length} chars HTML`
        );
      } catch (mammothErr) {
        console.error('mammoth extraction failed:', mammothErr);
      }
    }

    const systemPrompt = `You are a maritime forms expert converting paper-based ISM/ERM checklists, inspection forms, and report templates into digital electronic forms.

CRITICAL RULES:
1. PRESERVE the EXACT structure, section headings and ordering of the source document. Do not invent fields.
2. Use the EXACT label text from the source for every field — do not paraphrase, summarise or shorten.
3. For grey/banner section rows like "INITIAL ACTIONS", "DUTIES & RESPONSIBILITIES", "COMMUNICATIONS", "EQUIPMENT", "ESCALATION & CONTINGENCIES", "FOLLOW UP ACTIONS" → emit a field with type "header".
4. For checklist rows that have a tickbox / checkmark / empty box / square at the end → emit type "checkbox" with requireCommentOnNo=false. The 'label' is the action text (verbatim).
5. For rows that explicitly ask Yes/No → use "yes_no". For Yes/No/N/A → use "yes_no_na".
6. Free-text fields → "text_input" (single line) or "text_area" (multi-line).
7. Date / time / number / dropdown / signature → use the matching type.
8. Order fields top-to-bottom, left-to-right exactly as they appear in the source.

Field types you may use: text_input, text_area, checkbox, yes_no, yes_no_na, date, datetime, time, numeric, dropdown, header, divider, instructions, signature.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{
  "extracted_fields": [
    { "id": "field_1", "type": "header", "label": "INITIAL ACTIONS", "required": false, "pageNumber": 1, "order": 1 },
    { "id": "field_2", "type": "checkbox", "label": "Fix vessel position and log in OLB", "required": true, "pageNumber": 1, "order": 2 }
  ],
  "pages": [{ "id": "page_1", "number": 1, "title": "Page 1" }],
  "document_title": "Detected title",
  "document_description": "Brief description",
  "confidence": 0.9,
  "notes": "any observations"
}`;

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

    if (docxHtml) {
      // DOCX path: send extracted HTML+text, NOT a hallucinated fallback prompt.
      userContent[0] = {
        type: 'text',
        text: `The user uploaded a DOCX file${template_name ? ` titled "${template_name}"` : ''}. Below is the FULL extracted content of the document, including tables. Extract ALL form fields verbatim, preserving section headers (table banner rows in CAPS) as type "header" and checklist tick-rows as type "checkbox". DO NOT invent or omit any rows.\n\n=== EXTRACTED HTML (preserves table structure) ===\n${docxHtml.slice(0, 30000)}\n\n=== PLAIN TEXT (for reference) ===\n${(docxText || '').slice(0, 10000)}`,
      };
    } else if (base64Data && canSendAsMultimodal) {
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
        text: `I could not read the actual content of the document${template_name ? ` titled "${template_name}"` : ''}. Return ONLY this JSON: {"extracted_fields":[],"pages":[{"id":"page_1","number":1,"title":"Page 1"}],"confidence":0,"notes":"Source file content unavailable — please add fields manually or re-upload as PDF."}`,
      };
    }

    console.log(
      'Calling AI Gateway with',
      docxHtml ? 'docx-text (mammoth extracted)' : (canSendAsMultimodal ? 'multimodal (file attached)' : 'text-only fallback')
    );

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        temperature: 0.1,
        max_tokens: 16000,
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
