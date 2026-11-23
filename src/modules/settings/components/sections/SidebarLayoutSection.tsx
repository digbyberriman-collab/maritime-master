/**
 * Sidebar layout (/me/sidebar-layout; gap/10 IA5–IA7; D-112): the order of
 * the pages inside each sidebar section, on this device.
 *
 * Built on the shell's own pipeline, so every row is one the user's sidebar
 * draws and every control writes a key the shell reads (D-04: no control
 * without effect):
 *
 *   Fleet       useFilteredModuleTree(the Fleet tree): only with fleet reach
 *               (`decide` hides it otherwise, D-26). Its sections order under
 *               'fleet', each group's children under the group's id.
 *   Workspaces  one block per workspace the Apps gate opens
 *               (useWorkspaceRootGate), ordered under the workspace's id.
 *   Personal    usePersonalNav().nodes, under 'personal'.
 *   Vessel      useVesselNav().tabs for the default vessel, as fixed
 *               headings (the gap/10 tab order is fixed); only each tab's
 *               pages reorder, under `vessel-<tab>` (what buildVesselTabs
 *               reads). Locked tabs and tabs without pages are left out.
 *
 * Trees and tabs are headings with no move or drag controls. Planned leaves
 * follow Show roadmap and the capability and scope gates apply, because the
 * rows come from `decide`. A move swaps the row with its visible neighbour
 * and rewrites only the visible ids' places, so each click visibly moves the
 * row and saved ids that are hidden now keep their place. Skeleton rows show
 * until access, the personal tree, the vessel's settings and the workspace
 * gate are in (fail closed); then the stale '__root' and 'vessel' keys,
 * which nothing reads, are pruned.
 *
 * D-79: the section keeps its own visible h2; Settings renders the sr-only h1.
 */
import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  GripVertical,
  Lock,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { NAVIGATION_ITEMS } from '@/config/sitemap';
import { WORKSPACE_TREES, type WorkspaceTree } from '@/config/navSlots';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useNavNodeFilter } from '@/app/nav/useNavNodeFilter';
import { useFilteredModuleTree } from '@/app/nav/useFilteredTree';
import { PERSONAL_TREE_ID, usePersonalNav } from '@/app/nav/usePersonalNav';
import { useVesselNav, type VesselNavModel } from '@/app/nav/useVesselNav';
import { useWorkspaceRootGate } from '@/app/nav/workspaceAccess';
import type { FilteredNavNode } from '@/app/nav/navTree';
import { SIDEBAR_ROOT, useSidebarOrder } from '@/shared/hooks/useSidebarOrder';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/shared/hooks/use-toast';
import { cn } from '@/lib/utils';

const FLEET_MODULE = NAVIGATION_ITEMS.find((item) => item.id === 'fleet') ?? null;
const PERSONAL_MODULE = NAVIGATION_ITEMS.find((item) => item.id === PERSONAL_TREE_ID) ?? null;
/** The vessel pattern tree's id: its tab order is fixed, so nothing reads an order under it. */
const VESSEL_TREE_ID = 'vessel';
/** Keys no consumer reads (D-112): the old module order and the old vessel tab order. */
const STALE_KEYS = [SIDEBAR_ROOT, VESSEL_TREE_ID];

/** The visible ids of a branch, in `next` order, written into `base`: hidden ids keep their slots. */
function withVisibleOrder(base: readonly string[], next: readonly string[]): string[] {
  const visible = new Set(next);
  const unique = Array.from(new Set(base));
  if (unique.filter((id) => visible.has(id)).length !== next.length) {
    return [...next, ...unique.filter((id) => !visible.has(id))];
  }
  let i = 0;
  return unique.map((id) => (visible.has(id) ? next[i++] : id));
}

const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i]);

type FocusTarget = 'row' | 'up' | 'down';

/** What every tree needs from the page. */
interface TreeShared {
  readOnly: boolean;
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string) => void;
  /** Store a branch's new visible order (`next`, a permutation of `visible`). */
  saveOrder: (groupKey: string, visible: readonly string[], next: readonly string[]) => void;
  announce: (message: string) => void;
}

// ─── One row ──────────────────────────────────────────────────────────────

