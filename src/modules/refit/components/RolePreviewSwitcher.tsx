import { useAuth, setPreviewRole, ROLE_LABEL, type AppRole } from "@/modules/refit/lib/auth";

const PREVIEW_OPTIONS: AppRole[] = [
  "owner",
  "captain",
  "project_manager",
  "hod",
  "supplier",
  "shore_management",
];

/**
 * Sidebar control that lets owner / shore_management / project_manager users
 * temporarily view the UI as another role. Pure client-side gating — RLS on
 * the database is unaffected, so data the real account cannot read will still
 * be hidden.
 */
export function RolePreviewSwitcher() {
  const { canPreview, previewRole, realRole } = useAuth();
  if (!canPreview) return null;

  const current = previewRole ?? "";

  return (
    <div className="px-3 py-2 rounded-sm bg-white/5 border border-white/10">
      <label className="block text-[10px] tracking-[0.2em] uppercase text-ocean/70 mb-1.5">
        Preview as role
      </label>
      <select
        value={current}
        onChange={(e) => setPreviewRole((e.target.value || null) as AppRole | null)}
        className="w-full bg-navy text-white text-xs px-2 py-1.5 border border-white/15 rounded-sm focus:outline-none focus:ring-1 focus:ring-ocean"
      >
        <option value="">Use my real role ({realRole ? ROLE_LABEL[realRole] : "—"})</option>
        {PREVIEW_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABEL[r]}
          </option>
        ))}
      </select>
      {previewRole && (
        <button
          onClick={() => setPreviewRole(null)}
          className="mt-1.5 text-[10px] text-ocean hover:text-white underline-offset-2 hover:underline"
        >
          Exit preview
        </button>
      )}
    </div>
  );
}

/**
 * Persistent banner shown above page content while role preview is active,
 * so admins can't forget they're impersonating.
 */
export function RolePreviewBanner() {
  const { previewRole } = useAuth();
  if (!previewRole) return null;
  return (
    <div className="bg-amber-100 border-b border-amber-300 text-amber-900 text-xs px-4 py-2 flex items-center justify-between gap-3">
      <span>
        Previewing as <strong>{ROLE_LABEL[previewRole]}</strong> — UI gating only, your real
        permissions still apply to data.
      </span>
      <button
        onClick={() => setPreviewRole(null)}
        className="px-2 py-1 bg-amber-900 text-amber-50 rounded-sm hover:opacity-90"
      >
        Exit preview
      </button>
    </div>
  );
}
