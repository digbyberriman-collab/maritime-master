import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import {
  findDomainByPath,
  getVisibleTabs,
  isPhase2Enabled,
  type NavTab,
  type NavRole,
} from '@/config/navigation';

/**
 * SmartTabBar — horizontal sub-navigation rendered in the content header.
 *
 * Driven entirely by `NAV_DOMAINS` in `src/config/navigation.ts`. Derives the
 * active domain from the current pathname; if the current route doesn't
 * belong to any domain (or the domain has no tabs), the bar renders nothing.
 *
 * Behaviour:
 *  - Horizontal scroll on overflow with arrow controls.
 *  - Active state via NavLink (`isActive` + path startsWith).
 *  - Keyboard nav: ←/→ to move, Home/End to jump, Enter/Space to activate
 *    (NavLink follows on focus + Enter natively).
 *  - Role-filtered: tabs gated on `requiredRoles` are hidden for other roles.
 *  - Phase-2 tabs hidden unless `VITE_FEATURE_INSIGHTS=true`.
 */
const SmartTabBar: React.FC = () => {
  const location = useLocation();
  const { profile } = useAuth();
  const role = (profile?.role ?? null) as NavRole | null;

  const domain = useMemo(() => findDomainByPath(location.pathname), [location.pathname]);
  const tabs: NavTab[] = useMemo(
    () => (domain ? getVisibleTabs(domain, role, isPhase2Enabled()) : []),
    [domain, role],
  );

  const scrollerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, tabs.length]);

  // Auto-scroll the active tab into view when the route changes.
  useEffect(() => {
    const activeIdx = tabs.findIndex((tab) => isTabActive(tab.path, location.pathname));
    if (activeIdx < 0) return;
    const el = tabRefs.current[activeIdx];
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [location.pathname, tabs]);

  const scrollBy = (delta: number) => {
    scrollerRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const focused = document.activeElement as HTMLElement | null;
    const currentIdx = tabRefs.current.findIndex((el) => el === focused);
    if (currentIdx < 0 && event.key !== 'Home' && event.key !== 'End') return;

    let nextIdx: number | undefined;
    if (event.key === 'ArrowRight') nextIdx = Math.min(tabs.length - 1, currentIdx + 1);
    else if (event.key === 'ArrowLeft') nextIdx = Math.max(0, currentIdx - 1);
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = tabs.length - 1;

    if (nextIdx !== undefined) {
      event.preventDefault();
      tabRefs.current[nextIdx]?.focus();
    }
  };

  if (!domain || tabs.length === 0) return null;

  return (
    <div
      className="relative border-b border-border bg-card/50"
      role="navigation"
      aria-label={`${domain.label} sections`}
      onKeyDown={handleKeyDown}
    >
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll tabs left"
          onClick={() => scrollBy(-200)}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-r from-card via-card to-transparent text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <div
        ref={scrollerRef}
        className="flex items-stretch gap-1 overflow-x-auto scrollbar-none px-4 lg:px-6"
        style={{ scrollbarWidth: 'none' }}
      >
        {tabs.map((tab, idx) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={isExactMatchTab(tab.path)}
            ref={(el) => {
              tabRefs.current[idx] = el;
            }}
            className={({ isActive }) =>
              cn(
                'group inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background rounded-t-sm',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )
            }
          >
            {tab.icon && <tab.icon className="w-4 h-4" />}
            <span>{tab.label}</span>
            {tab.badge && (
              <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-accent-foreground">
                {tab.badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll tabs right"
          onClick={() => scrollBy(200)}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-gradient-to-l from-card via-card to-transparent text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

// A tab is "active" when the current pathname matches it exactly, or is a
// descendant. The Home tab (e.g. `/home`) uses exact match so it doesn't
// claim activity on `/home/alerts`.
function isExactMatchTab(tabPath: string): boolean {
  // Tabs whose path is itself the domain root match exactly to avoid
  // swallowing sibling tabs (e.g. `/home` should not be active on `/home/alerts`).
  const segments = tabPath.split('/').filter(Boolean);
  return segments.length <= 1;
}

function isTabActive(tabPath: string, pathname: string): boolean {
  if (isExactMatchTab(tabPath)) return pathname === tabPath;
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}

export default SmartTabBar;