interface RowProps {
  id: string;
  label: string;
  icon: LucideIcon;
  index: number;
  total: number;
  depth: number;
  planned: boolean;
  locked: boolean;
  expandable: boolean;
  expanded: boolean;
  childCount: number;
  dragging: boolean;
  over: boolean;
  readOnly: boolean;
  onToggleExpand: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onMove: (direction: 'up' | 'down', focus: FocusTarget) => void;
}

const RowImpl: React.FC<RowProps> = ({
  id,
  label,
  icon: Icon,
  index,
  total,
  depth,
  planned,
  locked,
  expandable,
  expanded,
  childCount,
  dragging,
  over,
  readOnly,
  onToggleExpand,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onMove,
}) => {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const movable = !readOnly && total > 1;

  // Keyboard (focus on the row): Ctrl/Cmd + ArrowUp/Down reorders within the
  // group; ArrowRight / ArrowLeft and Enter / Space expand and collapse.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const reorder = e.ctrlKey || e.metaKey;
    if (reorder && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (!movable) return;
      const direction = e.key === 'ArrowUp' ? 'up' : 'down';
      if ((direction === 'up' && isFirst) || (direction === 'down' && isLast)) return;
      e.preventDefault();
      onMove(direction, 'row');
    } else if (expandable && e.key === 'ArrowRight' && !expanded) {
      e.preventDefault();
      onToggleExpand();
    } else if (expandable && e.key === 'ArrowLeft' && expanded) {
      e.preventDefault();
      onToggleExpand();
    } else if (expandable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onToggleExpand();
    }
  };

  const items = `${childCount} ${childCount === 1 ? 'page' : 'pages'}`;
  return (
    <div
      data-order-row={id}
      draggable={movable}
      role="treeitem"
      tabIndex={0}
      aria-level={depth + 1}
      aria-setsize={total}
      aria-posinset={index + 1}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={expandable ? `${label}, ${items}, position ${index + 1} of ${total}` : `${label}, position ${index + 1} of ${total}`}
      onKeyDown={handleKeyDown}
      onDragStart={() => movable && onDragStart()}
      onDragEnd={() => movable && onDragEnd()}
      onDragOver={(e) => {
        if (!movable) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        if (!movable) return;
        e.preventDefault();
        onDrop();
      }}
      style={{ marginLeft: depth * 20 }}
      className={cn(
        'flex min-h-[var(--control-h)] items-center gap-2 rounded-md border border-border bg-background px-2',
        'transition-colors duration-quick ease-tide hover:bg-accent/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        dragging && 'opacity-50',
        over && 'border-primary ring-1 ring-primary',
      )}
    >
      <GripVertical
        aria-hidden="true"
        className={cn(
          'h-4 w-4 shrink-0 text-muted-foreground',
          movable ? 'cursor-grab active:cursor-grabbing' : 'opacity-40',
        )}
      />
      {expandable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          tabIndex={-1}
          onClick={onToggleExpand}
          aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={expanded}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        </Button>
      ) : (
        <span aria-hidden="true" className="w-[var(--control-h)] shrink-0" />
      )}
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="type-body min-w-0 flex-1 truncate font-medium text-foreground">{label}</span>
      {locked && (
        <span className="type-caption inline-flex shrink-0 items-center gap-1 text-muted-foreground">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Add-on
        </span>
      )}
      {planned && (
        <Badge variant="outline" className="type-caption shrink-0 font-normal text-muted-foreground">
          Planned
        </Badge>
      )}
      {expandable && (
        <Badge variant="secondary" className="type-caption hidden shrink-0 font-normal sm:inline-flex">
          {items}
        </Badge>
      )}
      <span className="type-caption w-6 shrink-0 text-right tabular-nums text-muted-foreground" aria-hidden="true">
        {index + 1}
      </span>
      {!movable && (
        // Keeps the position column aligned with the rows that have arrows.
        <span aria-hidden="true" className="w-[calc(2*var(--control-h)+0.125rem)] shrink-0" />
      )}
      {movable && (
        // Always shown (no hover reveal): on touch and on narrow screens alike, a
        // control is where it can be seen (D-35).
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-move="up"
            disabled={isFirst}
            onClick={() => onMove('up', 'up')}
            aria-label={`Move ${label} up`}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-move="down"
            disabled={isLast}
            onClick={() => onMove('down', 'down')}
            aria-label={`Move ${label} down`}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
};
// Memoised so unrelated rows don't re-render on drag-over / expand changes.
const Row = React.memo(RowImpl);

const SkeletonRow: React.FC<{ depth?: number }> = ({ depth = 0 }) => (
  <div style={{ marginLeft: depth * 20 }} className="flex min-h-[var(--control-h)] items-center gap-2 rounded-md border border-border px-2">
    <Skeleton className="h-4 w-4 rounded" />
    <Skeleton className="h-4 w-4 rounded" />
    <Skeleton className="h-4 max-w-[40%] flex-1" />
    <Skeleton className="h-4 w-6" />
  </div>
);

// ─── One tree (a section's pages) ─────────────────────────────────────────

interface OrderTreeProps {
  /** The key the top-level rows are ordered under ('fleet', 'hris', 'personal', 'vessel-crew'). */
  groupKey: string;
  label: string;
  nodes: readonly FilteredNavNode[];
  shared: TreeShared;
}

const OrderTree: React.FC<OrderTreeProps> = ({ groupKey, label, nodes, shared }) => {
  const { readOnly, isExpanded, toggleExpanded, saveOrder, announce } = shared;
  const { toast } = useToast();
  const [drag, setDrag] = React.useState<{ group: string; id: string } | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);
  const treeRef = React.useRef<HTMLDivElement>(null);
  // The row (or its arrow) to focus once a move has re-rendered the branch:
  // reordering moves the row's element, which drops its focus.
  const pendingFocus = React.useRef<{ id: string; target: FocusTarget } | null>(null);

  React.useEffect(() => {
    const wanted = pendingFocus.current;
    if (!wanted || !treeRef.current) return;
    pendingFocus.current = null;
    const row = Array.from(treeRef.current.querySelectorAll<HTMLElement>('[data-order-row]')).find(
      (el) => el.dataset.orderRow === wanted.id,
    );
    if (!row) return;
    const button = wanted.target === 'row' ? null : row.querySelector<HTMLButtonElement>(`[data-move="${wanted.target}"]`);
    (button && !button.disabled ? button : row).focus();
  });

  const clearDrag = () => {
    setDrag(null);
    setOverId(null);
  };

  const renderBranch = (branch: readonly FilteredNavNode[], group: string, depth: number): React.ReactNode => {
    const ids = branch.map((n) => n.id);
    const total = branch.length;
    const dragHere = drag?.group === group;

    const move = (id: string, label: string, direction: 'up' | 'down', focus: FocusTarget) => {
      if (readOnly) return;
      const from = ids.indexOf(id);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (from === -1 || to < 0 || to >= ids.length) return;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      pendingFocus.current = { id, target: focus };
      saveOrder(group, ids, next);
      announce(`${label} moved to position ${to + 1} of ${total}.`);
    };

    const drop = (targetId: string) => {
      const moved = drag?.id;
      clearDrag();
      if (readOnly || !moved || !dragHere || moved === targetId) return;
      const from = ids.indexOf(moved);
      const to = ids.indexOf(targetId);
      if (from === -1 || to === -1) return;
      const next = [...ids];
      next.splice(to, 0, next.splice(from, 1)[0]);
      saveOrder(group, ids, next);
      toast({ title: 'Sidebar order saved', description: 'Order updated for this section.' });
    };

    return branch.map((node, index) => {
      const children = node.locked ? [] : node.children ?? [];
      const expandable = children.length > 0;
      const expandKey = `${groupKey}:${node.id}`;
      const expanded = expandable && isExpanded(expandKey);
      return (
        <React.Fragment key={node.id}>
          <Row
            id={node.id}
            label={node.label}
            icon={node.icon}
            index={index}
            total={total}
            depth={depth}
            planned={node.status === 'planned'}
            locked={Boolean(node.locked)}
            expandable={expandable}
            expanded={expanded}
            childCount={children.length}
            dragging={dragHere && drag?.id === node.id}
            over={dragHere && overId === node.id && drag?.id !== node.id}
            readOnly={readOnly}
            onToggleExpand={() => toggleExpanded(expandKey)}
            onDragStart={() => setDrag({ group, id: node.id })}
            onDragEnd={clearDrag}
            onDragOver={() => {
              if (dragHere && overId !== node.id) setOverId(node.id);
            }}
            onDrop={() => drop(node.id)}
            onMove={(direction, focus) => move(node.id, node.label, direction, focus)}
          />
          {expanded && (
            <div role="group" className="space-y-1.5">
              {renderBranch(children, node.id, depth + 1)}
            </div>
          )}
        </React.Fragment>
      );
    });
  };

  return (
    <div ref={treeRef} role="tree" aria-label={label} className="space-y-1.5">
      {renderBranch(nodes, groupKey, 0)}
    </div>
  );
};

