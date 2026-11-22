/**
 * Map theme (gap/10 DS17, §A.11; BUILD-PLAN A9). One place that decides how
 * every Leaflet map in STORM looks:
 *
 * - the basemap follows the active theme (Abyss → CARTO dark_all, Daylight →
 *   CARTO light_all) and swaps live when the theme changes;
 * - markers, tracks, routes, heat circles and popups are built here with
 *   token-driven classes (index.css "Maps" block), so no page hard-codes a
 *   colour and nothing on a map is white on Abyss;
 * - popup text is always HTML-escaped (names and descriptions are user data).
 *
 * This module imports Leaflet, so it is not re-exported from the
 * `@/shared/components/data` barrel; import it directly from map code.
 *
 *   const theme = useBasemap(mapRef, ready);
 *   L.marker(pos, { icon: vesselMarkerIcon({ heading, state: 'under_way' }) })
 *     .bindPopup(popupHtml({ title: vessel.name, rows: [['SOG', '12 kts']] }), POPUP_OPTIONS);
 *   L.polyline(points, TRACK_STYLE);
 */
import * as React from 'react';
import L from 'leaflet';
import { useTheme } from 'next-themes';

export type MapTheme = 'dark' | 'light';

export interface TileSpec {
  id: string;
  label: string;
  url: string;
  attribution: string;
  subdomains?: string;
  maxZoom: number;
}

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Basemap per theme. Both are CARTO raster styles; `{r}` asks for retina tiles. */
export const BASEMAPS: Readonly<Record<MapTheme, TileSpec>> = Object.freeze({
  dark: {
    id: 'abyss',
    label: 'Abyss',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
  },
  light: {
    id: 'daylight',
    label: 'Daylight',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: CARTO_ATTRIBUTION,
    subdomains: 'abcd',
    maxZoom: 19,
  },
});

/** Optional nautical overlays for a layer switcher (transparent tiles over the basemap). */
export const MAP_OVERLAYS = Object.freeze({
  seamarks: {
    id: 'seamarks',
    label: 'Seamarks',
    url: 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png',
    attribution: 'Seamarks &copy; <a href="https://www.openseamap.org">OpenSeaMap</a> contributors',
    maxZoom: 18,
  } satisfies TileSpec,
});

export const basemapFor = (theme: MapTheme): TileSpec => BASEMAPS[theme] ?? BASEMAPS.dark;

/** The theme on <html>: Daylight only when `.light` is set (dark is the default, D-DS1). */
export function readDocumentTheme(doc: Document | undefined = typeof document === 'undefined' ? undefined : document): MapTheme {
  return doc?.documentElement.classList.contains('light') ? 'light' : 'dark';
}

function subscribeDocumentTheme(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => undefined;
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

/**
 * The resolved theme a map should draw in. Reads next-themes when the
 * provider is mounted, and the class on <html> otherwise (tests, embeds).
 */
export function useMapTheme(): MapTheme {
  const { resolvedTheme } = useTheme();
  const documentTheme = React.useSyncExternalStore(subscribeDocumentTheme, () => readDocumentTheme(), () => 'dark' as MapTheme);
  if (resolvedTheme === 'light' || resolvedTheme === 'dark') return resolvedTheme;
  return documentTheme;
}

export interface TileLayerOptions {
  /** Show attribution in the map's attribution control (default true). */
  attribution?: boolean;
}

/** Leaflet options for a basemap or overlay spec. */
export function tileLayerOptions(spec: TileSpec, kind: 'basemap' | 'overlay', theme?: MapTheme, options: TileLayerOptions = {}): L.TileLayerOptions {
  return {
    attribution: options.attribution === false ? undefined : spec.attribution,
    subdomains: spec.subdomains ?? 'abc',
    maxZoom: spec.maxZoom,
    zIndex: kind === 'basemap' ? 1 : 2,
    className: kind === 'basemap' ? `storm-map-basemap storm-map-basemap--${theme ?? 'dark'}` : `storm-map-overlay storm-map-overlay--${spec.id}`,
  };
}

/**
 * Keep the themed basemap on a map. Call it after the effect that creates
 * the map. `ready` is any value that changes when the map is (re)created
 * (`true` for a map made once on mount, the region for a map rebuilt per
 * region, `!isLoading` for a map made after data loads). Returns the theme.
 */
export function useBasemap(mapRef: React.RefObject<L.Map | null>, ready: unknown, options: TileLayerOptions = {}): MapTheme {
  const theme = useMapTheme();
  const attribution = options.attribution;
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return undefined;
    const spec = basemapFor(theme);
    const layer = L.tileLayer(spec.url, tileLayerOptions(spec, 'basemap', theme, { attribution })).addTo(map);
    map.getContainer().setAttribute('data-map-theme', theme);
    return () => {
      layer.remove();
    };
  }, [mapRef, ready, theme, attribution]);
  return theme;
}

