import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Abyss design system (gap/10 §A; anchors in DECISIONS §1). Token values live
 * in src/index.css. Semantic colours (`background`, `primary`, `success`, …)
 * switch with the theme; the raw scales below (`abyss`, `deep`, `slate-ui`,
 * `drift`, `signal`) do not and are for design-system components only.
 *
 * The type scale is exposed as `type-*` component classes in index.css, not
 * as `fontSize` keys: tailwind-merge would read `text-display` as a colour.
 */
const scale = (family: string, steps: readonly (string | number)[]) =>
  Object.fromEntries(steps.map((step) => [String(step), `hsl(var(--${family}-${step}) / <alpha-value>)`]));

const FONT_FALLBACK = ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"];

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          muted: "hsl(var(--success-muted))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          muted: "hsl(var(--warning-muted))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          muted: "hsl(var(--info-muted))",
        },
        critical: {
          DEFAULT: "hsl(var(--critical))",
          foreground: "hsl(var(--critical-foreground))",
          muted: "hsl(var(--critical-muted))",
        },
        orange: {
          DEFAULT: "hsl(var(--orange))",
          foreground: "hsl(var(--orange-foreground))",
          muted: "hsl(var(--orange-muted))",
        },
        purple: {
          DEFAULT: "hsl(var(--purple))",
          foreground: "hsl(var(--purple-foreground))",
          muted: "hsl(var(--purple-muted))",
        },
        cyan: {
          DEFAULT: "hsl(var(--cyan))",
          foreground: "hsl(var(--cyan-foreground))",
          muted: "hsl(var(--cyan-muted))",
        },
        amber: {
          DEFAULT: "hsl(var(--amber))",
          foreground: "hsl(var(--amber-foreground))",
          muted: "hsl(var(--amber-muted))",
        },
        pink: {
          DEFAULT: "hsl(var(--pink))",
          foreground: "hsl(var(--pink-foreground))",
          muted: "hsl(var(--pink-muted))",
        },
        indigo: {
          DEFAULT: "hsl(var(--indigo))",
          foreground: "hsl(var(--indigo-foreground))",
          muted: "hsl(var(--indigo-muted))",
        },
        teal: {
          DEFAULT: "hsl(var(--teal))",
          foreground: "hsl(var(--teal-foreground))",
          muted: "hsl(var(--teal-muted))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          // Section headings and chips (Drift-500): 4.5:1 on the sidebar and its hover surface.
          "muted-foreground": "hsl(var(--sidebar-muted-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // New semantic tokens (theme-aware).
        overlay: "hsl(var(--overlay))",
        // Dialog / sheet / drawer backdrop: overlay at the theme's opacity (70% dark, 40% Daylight).
        scrim: "hsl(var(--overlay) / var(--overlay-opacity))",
        // Input, select and textarea fill (Slate-900 on dark, white on Daylight).
        field: "hsl(var(--field))",
        topbar: "hsl(var(--topbar))",
        surface: {
          sunken: "hsl(var(--surface-sunken))",
        },
        focus: "hsl(var(--focus))",
        weekend: "hsl(var(--weekend))",
        today: "hsl(var(--today))",
        "map-water": "hsl(var(--map-water))",
        // Map marks (A.11), for legends that mirror the markers.
        map: {
          vessel: "hsl(var(--map-vessel))",
          ring: "hsl(var(--map-marker-ring))",
          track: "hsl(var(--map-track))",
          route: "hsl(var(--map-route))",
          stale: "hsl(var(--map-stale))",
        },
        // Raw Abyss scales (theme-independent).
        abyss: { DEFAULT: "hsl(var(--abyss-900) / <alpha-value>)", ...scale("abyss", [950, 900, 800]) },
        deep: { DEFAULT: "hsl(var(--deep-900) / <alpha-value>)", ...scale("deep", [900, 850, 800, 700]) },
        "slate-ui": {
          DEFAULT: "hsl(var(--slate-800) / <alpha-value>)",
          ...scale("slate", [900, 800, 700, 600, 500, 400]),
        },
        drift: { DEFAULT: "hsl(var(--drift-400) / <alpha-value>)", ...scale("drift", [600, 500, 400, 300, 200, 100, 50]) },
        signal: {
          DEFAULT: "hsl(var(--signal-500) / <alpha-value>)",
          ...scale("signal", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
          // Theme-aware selected-row / active-segment fill.
          muted: "hsl(var(--signal-muted))",
        },
      },
      fontFamily: {
        sans: ["Inter", ...FONT_FALLBACK],
        display: ['"Barlow Semi Condensed"', "Inter", ...FONT_FALLBACK],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-left": {
          from: { opacity: "0", transform: "translateX(-20px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        // Live AIS position only (A.6 motion-ping).
        "ais-ping": {
          "0%": { transform: "scale(1)", opacity: "0.6" },
          "80%, 100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "slide-in-left": "slide-in-left 0.3s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        "ais-ping": "ais-ping var(--motion-ping) cubic-bezier(0, 0, 0.2, 1) infinite",
      },
      transitionDuration: {
        quick: "var(--motion-quick)",
        menu: "var(--motion-menu)",
        panel: "var(--motion-panel)",
        indicator: "var(--motion-indicator)",
      },
      transitionTimingFunction: {
        tide: "var(--ease-tide)",
        "tide-out": "var(--ease-tide-out)",
      },
      boxShadow: {
        // Tailwind's own scale sits on the elevation tokens too, so legacy
        // `shadow-sm/md/lg` look right on Abyss and the primitives can keep
        // names tailwind-merge understands (a consumer's `shadow-none` or
        // `shadow-md` still replaces the primitive's default):
        // sm/DEFAULT = e1 (cards), md/lg = e2 (menus, popovers), xl/2xl = e3 (dialogs, sheets).
        sm: "var(--shadow-e1)",
        DEFAULT: "var(--shadow-e1)",
        md: "var(--shadow-e2)",
        lg: "var(--shadow-e2)",
        xl: "var(--shadow-e3)",
        "2xl": "var(--shadow-e3)",
        // Elevation (A.4): e1 cards/tiles, e2 menus/popovers, e3 dialogs/sheets.
        e1: "var(--shadow-e1)",
        e2: "var(--shadow-e2)",
        e3: "var(--shadow-e3)",
        "glow-signal": "var(--shadow-glow-signal)",
        // Legacy names, now on the elevation tokens.
        card: "var(--shadow-e1)",
        "card-hover": "var(--shadow-e2)",
        navbar: "var(--shadow-e1)",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
