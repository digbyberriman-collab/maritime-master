import React from 'react';
import { NAVIGATION_ITEMS } from '@/config/navigation';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ModuleTopNavProps {
  activeModuleId: string | null;
  onModuleChange: (moduleId: string) => void;
}

type Density = 'comfortable' | 'compact' | 'tight' | 'icon';

/** Width each button needs, per density, to render its label without clipping. */
const DENSITY_MIN_WIDTH: Record<Density, number> = {
  comfortable: 150,
  compact: 118,
  tight: 92,
  icon: 44,
};

const DENSITY_ORDER: Density[] = ['comfortable', 'compact', 'tight', 'icon'];

const ModuleTopNav: React.FC<ModuleTopNavProps> = ({ activeModuleId, onModuleChange }) => {
  const { canAccessModule } = useAuth();
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = React.useState({ left: 0, width: 0, visible: false });
  const [density, setDensity] = React.useState<Density>('comfortable');
  const visibleModules = NAVIGATION_ITEMS.filter((module) => canAccessModule(module.id));
  const moduleCount = visibleModules.length;

  // Pick the richest density whose buttons still fit the rail without scrolling.
  React.useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail || moduleCount === 0) return;

    const measure = () => {
      const styles = window.getComputedStyle(rail);
      const gap = parseFloat(styles.columnGap || '0') || 0;
      const padding = parseFloat(styles.paddingLeft || '0') + parseFloat(styles.paddingRight || '0');
      const available = rail.clientWidth - padding - gap * Math.max(moduleCount - 1, 0);
      const perButton = available / moduleCount;
      const next =
        DENSITY_ORDER.find((option) => perButton >= DENSITY_MIN_WIDTH[option]) ?? 'icon';
      setDensity((current) => (current === next ? current : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [moduleCount]);

  // Keep the sliding highlight glued to the active button through resizes and scrolling.
  React.useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const updateIndicator = () => {
      const active = activeRef.current;
      if (!active) {
        setIndicator((current) => (current.visible ? { ...current, visible: false } : current));
        return;
      }
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth, visible: true });
    };

    updateIndicator();

    const observer = new ResizeObserver(updateIndicator);
    observer.observe(rail);
    if (activeRef.current) observer.observe(activeRef.current);
    window.addEventListener('resize', updateIndicator);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateIndicator);
    };
  }, [activeModuleId, moduleCount, density]);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeModuleId]);

  const showLabel = density !== 'icon';
  const buttonHeight = density === 'comfortable' ? 'h-10' : density === 'compact' ? 'h-9' : 'h-8';
  const labelSize = density === 'tight' ? 'text-[0.7rem]' : density === 'compact' ? 'text-xs' : 'text-sm';
  const iconSize = density === 'comfortable' ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <TooltipProvider delayDuration={200}>
      <nav aria-label="Modules" className="min-w-0 flex-1">
        <div
          ref={railRef}
          className="relative flex w-full items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory"
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-y-1 rounded-md bg-primary shadow-sm transition-[transform,width,opacity] duration-300 ease-out motion-reduce:transition-none',
              indicator.visible ? 'opacity-100' : 'opacity-0'
            )}
            style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
          />
          {visibleModules.map((module) => {
            const active = module.id === activeModuleId;
            const Icon = module.icon;
            const button = (
              <button
                key={module.id}
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => onModuleChange(module.id)}
                aria-pressed={active}
                aria-label={module.label}
                title={showLabel ? undefined : module.label}
                className={cn(
                  'relative z-10 flex min-w-0 flex-1 shrink snap-start items-center justify-center gap-2 whitespace-nowrap rounded-md px-2 font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  buttonHeight,
                  labelSize,
                  active
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className={cn('shrink-0', iconSize)} aria-hidden="true" />
                {showLabel && <span className="truncate">{module.label}</span>}
              </button>
            );

            if (showLabel) return button;

            return (
              <Tooltip key={module.id}>
                <TooltipTrigger asChild>{button}</TooltipTrigger>
                <TooltipContent side="bottom">{module.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </nav>
    </TooltipProvider>
  );
};

export default ModuleTopNav;
