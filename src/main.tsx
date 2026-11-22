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
  // Styled by the .storm-boot classes in index.html's head <style>, so the
  // panel follows the theme without the app's CSS.
  root.innerHTML = `
    <div class="storm-boot">
      <div style="max-width:24rem">
        <div class="storm-boot-mark">STORM</div>
        <p class="storm-boot-text">We couldn't finish loading STORM. This is usually a temporary connection problem.</p>
        <button type="button" id="storm-recovery-reload" class="storm-boot-button">Reload</button>
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