// ─── Blocks ───────────────────────────────────────────────────────────────

const Block: React.FC<{ id: string; title: string; icon: LucideIcon; note?: string; children: React.ReactNode }> = ({
  id,
  title,
  icon: Icon,
  note,
  children,
}) => (
  <section aria-labelledby={`sidebar-layout-${id}`} data-sidebar-layout-block={id} className="rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4">
    <div className="mb-3 flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <h3 id={`sidebar-layout-${id}`} className="type-title text-foreground">
          {title}
        </h3>
        {note && <p className="type-caption mt-0.5 text-muted-foreground">{note}</p>}
      </div>
    </div>
    {children}
  </section>
);

/** The Fleet tree: only with fleet reach (D-26), only when it has rows. */
const FleetBlock: React.FC<{ shared: TreeShared }> = ({ shared }) => {
  const { decide } = useNavNodeFilter();
  const nodes = useFilteredModuleTree(FLEET_MODULE);
  if (!FLEET_MODULE || decide(FLEET_MODULE) === 'hidden' || !nodes.length) return null;
  return (
    <Block id={FLEET_MODULE.id} title={FLEET_MODULE.label} icon={FLEET_MODULE.icon}>
      <OrderTree groupKey={FLEET_MODULE.id} label={`${FLEET_MODULE.label} pages`} nodes={nodes} shared={shared} />
    </Block>
  );
};

