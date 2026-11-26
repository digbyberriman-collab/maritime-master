/**
 * Nav slots: the fixed places in the shell that module manifests fill
 * (gap/00 "Registration flow" and F0.3; gap/10 owns the order).
 *
 * A module never edits the site map. It ships `nav` fragments in its
 * `module.ts` (`{ slot, order, node }`), and the assembler in
 * src/config/sitemap.ts merges each fragment into its slot here, sorted by
 * `order` with the platform's own entries. Adding a slot is a shell change;
 * adding a leaf to an existing slot is not.
 *
 * - `fleet.*`: the six section headings of the Fleet sidebar (gap/10 IA7, R1).
 * - `vessel.*`: one per vessel tab, in tab order; the slot fills that tab's
 *   sidebar. Paths in a vessel fragment are relative to `/v/:vesselCode`.
 * - `workspace.*`: the sidebar of a STORM workspace (D-09). Legal's tree is
 *   its four tabs (gap/10 Workspaces table, D-83); it stays at
 *   `/departments/legal` (R4) and is also linked from `fleet.workspaces`.
 * - `personal.*`: sections of the personal tree (src/config/personalNav.ts)
 *   that modules add to. `personal.my_work` is MY WORK: a module's own pages
 *   for the signed-in user, at absolute paths under `/me`.
 *
 * This file stays light (lucide icons and types only): the sitemap and every
 * manifest import it eagerly.
 */
import { Briefcase, Hammer, Heart, Scale, Waves, type LucideIcon } from 'lucide-react';

export const FLEET_SLOTS = [
  'fleet.overview',
  'fleet.compliance',
  'fleet.people',
  'fleet.workspaces',
  'fleet.administration',
  'fleet.configuration',
] as const;

/** In vessel tab order; each id after the dot is a `VESSEL_MODULES` id. */
export const VESSEL_SLOTS = [
  'vessel.home',
  'vessel.crew',
  'vessel.safety',
  'vessel.certificates',
  'vessel.technical',
  'vessel.charter',
  'vessel.vessel',
  'vessel.logbooks',
  'vessel.finance',
  'vessel.departments',
  'vessel.calendar',
  'vessel.reports',
] as const;

export const WORKSPACE_SLOTS = ['workspace.shoreside', 'workspace.health', 'workspace.yard', 'workspace.hris', 'workspace.legal'] as const;

export const PERSONAL_SLOTS = ['personal.my_work'] as const;

export type FleetSlotId = (typeof FLEET_SLOTS)[number];
export type VesselSlotId = (typeof VESSEL_SLOTS)[number];
export type WorkspaceSlotId = (typeof WORKSPACE_SLOTS)[number];
export type PersonalSlotId = (typeof PERSONAL_SLOTS)[number];
export type NavSlotId = FleetSlotId | VesselSlotId | WorkspaceSlotId | PersonalSlotId;

export const NAV_SLOTS: readonly NavSlotId[] = [...FLEET_SLOTS, ...VESSEL_SLOTS, ...WORKSPACE_SLOTS, ...PERSONAL_SLOTS];

const SLOT_SET = new Set<string>(NAV_SLOTS);

export const isNavSlot = (slot: string): slot is NavSlotId => SLOT_SET.has(slot);

/** The vessel slot of a `VESSEL_MODULES` id (`crew` → `vessel.crew`). */
export const vesselSlot = (moduleId: string): VesselSlotId => `vessel.${moduleId}` as VesselSlotId;

/**
 * A workspace with a sidebar tree of its own: a top-level module of today's
 * shell, after Fleet and Vessel, in this order. Its children are its slot.
 */
export interface WorkspaceTree {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The workspace's URL prefix (D-09: unchanged). */
  path: string;
  slot: WorkspaceSlotId;
}

export const WORKSPACE_TREES: readonly WorkspaceTree[] = [
  { id: 'shoreside', label: 'Shoreside', icon: Waves, path: '/shoreside', slot: 'workspace.shoreside' },
  { id: 'health', label: 'Health & Wellness', icon: Heart, path: '/health', slot: 'workspace.health' },
  { id: 'yard', label: 'Yard', icon: Hammer, path: '/yard', slot: 'workspace.yard' },
  { id: 'hris', label: 'HRIS', icon: Briefcase, path: '/hris', slot: 'workspace.hris' },
  // R4: Legal keeps its department URL. A literal, not LEGAL_ROOT, so this
  // file stays free of module imports.
  { id: 'legal', label: 'Legal', icon: Scale, path: '/departments/legal', slot: 'workspace.legal' },
];
