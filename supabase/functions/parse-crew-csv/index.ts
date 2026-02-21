import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CrewImportRow {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  rank?: string;
  position?: string;
  nationality?: string;
  vessel_assignment: string;
  join_date?: string;
  status?: string;
  rowNumber?: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: CrewImportRow;
  rowNumber: number;
}

interface ParseResult {
  results: ValidationResult[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
}

interface ImportResult {
  success: boolean;
  created: number;
  skipped: number;
  errors: { row: number; error: string }[];
}

const ALLOWED_STATUSES = ['Active', 'Pending', 'On Leave', 'Invited', 'Inactive'];

// Parse CSV content
function parseCSV(content: string): Array<Record<string, string>> {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  // Parse header row
  const headers = lines[0].split(',').map(h => 
    h.trim().toLowerCase().replace(/\s+/g, '_').replace(/^["']|["']$/g, '')
  );

  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV row (handles quoted values)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim().replace(/^["']|["']$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^["']|["']$/g, ''));

    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    rows.push(row);
  }

  return rows;
}

// Validate a single row
function validateRow(row: Record<string, string>, rowNumber: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Handle full_name vs first_name/last_name
  let firstName = row.first_name?.trim() || '';
  let lastName = row.last_name?.trim() || '';

  if (row.full_name && !firstName && !lastName) {
    const parts = row.full_name.trim().split(' ');
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || parts[0] || '';
  }

  // Required field validation
  if (!firstName) {
    errors.push('First name is required');
  }

  if (!lastName) {
    errors.push('Last name is required');
  }

  const email = row.email?.toLowerCase().trim() || '';
  if (!email) {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }
  }

  const vesselAssignment = row.vessel_assignment?.trim() || row.vessel?.trim() || row.vessel_name?.trim() || '';
  if (!vesselAssignment) {
    errors.push('Vessel assignment is required');
  }

  const rank = row.rank?.trim() || '';
  const position = row.position?.trim() || '';
  if (!rank && !position) {
    errors.push('Either rank or position is required');
  }

  // Optional field validation
  const phoneNumber = row.phone_number?.trim() || row.phone?.trim() || '';
  if (phoneNumber) {
    const phoneRegex = /^[\d\s+()\-]+$/;
    if (!phoneRegex.test(phoneNumber)) {
      warnings.push('Phone number format may be invalid');
    }
  }

  const joinDate = row.join_date?.trim() || '';
  if (joinDate) {
    const date = new Date(joinDate);
    if (isNaN(date.getTime())) {
      errors.push('Invalid join date format (use YYYY-MM-DD)');
    } else if (date > new Date()) {
      warnings.push('Join date is in the future');
    }
  }

  const status = row.status?.trim() || 'Pending';
  if (status && !ALLOWED_STATUSES.some(s => s.toLowerCase() === status.toLowerCase())) {
    warnings.push(`Status should be one of: ${ALLOWED_STATUSES.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowNumber,
    data: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phoneNumber || undefined,
      rank: rank || undefined,
      position: position || rank || undefined,
      nationality: row.nationality?.trim() || undefined,
      vessel_assignment: vesselAssignment,
      join_date: joinDate || new Date().toISOString().split('T')[0],
      status: ALLOWED_STATUSES.find(s => s.toLowerCase() === status.toLowerCase()) || 'Pending',
      rowNumber,
    },
  };
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
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !userData.user) {
      throw new Error('Unauthorized');
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id')
      .eq('user_id', userData.user.id)
      .single();

    if (!profile || !['dpa', 'shore_management'].includes(profile.role)) {
      throw new Error('Insufficient permissions');
    }

    // Get request body
    const body = await req.json();
    const csvContent = body.csvContent;
    const action = body.action || 'validate'; // 'validate' or 'import'

    if (!csvContent) {
      throw new Error('CSV content is required');
    }

    console.log(`Processing CSV: action=${action}`);

    // Parse CSV
    const rows = parseCSV(csvContent);
    
    if (rows.length === 0) {
      throw new Error('No valid rows found in CSV');
    }

    // Validate all rows
    const validationResults: ValidationResult[] = rows.map((row, index) =>
      validateRow(row, index + 2) // +2 for header row + 0-index
    );

    // Check for existing emails
    const emails = validationResults
      .filter(r => r.data.email)
      .map(r => r.data.email);

    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('company_id', profile.company_id)
      .in('email', emails);

    const existingEmails = new Set(existingProfiles?.map(p => p.email) || []);

    validationResults.forEach(r => {
      if (existingEmails.has(r.data.email)) {
        r.warnings.push('Email already exists in system');
        if (action === 'import') {
          r.errors.push('Duplicate email - will be skipped');
          r.valid = false;
        }
      }
    });

    // Check vessel mappings
    const vesselNames = [...new Set(validationResults.map(r => r.data.vessel_assignment))];
    const { data: vessels } = await supabaseAdmin
      .from('vessels')
      .select('id, name, imo_number')
      .eq('company_id', profile.company_id);

    const vesselMapping: Record<string, string> = {};
    vesselNames.forEach(name => {
      const vessel = vessels?.find(
        v => v.name.toLowerCase() === name.toLowerCase() || v.imo_number === name
      );
      if (vessel) {
        vesselMapping[name.toLowerCase()] = vessel.id;
      }
    });

    validationResults.forEach(r => {
      const vesselId = vesselMapping[r.data.vessel_assignment.toLowerCase()];
      if (!vesselId) {
        r.errors.push(`Vessel not found: ${r.data.vessel_assignment}`);
        r.valid = false;
      }
    });

    // If validate only, return results
    if (action === 'validate') {
      const validRows = validationResults.filter(r => r.valid).length;
      const errorRows = validationResults.filter(r => !r.valid).length;
      const warningRows = validationResults.filter(r => r.warnings.length > 0).length;

      const result: ParseResult = {
        results: validationResults,
        totalRows: validationResults.length,
        validRows,
        errorRows,
        warningRows,
      };

      console.log(`CSV validated: ${validRows} valid, ${errorRows} errors, ${warningRows} warnings`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          ...result,
          vesselMapping,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Import action - create crew members
    const importResult: ImportResult = {
      success: true,
      created: 0,
      skipped: 0,
      errors: [],
    };

    for (const validation of validationResults) {
      if (!validation.valid) {
        importResult.skipped++;
        validation.errors.forEach(err => {
          importResult.errors.push({ row: validation.rowNumber, error: err });
        });
        continue;
      }

      const data = validation.data;
      const vesselId = vesselMapping[data.vessel_assignment.toLowerCase()];

      if (!vesselId) {
        importResult.skipped++;
        importResult.errors.push({ 
          row: validation.rowNumber, 
          error: `Vessel not found: ${data.vessel_assignment}` 
        });
        continue;
      }

      try {
        // Generate a temporary password
        const tempPassword = crypto.randomUUID().substring(0, 12);

        // Create auth user
        const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            first_name: data.first_name,
            last_name: data.last_name,
          },
        });

        if (createError) {
          throw new Error(createError.message);
        }

        if (!authUser.user) {
          throw new Error('Failed to create user');
        }

        // Create profile
        const { error: profileInsertError } = await supabaseAdmin
          .from('profiles')
          .insert({
            user_id: authUser.user.id,
            email: data.email,
            first_name: data.first_name,
            last_name: data.last_name,
            rank: data.rank || null,
            nationality: data.nationality || null,
            phone: data.phone_number || null,
            company_id: profile.company_id,
            role: 'crew',
            status: data.status || 'Invited',
          });

        if (profileInsertError) {
          console.error('Profile insert error:', profileInsertError);
          // Try to clean up auth user
          await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
          throw new Error(profileInsertError.message);
        }

        // Create crew assignment
        const { error: assignmentError } = await supabaseAdmin
          .from('crew_assignments')
          .insert({
            user_id: authUser.user.id,
            vessel_id: vesselId,
            position: data.position || data.rank || 'Crew',
            join_date: data.join_date || new Date().toISOString().split('T')[0],
            is_current: true,
            created_by: userData.user.id,
          });

        if (assignmentError) {
          console.error('Assignment error:', assignmentError);
          // Don't fail the whole import, just log it
        }

        // Log the import in audit_logs
        await supabaseAdmin
          .from('audit_logs')
          .insert({
            actor_user_id: userData.user.id,
            action: 'CREATE',
            entity_type: 'crew_member',
            entity_id: authUser.user.id,
            new_values: {
              email: data.email,
              first_name: data.first_name,
              last_name: data.last_name,
              vessel_id: vesselId,
              import_source: 'csv_bulk_import',
            },
          });

        importResult.created++;
        existingEmails.add(data.email); // Prevent duplicates within same import

      } catch (error) {
        console.error(`Error creating crew member row ${validation.rowNumber}:`, error);
        importResult.errors.push({ 
          row: validation.rowNumber, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
        importResult.skipped++;
      }
    }

    console.log(`Import complete: ${importResult.created} created, ${importResult.skipped} skipped`);

    return new Response(
      JSON.stringify(importResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in parse-crew-csv:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
