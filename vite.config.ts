import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Chunks by module path (function form): heavy libraries get their own
        // chunks and load with the pages that use them (I6). The shared
        // micro-modules (Vite's preload helper, clsx, tailwind-merge,
        // tiny-invariant) go to the small React vendor chunk on purpose: left
        // alone, Rollup puts them in whichever heavy chunk imports them first
        // (react-pdf, recharts, jspdf), and the entry (or another heavy chunk)
        // then loads and runs that chunk too.
        manualChunks(id) {
          if (id.includes('vite/preload-helper') || /\/node_modules\/(clsx|tailwind-merge|tiny-invariant)\//.test(id)) return 'vendor-react';
          if (/\/node_modules\/(react|react-dom|react-router-dom|react-router|scheduler)\//.test(id)) return 'vendor-react';
          if (id.includes('/node_modules/exceljs/')) return 'excel';
          if (/\/node_modules\/(jspdf|html2canvas)\//.test(id)) return 'pdf-gen';
          if (/\/node_modules\/(pdfjs-dist|react-pdf)\//.test(id)) return 'pdf-view';
          if (id.includes('/node_modules/recharts/')) return 'charts';
          if (id.includes('/node_modules/@supabase/supabase-js/')) return 'supabase';
          // UI components
          if (/\/node_modules\/@radix-ui\/react-(dialog|dropdown-menu|popover|select|tabs|toast|tooltip)\//.test(id)) return 'vendor-radix';
          return undefined;
        },
      },
    },
  },
}));
