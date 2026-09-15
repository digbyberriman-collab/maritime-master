// Public browser connection details for the existing STORM backend.
// This anonymous key is intentionally public; row-level security controls access.
// Never put service-role keys or user sessions in this module.
const DEFAULT_URL = "https://pfvtrtkqkvjbnbaabgpv.supabase.co";
const DEFAULT_PUBLIC_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmdnRydGtxa3ZqYm5iYWFiZ3B2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNTAwNTYsImV4cCI6MjA4NDkyNjA1Nn0.zL8ktqIS2mwZjax82cKDJ-2wPeg36x7OT_L3Y5lnebU";

export function getSupabaseConfig(url?: string, publicKey?: string) {
  const configuredUrl = url?.trim();
  const configuredKey = publicKey?.trim();
  if (configuredUrl || configuredKey) {
    if (!configuredUrl || !configuredKey) {
      throw new Error('Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to override the STORM backend.');
    }
    return { url: configuredUrl, publicKey: configuredKey };
  }
  return { url: DEFAULT_URL, publicKey: DEFAULT_PUBLIC_KEY };
}
