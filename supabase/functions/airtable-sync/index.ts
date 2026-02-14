import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AIRTABLE_BASE_ID = "appZzCXh4qtvqIy3x";
const AIRTABLE_TABLE_NAME = "Crew Contacts";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;

// Field mapping: Airtable field name -> profiles column
const FIELD_MAP: Record<string, string> = {
  "First Name": "first_name",
  "Last Name": "last_name",
  "Email": "email",
  "Phone": "phone",
  "Nationality": "nationality",
  "Rank": "rank",
  "Department": "department",
  "Preferred Name": "preferred_name",
  "Date of Birth": "date_of_birth",
  "Gender": "gender",
  "Emergency Contact Name": "emergency_contact_name",
  "Emergency Contact Phone": "emergency_contact_phone",
  "Contract Start Date": "contract_start_date",
  "Contract End Date": "contract_end_date",
  "Rotation": "rotation",
  "Cabin": "cabin",
  "Medical Expiry": "medical_expiry",
  "Passport Number": "passport_number",
  "Passport Expiry": "passport_expiry",
  "Visa Status": "visa_status",
  "Notes": "notes",
  "Status": "status",
};

// Reverse map for export
const REVERSE_FIELD_MAP: Record<string, string> = {};
for (const [atField, dbCol] of Object.entries(FIELD_MAP)) {
  REVERSE_FIELD_MAP[dbCol] = atField;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AIRTABLE_API_KEY = Deno.env.get("Airtable");
    if (!AIRTABLE_API_KEY) {
      throw new Error("Airtable API key not configured");
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Not authenticated");

    // Get user's company
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.company_id) throw new Error("No company found");
    const companyId = profile.company_id;

    const body = await req.json().catch(() => ({}));
    const action = body.action || "two_way";

    // Create sync log entry
    const { data: syncLog } = await supabase
      .from("airtable_sync_log")
      .insert({
        company_id: companyId,
        sync_type: "manual",
        direction: action,
        triggered_by: user.id,
      })
      .select("id")
      .single();

    const logId = syncLog?.id;
    let imported = 0;
    let exported = 0;
    let errored = 0;

    // ---- IMPORT: Airtable → STORM ----
    if (action === "import" || action === "two_way") {
      const airtableRecords = await fetchAllAirtableRecords(AIRTABLE_API_KEY);

      for (const record of airtableRecords) {
        try {
          const fields = record.fields;
          const email = fields["Email"];
          if (!email) continue;

          // Check if already mapped
          const { data: existing } = await supabase
            .from("airtable_sync_map")
            .select("profile_user_id")
            .eq("company_id", companyId)
            .eq("airtable_record_id", record.id)
            .maybeSingle();

          // Build profile update data
          const profileData: Record<string, any> = {};
          for (const [atField, dbCol] of Object.entries(FIELD_MAP)) {
            if (fields[atField] !== undefined && fields[atField] !== null) {
              profileData[dbCol] = fields[atField];
            }
          }

          if (existing?.profile_user_id) {
            // Update existing profile
            await supabase
              .from("profiles")
              .update({ ...profileData, updated_at: new Date().toISOString() })
              .eq("user_id", existing.profile_user_id);

            await supabase
              .from("airtable_sync_map")
              .update({
                last_synced_at: new Date().toISOString(),
                last_sync_direction: "import",
                sync_status: "synced",
                error_message: null,
              })
              .eq("company_id", companyId)
              .eq("airtable_record_id", record.id);
          } else {
            // Find by email match
            const { data: matchedProfile } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("company_id", companyId)
              .eq("email", email)
              .maybeSingle();

            if (matchedProfile) {
              // Update and create mapping
              await supabase
                .from("profiles")
                .update({ ...profileData, updated_at: new Date().toISOString() })
                .eq("user_id", matchedProfile.user_id);

              await supabase.from("airtable_sync_map").insert({
                company_id: companyId,
                profile_user_id: matchedProfile.user_id,
                airtable_record_id: record.id,
                last_sync_direction: "import",
              });
            }
            // If no match by email, skip (don't create auth users automatically)
          }
          imported++;
        } catch (e) {
          console.error("Import error for record", record.id, e);
          errored++;
        }
      }
    }

    // ---- EXPORT: STORM → Airtable ----
    if (action === "export" || action === "two_way") {
      // Get all profiles for company
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", companyId);

      if (profiles) {
        for (const p of profiles) {
          try {
            // Check if mapped
            const { data: mapping } = await supabase
              .from("airtable_sync_map")
              .select("airtable_record_id")
              .eq("company_id", companyId)
              .eq("profile_user_id", p.user_id)
              .maybeSingle();

            // Build Airtable fields
            const fields: Record<string, any> = {};
            for (const [dbCol, atField] of Object.entries(REVERSE_FIELD_MAP)) {
              if (p[dbCol] !== undefined && p[dbCol] !== null) {
                fields[atField] = p[dbCol];
              }
            }

            if (mapping?.airtable_record_id) {
              // Update existing Airtable record
              await fetch(`${AIRTABLE_API_URL}/${mapping.airtable_record_id}`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ fields }),
              });

              await supabase
                .from("airtable_sync_map")
                .update({
                  last_synced_at: new Date().toISOString(),
                  last_sync_direction: "export",
                  sync_status: "synced",
                })
                .eq("company_id", companyId)
                .eq("profile_user_id", p.user_id);
            } else {
              // Create new Airtable record
              const res = await fetch(AIRTABLE_API_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${AIRTABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ fields }),
              });

              const created = await res.json();
              if (created.id) {
                await supabase.from("airtable_sync_map").insert({
                  company_id: companyId,
                  profile_user_id: p.user_id,
                  airtable_record_id: created.id,
                  last_sync_direction: "export",
                });
              }
            }
            exported++;
          } catch (e) {
            console.error("Export error for profile", p.user_id, e);
            errored++;
          }
        }
      }
    }

    // Update sync log
    if (logId) {
      await supabase
        .from("airtable_sync_log")
        .update({
          records_imported: imported,
          records_exported: exported,
          records_errored: errored,
          completed_at: new Date().toISOString(),
          status: errored > 0 ? "completed" : "completed",
        })
        .eq("id", logId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        imported,
        exported,
        errored,
        syncLogId: logId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Airtable sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function fetchAllAirtableRecords(apiKey: string) {
  const records: any[] = [];
  let offset: string | undefined;

  do {
    const url = offset
      ? `${AIRTABLE_API_URL}?offset=${offset}`
      : AIRTABLE_API_URL;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Airtable API error [${res.status}]: ${errText}`);
    }

    const data = await res.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);

  return records;
}
