import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Handle stale chunk errors from dynamic imports after rebuilds
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