/** A workspace's tree, when the Apps gate opens the workspace (D-09; spec §6.3). */
const WorkspaceBlock: React.FC<{ tree: WorkspaceTree; shared: TreeShared }> = ({ tree, shared }) => {
  const module = React.useMemo(() => NAVIGATION_ITEMS.find((item) => item.id === tree.id) ?? null, [tree.id]);
  const gate = useWorkspaceRootGate();
  const nodes = useFilteredModuleTree(module);
  if (!module || !gate.canOpen(module.path) || !nodes.length) return null;
  return (
    <Block id={module.id} title={module.label} icon={module.icon}>
      <OrderTree groupKey={module.id} label={`${module.label} pages`} nodes={nodes} shared={shared} />
    </Block>
  );
};

const PersonalBlock: React.FC<{ nodes: readonly FilteredNavNode[]; shared: TreeShared }> = ({ nodes, shared }) => {
  if (!PERSONAL_MODULE || !nodes.length) return null;
  return (
    <Block id={PERSONAL_MODULE.id} title={PERSONAL_MODULE.label} icon={PERSONAL_MODULE.icon}>
      <OrderTree groupKey={PERSONAL_TREE_ID} label={`${PERSONAL_MODULE.label} pages`} nodes={nodes} shared={shared} />
    </Block>
  );
};

/** The vessel's tabs as fixed headings; only each tab's pages reorder. */
const VesselBlock: React.FC<{ nav: VesselNavModel; shared: TreeShared }> = ({ nav, shared }) => {
  const tabs = nav.tabs.filter((tab) => !tab.locked && tab.children.length > 0);
  if (!nav.vessel || !tabs.length) return null;
  return (
    <Block
      id={VESSEL_TREE_ID}
      title="Vessel"
      icon={NAVIGATION_ITEMS.find((item) => item.id === VESSEL_TREE_ID)?.icon ?? tabs[0].icon}
      note={`As shown for ${nav.vessel.name}. The tabs keep their fixed order; the order of the pages in each tab applies on every vessel.`}
    >
      <div className="space-y-4">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <div key={tab.id} className="space-y-1.5">
              <h4 className="type-eyebrow flex items-center gap-1.5 text-muted-foreground">
                <TabIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {tab.label}
              </h4>
              <OrderTree groupKey={`vessel-${tab.id}`} label={`${tab.label} pages`} nodes={tab.children} shared={shared} />
            </div>
          );
        })}
      </div>
    </Block>
  );
};

