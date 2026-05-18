import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Handle stale chunk errors from dynamic imports after rebuilds
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  window.location.reload();
});

// Catch "Unable to preload CSS/module" errors that escape vite:preloadError
window.addEventListener('error', (e) => {
  const msg = e?.message || '';
  if (msg.includes('Unable to preload CSS') || msg.includes('Failed to fetch dynamically imported module')) {
    window.location.reload();
  }
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e?.reason && (e.reason.message || String(e.reason))) || '';
  if (msg.includes('Unable to preload CSS') || msg.includes('Failed to fetch dynamically imported module')) {
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
