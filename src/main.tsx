import { createRoot, type Root } from "react-dom/client";
import App from "./App.tsx";
import { isOptionalChunkError } from "./app/optionalChunks";
import { RELOAD_KEY, requestChunkRecovery, setRecoveryPanel } from "./app/staleChunkRecovery";
import "./index.css";

// --- Stale-chunk recovery -------------------------------------------------
// After a deploy, dynamic imports can point at chunks that no longer exist.
// A route chunk that fails reloads the page through the bounded guard in
// src/app/staleChunkRecovery.ts (at most 2 reloads in 60 s, then the recovery
// panel below; without storage, the panel at once). That module is React-free,
// so the optional chunks' boundaries share the same guard for their Reload.

let reactRoot: Root | null = null;
// The STORM lockup from index.html's static placeholder, kept for the recovery
// panel (the placeholder itself is cleared when the app mounts). Its SVG draws
// in currentColor; the .storm-boot classes colour it per theme.
let bootLogoHtml = "";

const showRecoveryPanel = () => {
  const el = document.getElementById("root");
  if (!el) return;
  // Stop React before replacing its DOM, rather than writing under a live root.
  try {
    reactRoot?.unmount();
  } catch {
    /* already unmounted */
  }
  reactRoot = null;
  // Styled by the .storm-boot classes in index.html's head <style>, so the
  // panel follows the theme (Abyss / Daylight) without the app's CSS.
  el.innerHTML = `
    <div class="storm-boot" data-storm-recovery>
      <div class="storm-boot-inner">
        ${bootLogoHtml || '<div class="storm-boot-mark">STORM</div>'}
        <p class="storm-boot-text storm-boot-message" role="alert">We couldn't finish loading STORM. This is usually a temporary connection problem.</p>
        <button type="button" id="storm-recovery-reload" class="storm-boot-button">Reload</button>
      </div>
    </div>`;
  const reload = document.getElementById("storm-recovery-reload");
  reload?.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  });
  // The page under the keyboard focus is gone; put it on the one action left.
  reload?.focus();
};

// Shown when the guard's cap is hit or storage is unavailable.
setRecoveryPanel(showRecoveryPanel);

const isStaleChunkMessage = (msg: string) =>
  msg.includes("Unable to preload CSS") || msg.includes("Failed to fetch dynamically imported module");

// Route chunks reload (D-39). Optional UI chunks (the palette dialog, the
// vessel switcher's list; src/app/optionalChunks.ts) never reload on their
// own (D-100): no preventDefault, so Vite rethrows, the chunk's loader forgets
// the attempt and its boundary shows "could not load" with Try again / Retry
// (a new import) and Reload, which the user presses to go through the same
// guard (requestChunkRecovery). Matching is by the chunk's URL in the error
// message. Safari's import error ("Importing a module script failed.")
// carries no URL, so there an optional chunk still takes the reload path.
window.addEventListener("vite:preloadError", (e) => {
  const payload = (e as Event & { payload?: unknown }).payload;
  const msg = payload instanceof Error ? payload.message : String(payload ?? "");
  if (isOptionalChunkError(msg)) return;
  e.preventDefault();
  requestChunkRecovery();
});

// React's development build replays an error its boundary caught as a window
// error, so an optional chunk's failure surfaces here too: skip it.
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  const errorMsg = e?.error instanceof Error ? e.error.message : "";
  if (isOptionalChunkError(msg) || isOptionalChunkError(errorMsg)) return;
  if (isStaleChunkMessage(msg)) requestChunkRecovery();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e?.reason && (e.reason.message || String(e.reason))) || "";
  if (isOptionalChunkError(msg)) return;
  if (isStaleChunkMessage(msg)) requestChunkRecovery();
});

const rootEl = document.getElementById("root")!;
bootLogoHtml = rootEl.querySelector("[data-storm-boot-logo]")?.outerHTML ?? "";
// Clear the static first-paint placeholder from index.html.
rootEl.innerHTML = "";
reactRoot = createRoot(rootEl);
reactRoot.render(<App />);