/** Show an overlay (e.g. seamarks) while `enabled`. Same `ready` contract as `useBasemap`. */
export function useTileOverlay(mapRef: React.RefObject<L.Map | null>, ready: unknown, spec: TileSpec, enabled: boolean) {
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !enabled) return undefined;
    const layer = L.tileLayer(spec.url, tileLayerOptions(spec, 'overlay')).addTo(map);
    return () => {
      layer.remove();
    };
  }, [mapRef, ready, spec, enabled]);
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text for Leaflet HTML (popups, div icons). */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export interface PopupContent {
  title: string;
  /** Muted line under the title (MMSI, country). */
  subtitle?: string;
  /** A small neutral chip (port type). */
  chip?: string;
  /** Label / value pairs in a two-column grid. */
  rows?: ReadonlyArray<readonly [string, string]>;
  body?: string;
  /** A short scrolling list (suggestions at a destination). */
  items?: readonly string[];
  /** Mono footer line (coordinates, last fix). */
  footer?: string;
}

/** Popup markup on the popover surface (index.css `.storm-map-popup__*`). Every string is escaped. */
export function popupHtml(content: PopupContent): string {
  const parts = [`<div class="storm-map-popup">`, `<p class="storm-map-popup__title">${escapeHtml(content.title)}</p>`];
  if (content.subtitle) parts.push(`<p class="storm-map-popup__meta">${escapeHtml(content.subtitle)}</p>`);
  if (content.chip) parts.push(`<span class="storm-map-popup__chip">${escapeHtml(content.chip)}</span>`);
  if (content.rows?.length) {
    parts.push(
      `<dl class="storm-map-popup__grid">${content.rows
        .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
        .join('')}</dl>`,
    );
  }
  if (content.body) parts.push(`<p class="storm-map-popup__body">${escapeHtml(content.body)}</p>`);
  if (content.items?.length) {
    parts.push(`<ul class="storm-map-popup__list">${content.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`);
  }
  if (content.footer) parts.push(`<p class="storm-map-popup__footer">${escapeHtml(content.footer)}</p>`);
  parts.push('</div>');
  return parts.join('');
}

export const POPUP_OPTIONS: L.PopupOptions = Object.freeze({ className: 'storm-map-popup-wrap', minWidth: 200, maxWidth: 280 });

// ---------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------

export type VesselNavState = 'under_way' | 'moored' | 'at_anchor';

export const VESSEL_STATE_LABEL: Readonly<Record<VesselNavState, string>> = Object.freeze({
  under_way: 'Under way',
  moored: 'Moored',
  at_anchor: 'At anchor',
});

export interface VesselMarkerOptions {
  /** Degrees true; null or undefined points north. */
  heading?: number | null;
  /** Shape follows the state: heading arrow under way, circle moored, ringed circle at anchor. */
  state?: VesselNavState;
  /** Last fix older than 6 h: hollow marker in Drift. */
  stale?: boolean;
  selected?: boolean;
  /** Alerts show as a dot at the marker's shoulder, never as the marker colour. */
  alert?: 'danger' | 'warn' | null;
}

const VESSEL_SIZE = 20;

/** The SVG for a vessel mark (also used by legends). `currentColor` is the token colour. */
export function vesselGlyphSvg(state: VesselNavState = 'under_way', options: { heading?: number | null; stale?: boolean } = {}): string {
  const fill = options.stale ? 'none' : 'currentColor';
  const strokeAttrs = options.stale
    ? 'stroke="currentColor" stroke-width="2"'
    : 'class="storm-map-ring" stroke-width="2" stroke-linejoin="round"';
  if (state === 'under_way') {
    const heading = Number.isFinite(options.heading) ? Math.round(options.heading as number) % 360 : 0;
    return `<svg width="${VESSEL_SIZE}" height="${VESSEL_SIZE}" viewBox="0 0 20 20" aria-hidden="true" style="transform:rotate(${heading}deg)"><path d="M10 1.5 L16.5 18 L10 14.5 L3.5 18 Z" fill="${fill}" ${strokeAttrs}/></svg>`;
  }
  const inner =
    state === 'at_anchor' && !options.stale ? '<circle cx="10" cy="10" r="2.25" style="fill:hsl(var(--map-marker-ring))"/>' : '';
  return `<svg width="${VESSEL_SIZE}" height="${VESSEL_SIZE}" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="${fill}" ${strokeAttrs}/>${inner}</svg>`;
}

