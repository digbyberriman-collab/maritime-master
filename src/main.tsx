import { createRoot, type Root } from "react-dom/client";
import App from "./App.tsx";
import { isOptionalChunkError } from "./app/optionalChunks";
import "./index.css";

// --- Stale-chunk recovery, with a loop guard -------------------------------
// After a rebuild, dynamic imports can point at chunks that no longer exist.
// Reloading fixes that — but if the reload keeps failing (e.g. the preview
// frame can't fetch assets at all) an unguarded reload loop leaves the user
// staring at a permanently blank white screen. Cap the automatic retries and
// show a visible recovery panel instead.
//
// The guard stores {count, at}: how many automatic reloads ran back to back,
// and when the last one started. It is not cleared when the app mounts — a
// route chunk fails after boot, so clearing at boot reset the count on every
// reload and the cap never tripped. Instead a reload more than
// RELOAD_WINDOW_MS after the previous one starts a new count.
const RELOAD_KEY = "storm.preloadReloads";
const MAX_RELOADS = 2;
const RELOAD_WINDOW_MS = 60_000;

interface ReloadRecord {
  count: number;
  at: number;
}

const readRecord = (): ReloadRecord => {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") {
      const { count, at } = parsed as Partial<ReloadRecord>;
      if (typeof count === "number" && typeof at === "number") return { count, at };
    }
  } catch {
    /* unreadable: treat as no earlier reloads */
  }
  return { count: 0, at: 0 };
};

let reactRoot: Root | null = null;
// The STORM lockup from index.html's static placeholder, kept for the recovery
// panel (the placeholder itself is cleared when the app mounts). Its SVG draws
// in currentColor; the .storm-boot classes colour it per theme.
let bootLogoHtml = "";
// One recovery decision per page load: a failed import can raise several of
// the events below, and each must not count as another reload.
let recovering = false;

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

const recoverFromStaleChunk = () => {
  if (recovering) return;
  recovering = true;
  const now = Date.now();
  const last = readRecord();
  const count = now - last.at > RELOAD_WINDOW_MS ? 0 : last.count;
  // Deferred so React is never unmounted from inside one of its own renders.
  if (count >= MAX_RELOADS) {
    setTimeout(showRecoveryPanel, 0);
    return;
  }
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ count: count + 1, at: now }));
  } catch {
    // Without storage the guard cannot count, so never reload automatically.
    setTimeout(showRecoveryPanel, 0);
    return;
  }
  window.location.reload();
};

const isStaleChunkMessage = (msg: string) =>
  msg.includes("Unable to preload CSS") || msg.includes("Failed to fetch dynamically imported module");

// Route chunks reload (D-39). Optional UI chunks (the palette dialog, the
// vessel switcher's list; src/app/optionalChunks.ts) are left alone: no
// preventDefault, so Vite rethrows, the chunk's loader forgets the attempt and
// its boundary shows "could not load" with a retry (D-81). Matching is by the
// chunk's URL in the error message. Safari's import error ("Importing a module
// script failed.") carries no URL, so there an optional chunk still takes the
// reload path.
window.addEventListener("vite:preloadError", (e) => {
  const payload = (e as Event & { payload?: unknown }).payload;
  const msg = payload instanceof Error ? payload.message : String(payload ?? "");
  if (isOptionalChunkError(msg)) return;
  e.preventDefault();
  recoverFromStaleChunk();
});

// React's development build replays an error its boundary caught as a window
// error, so an optional chunk's failure surfaces here too: skip it.
window.addEventListener("error", (e) => {
  const msg = e?.message || "";
  const errorMsg = e?.error instanceof Error ? e.error.message : "";
  if (isOptionalChunkError(msg) || isOptionalChunkError(errorMsg)) return;
  if (isStaleChunkMessage(msg)) recoverFromStaleChunk();
});

window.addEventListener("unhandledrejection", (e) => {
  const msg = (e?.reason && (e.reason.message || String(e.reason))) || "";
  if (isOptionalChunkError(msg)) return;
  if (isStaleChunkMessage(msg)) recoverFromStaleChunk();
});

const rootEl = document.getElementById("root")!;
bootLogoHtml = rootEl.querySelector("[data-storm-boot-logo]")?.outerHTML ?? "";
// Clear the static first-paint placeholder from index.html.
rootEl.innerHTML = "";
reactRoot = createRoot(rootEl);
reactRoot.render(<App />);
