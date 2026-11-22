/**
 * The command palette's fuzzy scorer (gap/10 IA12, BUILD-PLAN S5): tiers,
 * word starts, multi-word queries, case and diacritics, and the cmdk filter
 * built on it.
 */
import { describe, expect, it } from 'vitest';
import { LayoutDashboard, Ship } from 'lucide-react';
import {
  COMBINED_KEYWORD_WEIGHT,
  fuzzyScore,
  normaliseSearchText,
  scoreKeywords,
  SECONDARY_KEYWORD_WEIGHT,
} from '@/shared/components/command-palette/fuzzy';
import {
  EMPTY_QUERY_PAGE_LIMIT,
  paletteGroups,
  rankItems,
  suggestedPages,
  type PaletteItem,
  type PaletteSource,
} from '@/shared/components/command-palette/model';

const rank = (query: string, texts: string[]) =>
  texts
    .map((text) => ({ text, score: fuzzyScore(query, text) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.text);

describe('normaliseSearchText', () => {
  it('lower-cases, strips diacritics and collapses spaces', () => {
    expect(normaliseSearchText('  Médecin   à bord ')).toBe('medecin a bord');
    expect(normaliseSearchText('ÅLESUND Øresund')).toBe('alesund øresund');
  });
});

describe('fuzzyScore', () => {
  it('an empty query matches everything; no match scores 0', () => {
    expect(fuzzyScore('', 'Crew list')).toBe(1);
    expect(fuzzyScore('   ', 'Crew list')).toBe(1);
    expect(fuzzyScore('zzz', 'Crew list')).toBe(0);
    expect(fuzzyScore('crew', '')).toBe(0);
    expect(fuzzyScore('lc', 'Crew list')).toBe(0); // order matters
  });

  it('ranks exact > prefix > word start > word-start initials > inside a word > scattered', () => {
    const exact = fuzzyScore('crew', 'Crew');
    const prefix = fuzzyScore('crew', 'Crew list');
    const wordStart = fuzzyScore('list', 'Crew list');
    const initials = fuzzyScore('cl', 'Crew list');
    const inside = fuzzyScore('rew', 'Crew list');
    const scattered = fuzzyScore('rwi', 'Crew list');
    expect(exact).toBe(1);
    expect(prefix).toBeGreaterThanOrEqual(0.9);
    expect(prefix).toBeLessThan(exact);
    expect(wordStart).toBeGreaterThanOrEqual(0.7);
    expect(wordStart).toBeLessThan(0.9);
    expect(initials).toBeLessThan(wordStart);
    expect(inside).toBeGreaterThanOrEqual(0.45);
    expect(inside).toBeLessThan(initials);
    expect(scattered).toBeGreaterThan(0);
    expect(scattered).toBeLessThan(inside);
  });

  it('prefers word starts in scattered matches ("hor" → Hours of rest)', () => {
    expect(fuzzyScore('hor', 'Hours of rest')).toBeGreaterThan(fuzzyScore('hor', 'Anchorage plan'));
    expect(rank('hor', ['Anchorage plan', 'Hours of rest'])[0]).toBe('Hours of rest');
    expect(fuzzyScore('cc', 'Change control')).toBeGreaterThan(fuzzyScore('cc', 'Occurrence'));
  });

  it('a shorter text wins among equal prefix matches', () => {
    expect(fuzzyScore('crew', 'Crew')).toBeGreaterThan(fuzzyScore('crew', 'Crew list'));
    expect(fuzzyScore('cert', 'Certificates')).toBeGreaterThan(fuzzyScore('cert', 'Certificates and surveys'));
  });

  it('ignores case and diacritics on both sides', () => {
    expect(fuzzyScore('MEDECIN', 'Médecin à bord')).toBeGreaterThanOrEqual(0.9);
    expect(fuzzyScore('médecin', 'Medecin a bord')).toBeGreaterThanOrEqual(0.9);
    expect(fuzzyScore('dra', 'DRAAK')).toBeGreaterThanOrEqual(0.9);
  });

  it('every word of a multi-word query must match, in any order', () => {
    expect(fuzzyScore('crew li', 'Crew list')).toBeGreaterThanOrEqual(0.9);
    expect(fuzzyScore('list crew', 'Crew list')).toBeGreaterThan(0);
    expect(fuzzyScore('list crew', 'Crew list')).toBeLessThan(0.9);
    expect(fuzzyScore('crew drills', 'Crew list')).toBe(0);
  });

  it('separators count as word boundaries (slashes, dashes, ›)', () => {
    expect(fuzzyScore('plan', 'Vessel › Crew › Planner')).toBeGreaterThanOrEqual(0.7);
    expect(fuzzyScore('061', 'PTW-DRA-2026-061')).toBeGreaterThanOrEqual(0.7);
  });
});

describe('scoreKeywords and the cmdk filter', () => {
  it('the label counts most, other keywords a little less', () => {
    const onLabel = scoreKeywords('training', ['Training', 'Fleet', 'People']);
    const onTrail = scoreKeywords('people', ['Training', 'Fleet', 'People']);
    expect(onLabel).toBe(1);
    expect(onTrail).toBeCloseTo(SECONDARY_KEYWORD_WEIGHT, 5);
    expect(onTrail).toBeLessThan(onLabel);
  });

  it('a query spread over label and trail still matches, below a direct hit', () => {
    const spread = scoreKeywords('crew training', ['Training', 'Vessel', 'Crew']);
    expect(spread).toBeGreaterThan(0);
    expect(spread).toBeLessThanOrEqual(COMBINED_KEYWORD_WEIGHT);
    expect(scoreKeywords('crew training', ['Crew training'])).toBeGreaterThan(spread);
  });

  it('an empty query matches every item', () => {
    expect(scoreKeywords('', ['Dashboard'])).toBe(1);
    expect(scoreKeywords('  ', [])).toBe(1);
    expect(scoreKeywords('dash', [])).toBe(0);
  });

  it('finds a vessel by name, code or IMO number', () => {
    const keywords = ['GAME CHANGER', 'GAM', '9781234'];
    expect(scoreKeywords('game', keywords)).toBeGreaterThan(0.9);
    expect(scoreKeywords('gam', keywords)).toBeGreaterThan(0.9);
    expect(scoreKeywords('97812', keywords)).toBeGreaterThan(0.7);
    expect(scoreKeywords('hydra', keywords)).toBe(0);
  });
});

const page = (id: string, label: string, trail: string[], scope = 'fleet'): PaletteItem => ({
  id: `page:${id}`,
  group: 'pages',
  label,
  subtitle: trail.join(' › '),
  keywords: [label, ...trail],
  icon: LayoutDashboard,
  scope,
  recordable: true,
  perform: { kind: 'navigate', to: id },
});
const vessel = (id: string, name: string, code: string): PaletteItem => ({
  id: `vessel:${id}`,
  group: 'vessels',
  label: name,
  keywords: [name, code],
  icon: Ship,
  chip: code,
  recordable: true,
  perform: { kind: 'switch-vessel', vessel: { id, code } },
});
const ready = (items: PaletteItem[]): PaletteSource => ({ status: 'ready', items });
const loading: PaletteSource = { status: 'loading', items: [] };

describe('ranking and groups', () => {
  const pages = [
    page('/health/history', 'Incident & Treatment History', ['Health & Wellness', 'Medical', 'Personnel Medical Data'], 'workspace'),
    page('/fleet/dashboard', 'Dashboard', ['Fleet', 'Overview']),
    page('/v/:vesselCode/crew/list', 'Crew list', ['Vessel', 'Crew'], 'vessel'),
  ];
  const vessels = [vessel('v-dra', 'DRAAK', 'DRA'), vessel('v-hyd', 'HYDRA', 'HYD')];

  it('rankItems keeps matches only, best first, ties in source order', () => {
    expect(rankItems('hyd', vessels).items.map((i) => i.label)).toEqual(['HYDRA']);
    const crew = rankItems('crew', pages);
    expect(crew.items[0].label).toBe('Crew list');
    expect(crew.best).toBeGreaterThan(0.9);
    expect(rankItems('zzz', pages)).toEqual({ items: [], best: 0 });
    // Equal scores keep the given order.
    expect(rankItems('d', [page('/a', 'Docs', []), page('/b', 'Drills', [])]).items.map((i) => i.label)).toEqual(['Docs', 'Drills']);
  });

  it('the group with the best match comes first, so the top result is the first option', () => {
    const groups = paletteGroups('hyd', { pages: ready(pages), vessels: ready(vessels), actions: ready([]) });
    expect(groups.map((g) => g.id)).toEqual(['vessels', 'pages']);
    expect(groups[0].items[0].label).toBe('HYDRA');
  });

  it('a query drops empty groups and keeps loading groups last, as one skeleton', () => {
    const groups = paletteGroups('crew', { pages: ready(pages), vessels: loading, actions: ready([]) });
    expect(groups.map((g) => [g.id, g.status])).toEqual([
      ['pages', 'ready'],
      ['vessels', 'loading'],
    ]);
    expect(groups[1].items).toEqual([]);
  });

  it('no query: suggested pages (current scope first, capped), then vessels and actions', () => {
    const many = Array.from({ length: 10 }, (_, i) => page(`/v/:vesselCode/r${i}`, `Register ${i}`, ['Vessel'], 'vessel'));
    const groups = paletteGroups('', { pages: ready([...pages, ...many]), vessels: ready(vessels), actions: ready([]) }, 'vessel');
    expect(groups.map((g) => g.id)).toEqual(['pages', 'vessels']);
    expect(groups[0].items).toHaveLength(EMPTY_QUERY_PAGE_LIMIT);
    expect(groups[0].items[0].label).toBe('Crew list');
    expect(groups[0].more).toBe(13 - EMPTY_QUERY_PAGE_LIMIT);
    expect(suggestedPages(pages, 'fleet').map((p) => p.label)).toEqual(['Dashboard', 'Incident & Treatment History', 'Crew list']);
    // Still loading: a skeleton group, never the unfiltered list.
    expect(paletteGroups('', { pages: loading, vessels: ready(vessels), actions: ready([]) })[0]).toEqual({
      id: 'pages',
      heading: 'Pages',
      status: 'loading',
      items: [],
      more: 0,
    });
  });
});