// ─── The section ──────────────────────────────────────────────────────────

const SidebarLayoutSection: React.FC = () => {
  const { loading, user } = useAuth();
  const { reorderGroup, removeGroups, reset } = useSidebarOrder();
  const { toast } = useToast();
  const filter = useNavNodeFilter();
  const personal = usePersonalNav();
  const vesselNav = useVesselNav();
  const workspaceGate = useWorkspaceRootGate();
  const [expandAll, setExpandAll] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = React.useState('');

  // Read-only when not signed in: preview the layout, persist nothing.
  const readOnly = !loading && !user;
  // Fail closed (D-04): no rows until every tree the shell draws is known.
  const ready = filter.ready && personal.ready && vesselNav.status !== 'loading' && workspaceGate.ready;

  React.useEffect(() => {
    if (ready && !readOnly) removeGroups(STALE_KEYS);
  }, [ready, readOnly, removeGroups]);

  const isExpanded = React.useCallback((key: string) => overrides[key] ?? expandAll, [overrides, expandAll]);
  const toggleExpanded = React.useCallback(
    (key: string) => setOverrides((prev) => ({ ...prev, [key]: !(prev[key] ?? expandAll) })),
    [expandAll],
  );
  const saveOrder = React.useCallback(
    (groupKey: string, visible: readonly string[], next: readonly string[]) => {
      if (readOnly || sameOrder(visible, next)) return;
      // The stored order, else the visible one; ids shown now but not stored are appended.
      reorderGroup(groupKey, [...visible], (base) => withVisibleOrder(base, next));
    },
    [readOnly, reorderGroup],
  );
  const shared = React.useMemo<TreeShared>(
    () => ({ readOnly, isExpanded, toggleExpanded, saveOrder, announce: setAnnouncement }),
    [readOnly, isExpanded, toggleExpanded, saveOrder],
  );

  const toggleAll = () => {
    setExpandAll((prev) => !prev);
    setOverrides({});
  };

  const handleReset = () => {
    if (readOnly) return;
    reset();
    toast({ title: 'Sidebar layout reset', description: 'Default order restored.' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-prose">
          <h2 className="type-display text-foreground">Sidebar layout</h2>
          <p className="type-body mt-1 text-muted-foreground">
            Reorder the pages inside each sidebar section. Changes save on this device and apply to your sidebar and search.
          </p>
          <p className="type-caption mt-2 text-muted-foreground">
            Drag a row, use its arrows, or focus it and press Ctrl with the up or down arrow (⌘ on a Mac). Sections and vessel
            tabs keep their fixed order.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={toggleAll} disabled={!ready}>
            {expandAll ? <ChevronsDownUp aria-hidden="true" /> : <ChevronsUpDown aria-hidden="true" />}
            {expandAll ? 'Collapse all' : 'Expand all'}
          </Button>
          <Button type="button" variant="outline" onClick={handleReset} disabled={readOnly || !ready}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
        </div>
      </div>

      {readOnly && (
        <Alert>
          <Lock className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Read-only preview</AlertTitle>
          <AlertDescription>Sign in to change the order of your sidebar. Nothing here is saved.</AlertDescription>
        </Alert>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {!ready ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3 sm:p-4" aria-busy="true" aria-label="Loading sidebar layout">
          <Skeleton className="mb-3 h-5 w-32" />
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <FleetBlock shared={shared} />
          {WORKSPACE_TREES.map((tree) => (
            <WorkspaceBlock key={tree.id} tree={tree} shared={shared} />
          ))}
          <PersonalBlock nodes={personal.nodes} shared={shared} />
          <VesselBlock nav={vesselNav} shared={shared} />
        </div>
      )}
    </div>
  );
};

export default SidebarLayoutSection;