/** Marker HTML for a vessel (exported for tests and legends). */
export function vesselMarkerHtml(options: VesselMarkerOptions = {}): string {
  const state = options.state ?? 'under_way';
  const classes = ['storm-map-vessel', `storm-map-vessel--${state}`];
  if (options.stale) classes.push('storm-map-vessel--stale');
  if (options.selected) classes.push('storm-map-vessel--selected');
  const alert = options.alert ? `<span class="storm-map-alert storm-map-alert--${options.alert}"></span>` : '';
  return `<span class="${classes.join(' ')}">${vesselGlyphSvg(state, { heading: options.heading, stale: options.stale })}${alert}</span>`;
}

export function vesselMarkerIcon(options: VesselMarkerOptions = {}): L.DivIcon {
  const half = VESSEL_SIZE / 2;
  return L.divIcon({
    html: vesselMarkerHtml(options),
    className: 'storm-map-marker',
    iconSize: [VESSEL_SIZE, VESSEL_SIZE],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

export type PortKind = 'major' | 'marina' | 'shipyard';

/** Port marks use categorical chart colours (validated in both themes). Legend swatch classes. */
export const PORT_SWATCH_CLASS: Readonly<Record<PortKind, string>> = Object.freeze({
  major: 'bg-chart-2',
  marina: 'bg-chart-3',
  shipyard: 'bg-chart-4',
});

const PORT_SIZE = 14;

/** Port call: an 8 px diamond in the port kind's colour with the marker ring. */
export function portMarkerHtml(kind: PortKind): string {
  return `<span class="storm-map-port storm-map-port--${kind}"><svg width="${PORT_SIZE}" height="${PORT_SIZE}" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1.5 L12.5 7 L7 12.5 L1.5 7 Z" fill="currentColor" class="storm-map-ring" stroke-width="1.5" stroke-linejoin="round"/></svg></span>`;
}

export function portMarkerIcon(kind: PortKind): L.DivIcon {
  const half = PORT_SIZE / 2;
  return L.divIcon({
    html: portMarkerHtml(kind),
    className: 'storm-map-marker',
    iconSize: [PORT_SIZE, PORT_SIZE],
    iconAnchor: [half, half],
    popupAnchor: [0, -half],
  });
}

/** A name chip pinned to the map (region cards). */
export function labelMarkerIcon(text: string, anchor: L.PointExpression = [20, 10]): L.DivIcon {
  return L.divIcon({
    html: `<span class="storm-map-label">${escapeHtml(text)}</span>`,
    className: 'storm-map-marker',
    iconAnchor: anchor,
  });
}

/** Numbered stop on a planned route. */
export function waypointIcon(index: number): L.DivIcon {
  return L.divIcon({
    html: `<span class="storm-map-waypoint">${escapeHtml(index)}</span>`,
    className: 'storm-map-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

/** Cluster disc with a count in Signal. */
export function clusterIcon(count: number): L.DivIcon {
  const size = count >= 100 ? 40 : count >= 10 ? 34 : 28;
  return L.divIcon({
    html: `<span class="storm-map-cluster" style="width:${size}px;height:${size}px">${escapeHtml(count)}</span>`,
    className: 'storm-map-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// ---------------------------------------------------------------------------
// Lines and circles: colour by class (index.css), so the theme switch needs no redraw
// ---------------------------------------------------------------------------

/** Past track: Signal, 2 px, 70 %. */
export const TRACK_STYLE: L.PolylineOptions = Object.freeze({ className: 'storm-map-track', weight: 2, opacity: 0.7 });

/** Planned route: Drift, 2 px, dashed. */
export const ROUTE_STYLE: L.PolylineOptions = Object.freeze({
  className: 'storm-map-route',
  weight: 2,
  opacity: 0.9,
  dashArray: '6 4',
});

export type HeatLevel = 'high' | 'medium' | 'low';

/** Legend swatches matching `heatCircleStyle`. */
export const HEAT_SWATCH_CLASS: Readonly<Record<HeatLevel, string>> = Object.freeze({
  high: 'bg-success',
  medium: 'bg-warning',
  low: 'bg-info',
});

export function heatCircleStyle(
  level: HeatLevel,
  options: { radius: number; fillOpacity?: number; weight?: number; opacity?: number },
): L.CircleMarkerOptions {
  return {
    className: `storm-map-heat storm-map-heat--${level}`,
    radius: options.radius,
    fillOpacity: options.fillOpacity ?? 0.6,
    weight: options.weight ?? 2,
    opacity: options.opacity ?? 0.9,
  };
}
