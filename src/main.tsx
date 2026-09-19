import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// --- Stale-chunk recovery, with a loop guard -------------------------------
// After a rebuild, dynamic imports can point at chunks that no longer exist.
// Reloading fixes that — but if the reload keeps failing (e.g. the preview
// frame can't fetch assets at all) an unguarded reload loop leaves the user
// staring at a permanently blank white screen. Cap the automatic retries and
// show a visible recovery panel instead.
const RELOAD_KEY = "storm.preloadReloads";
const MAX_RELOADS = 2;

const readCount = (): number => {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
};

const showRecoveryPanel = () => {
  const root = document.getElementById("root");
  if (!root) return;
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:ui-sans-serif,system-ui,sans-serif;text-align:center">
      <div style="max-width:24rem">
        <div style="font-weight:900;letter-spacing:-0.02em;font-size:1.75rem;margin-bottom:0.5rem">STORM</div>
        <p style="margin:0 0 1rem;color:#64748b;font-size:0.875rem">We couldn't finish loading STORM. This is usually a temporary connection problem.</p>
        <button type="button" id="storm-recovery-reload" style="border:0;border-radius:0.5rem;padding:0.625rem 1.25rem;background:#0066CC;color:#fff;font-size:0.875rem;font-weight:600;cursor:pointer">Reload</button>
      </div>
    </div>`;
  document.getElementById("storm-recovery-reload")?.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  });
};

const recoverFromStaleChunk = () => {
  const count = readCount();
  if (count >= MAX_RELOADS) {
    showRecoveryPanel();
    return;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, String(count + 1));
  } catch {
    /* ignore */
  }
  window.location.reload();
};

const isStaleChunkMessage = (msg: string) =>
  msg.includes("Unable to preload CSS") || msg.includes("Failed to fetch dynamically imported module");

window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  recoverFromStaleChunk();
});

window.addEventListener("error", (e) => {
  if (isStaleChunkMessage(e?.message || "")) recoverFromStaleChunk();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e?.reason && (e.reason.message || String(e.reason))) || "";
  if (isStaleChunkMessage(msg)) recoverFromStaleChunk();
});

const rootEl = document.getElementById("root")!;
// Clear the static first-paint placeholder from index.html.
rootEl.innerHTML = "";
createRoot(rootEl).render(<App />);

// The app mounted, so any earlier recovery attempts succeeded.
try {
  sessionStorage.removeItem(RELOAD_KEY);
} catch {
  /* ignore */
}
