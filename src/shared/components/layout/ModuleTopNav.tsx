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
  const visibleModules = NAVIGATION_ITEMS.filter((module) => canAccessModule(module.id));

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeModuleId]);

  return (
    <nav aria-label="Modules" className="min-w-0 flex-1">
      <div className="flex items-center gap-1 overflow-x-auto px-1 py-1 scrollbar-none snap-x snap-mandatory">
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
                'relative isolate flex h-10 shrink-0 snap-start items-center gap-2 rounded-md px-3 text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                active ? 'text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 -z-10 rounded-md bg-primary shadow-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-2 motion-safe:duration-200"
                />
              )}
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
