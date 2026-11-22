/**
 * Map theme (BUILD-PLAN A9; gap/10 DS17, §A.11): the basemap follows the
 * theme (CARTO dark_all / light_all) and swaps live; markers, tracks, heat
 * circles and popups are token-classed with escaped text; no white Leaflet
 * popups and no hard-coded colours in the map code.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import * as React from 'react';
import L from 'leaflet';
import { readRepoFile } from './cssTokens';

const themeMock = vi.hoisted(() => ({ resolvedTheme: undefined as string | undefined }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: themeMock.resolvedTheme }) }));

import {
  BASEMAPS,
  HEAT_SWATCH_CLASS,
  MAP_OVERLAYS,
  POPUP_OPTIONS,
  PORT_SWATCH_CLASS,
  ROUTE_STYLE,
  TRACK_STYLE,
  basemapFor,
  clusterIcon,
  escapeHtml,
  heatCircleStyle,
  labelMarkerIcon,
  popupHtml,
  portMarkerHtml,
  readDocumentTheme,
  useBasemap,
  useMapTheme,
  useTileOverlay,
  vesselGlyphSvg,
  vesselMarkerHtml,
  vesselMarkerIcon,
  waypointIcon,
} from '@/shared/components/data/mapTheme';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => {
  // Unmount first: useMapTheme observes <html>, so resetting its classes while
  // a tree is still mounted would set state outside act(). RTL's own cleanup
  // runs later and is a no-op by then.
  cleanup();
  document.documentElement.classList.remove('light', 'dark');
  themeMock.resolvedTheme = undefined;
});

const setHtmlTheme = (theme: 'dark' | 'light') => {
  document.documentElement.classList.remove('light', 'dark');
  document.documentElement.classList.add(theme);
};

describe('basemaps', () => {
  it('uses CARTO dark_all on Abyss and light_all on Daylight, with attribution', () => {
    expect(basemapFor('dark').url).toContain('basemaps.cartocdn.com/dark_all/');
    expect(basemapFor('light').url).toContain('basemaps.cartocdn.com/light_all/');
    for (const spec of Object.values(BASEMAPS)) {
      expect(spec.attribution).toContain('OpenStreetMap');
      expect(spec.attribution).toContain('CARTO');
      expect(spec.url.startsWith('https://')).toBe(true);
    }
  });

  it('offers seamarks as an overlay', () => {
    expect(MAP_OVERLAYS.seamarks.url).toContain('openseamap.org');
  });
});

describe('theme resolution', () => {
  it('reads <html>: Daylight only with .light, otherwise Abyss', () => {
    expect(readDocumentTheme()).toBe('dark');
    setHtmlTheme('light');
    expect(readDocumentTheme()).toBe('light');
  });

  function Probe({ onTheme }: { onTheme: (t: string) => void }) {
    onTheme(useMapTheme());
    return null;
  }

  it('follows the class on <html> live when no provider is mounted', async () => {
    const seen: string[] = [];
    render(<Probe onTheme={(t) => seen.push(t)} />);
    expect(seen.at(-1)).toBe('dark');
    await act(async () => setHtmlTheme('light'));
    expect(seen.at(-1)).toBe('light');
  });

  it('prefers the next-themes resolved theme', () => {
    themeMock.resolvedTheme = 'light';
    const seen: string[] = [];
    render(<Probe onTheme={(t) => seen.push(t)} />);
    expect(seen.at(-1)).toBe('light');
  });
});

function MapHarness({ overlay = false }: { overlay?: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  React.useEffect(() => {
    if (!ref.current) return undefined;
    const map = L.map(ref.current, { center: [43.7, 7.4], zoom: 5 });
    mapRef.current = map;
    (window as unknown as { __map?: L.Map }).__map = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);
  useBasemap(mapRef, true);
  useTileOverlay(mapRef, true, MAP_OVERLAYS.seamarks, overlay);
  return <div ref={ref} style={{ width: 400, height: 300 }} />;
}

const tileLayers = () => {
  const map = (window as unknown as { __map: L.Map }).__map;
  const layers: L.TileLayer[] = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.TileLayer) layers.push(layer);
  });
  return layers;
};

describe('useBasemap / useTileOverlay', () => {
  it('adds the themed basemap and swaps it when the theme changes', async () => {
    const { container } = render(<MapHarness />);
    let layers = tileLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].options.className).toContain('storm-map-basemap--dark');
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'dark');

    await act(async () => setHtmlTheme('light'));
    layers = tileLayers();
    expect(layers).toHaveLength(1);
    expect(layers[0].options.className).toContain('storm-map-basemap--light');
    expect(container.querySelector('.leaflet-container')).toHaveAttribute('data-map-theme', 'light');
  });

  it('adds the seamarks overlay above the basemap only while enabled', () => {
    const { rerender } = render(<MapHarness />);
    expect(tileLayers()).toHaveLength(1);
    rerender(<MapHarness overlay />);
    const layers = tileLayers();
    expect(layers).toHaveLength(2);
    const overlay = layers.find((l) => String(l.options.className).includes('storm-map-overlay--seamarks'))!;
    expect(overlay.options.zIndex).toBeGreaterThan(1);
    rerender(<MapHarness />);
    expect(tileLayers()).toHaveLength(1);
  });
});

describe('markers', () => {
  it('shapes vessels by state and points the arrow along the heading', () => {
    const underway = vesselMarkerHtml({ state: 'under_way', heading: 95.4 });
    expect(underway).toContain('storm-map-vessel--under_way');
    expect(underway).toContain('rotate(95deg)');
    expect(underway).toContain('<path');
    expect(vesselMarkerHtml({ state: 'moored' })).toContain('<circle');
    expect(vesselMarkerHtml({ state: 'at_anchor' }).match(/<circle/g)).toHaveLength(2);
    expect(vesselGlyphSvg('under_way', { heading: null })).toContain('rotate(0deg)');
  });

  it('draws stale fixes hollow, selection as a glow and alerts as a shoulder dot', () => {
    const stale = vesselMarkerHtml({ stale: true });
    expect(stale).toContain('storm-map-vessel--stale');
    expect(stale).toContain('fill="none"');
    expect(vesselMarkerHtml({ selected: true })).toContain('storm-map-vessel--selected');
    const alert = vesselMarkerHtml({ alert: 'danger' });
    expect(alert).toContain('storm-map-alert--danger');
    // The alert never changes the marker's own colour class.
    expect(alert).not.toContain('storm-map-vessel--danger');
  });

  it('builds Leaflet div icons without the default white box', () => {
    for (const icon of [vesselMarkerIcon(), labelMarkerIcon('Draak'), waypointIcon(1), clusterIcon(12)]) {
      expect(icon).toBeInstanceOf(L.DivIcon);
      expect(icon.options.className).toBe('storm-map-marker');
    }
    expect(vesselMarkerIcon().options.iconAnchor).toEqual([10, 10]);
  });

  it('colours port kinds from the chart palette, in the marker and the legend', () => {
    expect(portMarkerHtml('major')).toContain('storm-map-port--major');
    expect(PORT_SWATCH_CLASS).toEqual({ major: 'bg-chart-2', marina: 'bg-chart-3', shipyard: 'bg-chart-4' });
  });

  it('escapes names on labels and counts on clusters', () => {
    expect(String(labelMarkerIcon('<b>Draak</b>').options.html)).toContain('&lt;b&gt;Draak&lt;/b&gt;');
    expect(String(clusterIcon(120).options.html)).toContain('>120<');
  });
});

describe('lines, circles and popups', () => {
  it('styles tracks, routes and heat circles by class so the theme switch needs no redraw', () => {
    expect(TRACK_STYLE).toMatchObject({ className: 'storm-map-track', weight: 2, opacity: 0.7 });
    expect(ROUTE_STYLE).toMatchObject({ className: 'storm-map-route', dashArray: '6 4' });
    expect(heatCircleStyle('high', { radius: 9 })).toMatchObject({
      className: 'storm-map-heat storm-map-heat--high',
      radius: 9,
    });
    expect(HEAT_SWATCH_CLASS).toEqual({ high: 'bg-success', medium: 'bg-warning', low: 'bg-info' });
    for (const style of [TRACK_STYLE, ROUTE_STYLE, heatCircleStyle('low', { radius: 4 })]) {
      expect(style).not.toHaveProperty('color');
      expect(style).not.toHaveProperty('fillColor');
    }
  });

  it('escapes every popup string (user data never becomes markup)', () => {
    const html = popupHtml({
      title: '<img src=x onerror="alert(1)">',
      subtitle: 'MMSI: 1 & 2',
      chip: '"marina"',
      rows: [["<b>SOG</b>", "12 kts"]],
      body: "it's",
      items: ['<script>x</script>'],
      footer: '43.7°N',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('MMSI: 1 &amp; 2');
    expect(html).toContain('&#39;');
    expect(html).toContain('<dt>&lt;b&gt;SOG&lt;/b&gt;</dt><dd>12 kts</dd>');
    expect(html).toContain('storm-map-popup__footer');
    expect(escapeHtml(null)).toBe('');
  });

  it('popups carry the theme class', () => {
    expect(POPUP_OPTIONS.className).toBe('storm-map-popup-wrap');
  });
});

describe('no white Leaflet chrome and no hard-coded map colours', () => {
  const css = readRepoFile('src/index.css');
  const mapRules: string[] = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]*(?:leaflet|storm-map)[^{}]*\{[^}]*\}/g) ?? [];

  it('themes popups, tips, controls and tooltips from tokens', () => {
    const popupRule = mapRules.find((r) => r.includes('.leaflet-popup-content-wrapper') && r.includes('background'))!;
    expect(popupRule).toContain('hsl(var(--popover))');
    expect(mapRules.some((r) => r.includes('.leaflet-tooltip') && r.includes('hsl(var(--popover))'))).toBe(true);
    expect(mapRules.some((r) => r.includes('.leaflet-container') && r.includes('hsl(var(--map-water))'))).toBe(true);
  });

  it("keeps Leaflet's z-indexes inside the map so maps never cover dialogs", () => {
    const container = mapRules.find((r) => /\.leaflet-container\s*\{/.test(r))!;
    expect(container).toMatch(/isolation:\s*isolate/);
  });

  it('never paints a map rule white or with a raw colour', () => {
    expect(mapRules.length).toBeGreaterThan(20);
    for (const rule of mapRules) {
      expect(rule, rule).not.toMatch(/#[0-9a-f]{3,8}\b|:\s*white\b|rgba?\(/i);
    }
  });

  it('defines every map class the helper emits', () => {
    const helper = readRepoFile('src/shared/components/data/mapTheme.ts');
    const emitted = new Set(helper.match(/storm-map-[a-z-]+(?:__[a-z]+)?/g));
    const dynamic = ['storm-map-vessel--', 'storm-map-alert--', 'storm-map-port--', 'storm-map-heat--', 'storm-map-basemap', 'storm-map-overlay', 'storm-map-popup-wrap'];
    for (const cls of emitted) {
      if (dynamic.some((d) => cls.startsWith(d))) continue;
      expect(css, cls).toContain(`.${cls}`);
    }
    for (const cls of ['storm-map-vessel--stale', 'storm-map-vessel--selected', 'storm-map-alert--danger', 'storm-map-alert--warn', 'storm-map-port--major', 'storm-map-port--marina', 'storm-map-port--shipyard', 'storm-map-heat--high', 'storm-map-heat--medium', 'storm-map-heat--low']) {
      expect(css, cls).toContain(`.${cls}`);
    }
  });

  it.each([
    'src/shared/components/data/mapTheme.ts',
    'src/modules/dashboard/pages/FleetMap.tsx',
    'src/modules/dashboard/components/fleet/RegionMapCard.tsx',
    'src/modules/itinerary/components/HeatMapTab.tsx',
  ])('%s has no hex colours, white fills or raw tile hosts', (file) => {
    const src = readRepoFile(file);
    expect(src).not.toMatch(/['"`(:,=\s]#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/(?:fill|stroke|background|color|border)[\w-]*\s*[:=]\s*["'`]?white\b|rgba\(/);
    if (!file.endsWith('mapTheme.ts')) {
      expect(src).not.toContain('L.tileLayer(');
      expect(src).not.toContain('tile.openstreetmap.org');
    }
  });
});
