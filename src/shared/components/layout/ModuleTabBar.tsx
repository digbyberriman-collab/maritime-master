/**
 * The vessel module tab row (gap/10 IA5, "Vessel view"; BUILD-PLAN S2; spec
 * §5.4): 44 px under the top bar, on the same surface, in `VESSEL_MODULES`
 * order, filtered for this vessel and viewer (`useVesselNav`: module
 * settings, status, capability, add-on lock; labels last).
 *
 * - Tabs are links with `aria-current="page"`; a Signal underline slides to
 *   the active tab (jumps under reduced motion). It and the fit re-measure
 *   whenever any tab changes width (badge counts arriving, fonts, markers),
 *   not only when the tab list changes.
 * - Below 768 px the row scrolls inside itself, the active tab kept in view;
 *   from 768 px the tabs that do not fit go into "More ▾", which carries a
 *   dot (critical or Signal) when a folded tab has a badge (IA21, D-78).
 * - The row is 44 px with a layout-free divider, so each tab is a full 44 px
 *   target on coarse pointers (D-35).
 * - "← Fleet" only with fleet reach (D-26), to the Fleet counterpart when the
 *   viewer can see it, else the fleet dashboard. The cog only for Vessel
 *   Settings access (D-33; src/app/nav/vesselSettingsLink.ts).
 * - Locked add-on tabs show a lock and explain the add-on; they never navigate.
 * - Planned tabs (Show roadmap on) carry a "Planned" marker (W3).
 * - While the vessel's settings load: skeleton tabs, never an unfiltered row.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Lock, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavAccess } from '@/app/nav/navAccess';
import { useVesselNav, type VesselTab } from '@/app/nav/useVesselNav';
import { useNavBadges, type NavBadge } from '@/app/nav/badges';
import { useVesselSettingsAccess, vesselSettingsHref } from '@/app/nav/vesselSettingsLink';
import { SHELL_TEST_IDS } from '@/app/shell/testIds';
import { SHELL_MEDIA, useMediaQuery } from '@/app/shell/useMediaQuery';
import { useFleetTarget } from './topbar/useFleetTarget';
import AddOnLock from './AddOnLock';
import { fitTabCount } from './moduleTabFit';
import { useSlidingIndicator } from './useSlidingIndicator';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring';

const tabClass = (active: boolean) =>
  cn(
    'relative inline-flex h-full shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-sm px-3 type-body font-medium transition-colors duration-quick ease-tide',
    focusRing,
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
  );

const PlannedMarker: React.FC = () => (
  <span className="type-eyebrow rounded-sm px-1 py-0.5 text-[0.625rem] leading-none text-muted-foreground ring-1 ring-inset ring-border">
    Planned
  </span>
);

const CountDot: React.FC<{ badge: NavBadge }> = ({ badge }) => (
  <span
    aria-hidden="true"
    data-count-dot=""
    className={cn(
      'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] font-semibold leading-none tabular-nums',
      badge.tone === 'critical' ? 'bg-critical text-critical-foreground' : 'bg-primary text-primary-foreground',
    )}
  >
    {badge.text}
  </span>
);

/** The label, icon and markers of a tab (shared by the row, the measurer and More). */
const TabContent: React.FC<{ tab: VesselTab; badge: NavBadge | null }> = ({ tab, badge }) => {
  const Icon = tab.icon;
  return (
    <>
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>{tab.label}</span>
      {tab.status === 'planned' && <PlannedMarker />}
      {tab.locked && <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
      {badge && <CountDot badge={badge} />}
    </>
  );
};

const tabAccessibleName = (tab: VesselTab, badge: NavBadge | null) =>
  `${tab.label}${tab.status === 'planned' ? ', planned' : ''}${tab.locked ? ', add-on, locked' : ''}${badge ? `, ${badge.label}` : ''}`;

type MoreTone = 'critical' | 'primary';

/** The 8 px dot on "More" when a folded tab has a badge (static: nothing to reduce for motion). */
const MoreDot: React.FC<{ tone: MoreTone | null }> = ({ tone }) => (
  <span
    aria-hidden="true"
    data-more-badge={tone ?? undefined}
    className={cn('h-2 w-2 shrink-0 rounded-full', tone === 'critical' ? 'bg-critical' : tone === 'primary' ? 'bg-primary' : undefined)}
  />
);

const SkeletonTabs: React.FC = () => (
  <div role="status" aria-busy="true" className="flex h-full items-center gap-4 px-3">
    {[56, 64, 72, 88].map((w) => (
      <span key={w} className="h-3.5 rounded bg-muted motion-safe:animate-pulse" style={{ width: w }} />
    ))}
    <span className="sr-only">Loading this vessel's modules</span>
  </div>
);

const ModuleTabBar: React.FC<{ className?: string }> = ({ className }) => {
  const nav = useVesselNav();
  const { fleetReach } = useNavAccess();
  const fleetTarget = useFleetTarget();
  const canOpenSettings = useVesselSettingsAccess();
  const badgeFor = useNavBadges();
  const wide = useMediaQuery(SHELL_MEDIA.md);
  const reducedMotion = useMediaQuery(REDUCED_MOTION);

  const tabs = nav.tabs;
  const activeId = nav.activeTabId;
  const tabKey = tabs.map((t) => `${t.id}:${t.label}:${t.status}:${t.locked ? 1 : 0}`).join('|');
  // A badge widens its tab (and moves every tab after it): re-measure when the counts arrive or change.
  const badgeSig = tabs.map((t) => badgeFor(t.badgeKey)?.text ?? '').join('|');

  // ≥ 768 px: how many tabs fit beside "More". Measured from a hidden copy of the row.
  const activeIndex = tabs.findIndex((t) => t.id === activeId);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [fit, setFit] = React.useState<number>(Number.POSITIVE_INFINITY);
  React.useLayoutEffect(() => {
    if (!wide) {
      setFit(Number.POSITIVE_INFINITY);
      return undefined;
    }
    const box = boxRef.current;
    const measurer = measureRef.current;
    if (!box || !measurer) return undefined;
    const measure = () => {
      const width = (el: Element | null) => el?.getBoundingClientRect().width ?? 0;
      const widths = Array.from(measurer.querySelectorAll<HTMLElement>('[data-measure-tab]')).map(width);
      const more = width(measurer.querySelector('[data-measure-more]'));
      // The tabs sit inside the rail's horizontal padding; without it the last tab or More runs into "← Fleet".
      const rail = railRef.current;
      const railStyle = rail ? window.getComputedStyle(rail) : null;
      const railPadding = railStyle ? (parseFloat(railStyle.paddingLeft) || 0) + (parseFloat(railStyle.paddingRight) || 0) : 0;
      const available = box.getBoundingClientRect().width - railPadding;
      // Nothing measurable (no layout yet, or a test without one): show every tab.
      if (available <= 0 || widths.every((w) => w <= 0)) {
        setFit(Number.POSITIVE_INFINITY);
        return;
      }
      let count = fitTabCount(widths, available, more, 2);
      // The active tab landed in More: More grows by "· <label>", so fit again.
      if (activeIndex >= count) {
        const suffix = width(measurer.querySelector(`[data-measure-more-suffix="${activeId}"]`));
        count = fitTabCount(widths, available, more + suffix, 2);
      }
      setFit(count);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    // The measurer is absolute and shrink-to-fit, clamped to the nav, so its own box never changes:
    // watch each measured copy, so any tab growing (a count, a font, a marker) re-fits the row.
    measurer
      .querySelectorAll('[data-measure-tab],[data-measure-more],[data-measure-more-suffix]')
      .forEach((el) => observer.observe(el));
    void document.fonts?.ready?.then(measure).catch(() => undefined);
    return () => observer.disconnect();
  }, [wide, tabKey, activeId, activeIndex, badgeSig]);

  const shown = wide && fit < tabs.length ? tabs.slice(0, fit) : tabs;
  const overflow = wide && fit < tabs.length ? tabs.slice(fit) : [];
  const activeInMore = overflow.find((t) => t.id === activeId) ?? null;
  // Folded tabs keep their counts visible on More (IA21). Locked tabs count too: the menu shows their badges.
  const overflowBadges = overflow
    .map((t) => ({ tab: t, badge: badgeFor(t.badgeKey) }))
    .filter((x): x is { tab: VesselTab; badge: NavBadge } => x.badge !== null);
  const moreTone: MoreTone | null = overflowBadges.some((x) => x.badge.tone === 'critical')
    ? 'critical'
    : overflowBadges.length
      ? 'primary'
      : null;
  const moreName = `More modules${activeInMore ? `, current: ${activeInMore.label}` : ''}${
    overflowBadges.length ? `, ${overflowBadges.map((x) => `${x.tab.label}: ${x.badge.label}`).join('; ')}` : ''
  }`;

  const railRef = React.useRef<HTMLDivElement>(null);
  const activeRef = React.useRef<HTMLElement | null>(null);
  const shownCount = shown.length;
  const overflowCount = overflow.length;
  const status = nav.status;
  // The active tab, or "More" when the active tab is inside it (before the indicator measures).
  React.useLayoutEffect(() => {
    activeRef.current = railRef.current?.querySelector<HTMLElement>('[data-tab-active="true"]') ?? null;
  }, [activeId, tabKey, shownCount, overflowCount, wide, status, badgeSig]);
  const indicator = useSlidingIndicator(railRef, activeRef, [activeId, tabKey, shownCount, overflowCount, wide, status, badgeSig]);

  // Below 768 px keep the active tab in view inside the scrolling row.
  React.useEffect(() => {
    if (wide) return;
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }, [activeId, wide, reducedMotion, tabKey]);

  const vessel = nav.vessel;
  const showSettings = Boolean(vessel) && canOpenSettings;

  const renderTab = (tab: VesselTab) => {
    const active = tab.id === activeId;
    const badge = badgeFor(tab.badgeKey);
    const testId = `${SHELL_TEST_IDS.moduleTabPrefix}${tab.id}`;
    if (tab.locked) {
      return (
        <AddOnLock key={tab.id} label={tab.label} side="bottom">
          <button type="button" data-testid={testId} aria-label={tabAccessibleName(tab, badge)} className={tabClass(false)}>
            <TabContent tab={tab} badge={badge} />
          </button>
        </AddOnLock>
      );
    }
    return (
      <Link
        key={tab.id}
        to={tab.href}
        data-tab-active={active ? 'true' : undefined}
        data-testid={testId}
        aria-current={active ? 'page' : undefined}
        aria-label={tabAccessibleName(tab, badge)}
        className={tabClass(active)}
      >
        <TabContent tab={tab} badge={badge} />
      </Link>
    );
  };

  // The divider is an inset shadow, not a border, so the 44 px row gives each h-full tab a full 44 px (D-35).
  return (
    <nav
      aria-label="Vessel modules"
      data-testid={SHELL_TEST_IDS.moduleTabBar}
      className={cn(
        'relative flex h-11 min-w-0 items-stretch bg-topbar/[0.88] shadow-[inset_0_-1px_0_hsl(var(--border))] backdrop-blur-md',
        className,
      )}
    >
      <div ref={boxRef} className="relative flex min-w-0 flex-1">
        {nav.status === 'loading' ? (
          <SkeletonTabs />
        ) : (
          <div
            ref={railRef}
            className={cn(
              'relative flex min-w-0 flex-1 items-stretch gap-0.5 px-1 sm:px-2 lg:px-3',
              wide ? 'overflow-visible' : 'snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            )}
          >
            {shown.map(renderTab)}
            {overflow.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-testid={SHELL_TEST_IDS.moduleTabMore}
                    data-tab-active={activeInMore ? 'true' : undefined}
                    aria-label={moreName}
                    className={tabClass(Boolean(activeInMore))}
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span>More</span>
                      {activeInMore && (
                        <>
                          <span aria-hidden="true" className="text-muted-foreground">·</span>
                          <span className="max-w-[9rem] truncate">{activeInMore.label}</span>
                        </>
                      )}
                    </span>
                    {moreTone && <MoreDot tone={moreTone} />}
                    <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[min(17rem,calc(100vw-2rem))]">
                  {overflow.map((tab) => {
                    const badge = badgeFor(tab.badgeKey);
                    const active = tab.id === activeId;
                    const testId = `${SHELL_TEST_IDS.moduleTabPrefix}${tab.id}`;
                    if (tab.locked) {
                      // An add-on the vessel lacks: the explanation, never the page (G4).
                      return (
                        <DropdownMenuItem
                          key={tab.id}
                          data-testid={testId}
                          aria-label={`${tabAccessibleName(tab, badge)}. An account admin can enable it in Add-ons.`}
                          onSelect={(event) => event.preventDefault()}
                          className="flex-col items-start gap-0.5 text-muted-foreground"
                        >
                          <span className="flex items-center gap-2.5">
                            <TabContent tab={tab} badge={badge} />
                          </span>
                          <span className="type-caption pl-[1.625rem]">Add-on. An account admin can enable it in Add-ons.</span>
                        </DropdownMenuItem>
                      );
                    }
                    return (
                      <DropdownMenuItem key={tab.id} asChild className={cn('gap-2.5', active && 'text-primary')}>
                        <Link to={tab.href} data-testid={testId} aria-current={active ? 'page' : undefined} aria-label={tabAccessibleName(tab, badge)}>
                          <TabContent tab={tab} badge={badge} />
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <span
              aria-hidden="true"
              data-sliding-indicator=""
              className={cn(
                'pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary shadow-glow-signal transition-[transform,width,opacity] duration-indicator ease-tide motion-reduce:transition-none',
                indicator.visible ? 'opacity-100' : 'opacity-0',
              )}
              style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
            />
          </div>
        )}
      </div>

      {(fleetReach || showSettings) && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border px-1 sm:px-2 lg:px-3">
          {fleetReach && (
            <Link
              to={fleetTarget}
              data-testid={SHELL_TEST_IDS.backToFleet}
              aria-label="Back to the Fleet view"
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors duration-quick ease-tide hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:h-11',
                focusRing,
              )}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>Fleet</span>
            </Link>
          )}
          {showSettings && vessel && (
            <Link
              to={vesselSettingsHref(vessel.code)}
              data-testid={SHELL_TEST_IDS.vesselSettingsCog}
              aria-label={`Vessel settings for ${vessel.name}`}
              title={`Vessel settings for ${vessel.name}`}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-quick ease-tide hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
                focusRing,
              )}
            >
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>
      )}

      {/* A hidden copy of the row, to measure what fits (≥ 768 px). */}
      {wide && nav.status !== 'loading' && (
        <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex h-0 overflow-hidden">
          {tabs.map((tab) => (
            <span key={tab.id} data-measure-tab={tab.id} className={tabClass(false)}>
              <TabContent tab={tab} badge={badgeFor(tab.badgeKey)} />
            </span>
          ))}
          {/* Always with the dot, so the fit reserves its width before a folded badge shows. */}
          <span data-measure-more="" className={tabClass(false)}>
            <span>More</span>
            <MoreDot tone={null} />
            <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
          </span>
          {/* What "More" adds when the active tab is inside it ("· Logbooks"), per tab. */}
          {tabs.map((tab) => (
            <span key={tab.id} data-measure-more-suffix={tab.id} className="type-body inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap pl-1.5 font-medium">
              <span>·</span>
              <span className="max-w-[9rem] truncate">{tab.label}</span>
            </span>
          ))}
        </div>
      )}
    </nav>
  );
};

export default ModuleTabBar;
