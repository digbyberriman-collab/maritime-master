/**
 * A text form of the whole site map (BUILD-PLAN B8 snapshot): every node of
 * every tree with every field it carries, plus the placeholder and redirect
 * lists generated from them. One line per node, so a change shows up as a
 * readable diff against the committed baseline.
 */
import * as sitemap from '@/config/sitemap';
import type { NavChild, NavItem, VesselModule } from '@/config/navigation-types';

const iconName = (icon: unknown): string => {
  const t = icon as { displayName?: string; name?: string } | undefined;
  return t?.displayName || t?.name || '?';
};

function nodeLine(node: NavChild | NavItem | VesselModule, depth: number): string {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === 'children' || key === 'icon' || value === undefined) continue;
    fields[key] = value;
  }
  return `${'  '.repeat(depth)}${iconName(node.icon)} ${JSON.stringify(fields)}`;
}

function treeLines(items: readonly (NavChild | NavItem | VesselModule)[], depth = 0, acc: string[] = []): string[] {
  for (const item of items) {
    acc.push(nodeLine(item, depth));
    if (item.children?.length) treeLines(item.children, depth + 1, acc);
  }
  return acc;
}

export function sitemapSnapshot(): Record<string, string[]> {
  return {
    NAVIGATION_ITEMS: treeLines(sitemap.NAVIGATION_ITEMS),
    VESSEL_MODULES: treeLines(sitemap.VESSEL_MODULES),
    buildVesselNav: treeLines(sitemap.buildVesselNav('DRA')),
    PLACEHOLDER_LEAVES: sitemap.PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    FLEET_PLACEHOLDER_LEAVES: sitemap.FLEET_PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    VESSEL_PLACEHOLDER_LEAVES: sitemap.VESSEL_PLACEHOLDER_LEAVES.map((l) => `${l.path} ${l.label}`),
    VESSEL_ROOT_REDIRECTS: sitemap.VESSEL_ROOT_REDIRECTS.map((r) => `${r.from} -> ${r.to}`),
    SECTION_REDIRECTS: sitemap.SECTION_REDIRECTS.map((r) => `${r.from} -> ${r.to}`),
  };
}
