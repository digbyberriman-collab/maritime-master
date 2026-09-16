import React from 'react';
import { NAVIGATION_ITEMS } from '@/config/navigation';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface ModuleTopNavProps {
  activeModuleId: string | null;
  onModuleChange: (moduleId: string) => void;
}

const ModuleTopNav: React.FC<ModuleTopNavProps> = ({ activeModuleId, onModuleChange }) => {
  const { canAccessModule } = useAuth();
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  const railRef = React.useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = React.useState({ left: 0, width: 0, visible: false });
  const visibleModules = NAVIGATION_ITEMS.filter((module) => canAccessModule(module.id));

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeModuleId]);

  React.useLayoutEffect(() => {
    const updateIndicator = () => {
      const active = activeRef.current;
      const rail = railRef.current;
      if (!active || !rail) {
        setIndicator((current) => ({ ...current, visible: false }));
        return;
      }
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth, visible: true });
    };
    updateIndicator();
    const observer = new ResizeObserver(updateIndicator);
    if (railRef.current) observer.observe(railRef.current);
    return () => observer.disconnect();
  }, [activeModuleId, visibleModules.length]);

  return (
    <nav aria-label="Modules" className="min-w-0 flex-1">
      <div ref={railRef} className="relative flex w-full items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory">
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
          return (
            <button
              key={module.id}
              ref={active ? activeRef : undefined}
              type="button"
              onClick={() => onModuleChange(module.id)}
              aria-pressed={active}
              className={cn(
                'relative z-10 flex h-10 min-w-[9.5rem] flex-1 snap-start items-center justify-center gap-2 whitespace-nowrap rounded-md px-2 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{module.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default ModuleTopNav;
