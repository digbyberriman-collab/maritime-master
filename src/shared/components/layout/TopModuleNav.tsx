import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Users,
  Shield,
  Award,
  Wrench,
  Compass,
  Briefcase,
  Ship,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModuleItem {
  id: string;
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefix: string;
}

const MODULES: ModuleItem[] = [
  { id: 'crew', label: 'Crew', to: '/crew/roster', icon: Users, matchPrefix: '/crew' },
  { id: 'safety', label: 'Safety', to: '/ism', icon: Shield, matchPrefix: '/ism' },
  { id: 'certificates', label: 'Certificates', to: '/certificates', icon: Award, matchPrefix: '/certificates' },
  { id: 'technical', label: 'Technical', to: '/maintenance', icon: Wrench, matchPrefix: '/maintenance' },
  { id: 'charter', label: 'Charter', to: '/itinerary', icon: Compass, matchPrefix: '/itinerary' },
  { id: 'accounting', label: 'Accounting', to: '/hr', icon: Briefcase, matchPrefix: '/hr' },
  { id: 'vessel', label: 'Vessel', to: '/vessels/dashboard', icon: Ship, matchPrefix: '/vessels' },
  { id: 'reports', label: 'Reports', to: '/ism/incidents', icon: FileText, matchPrefix: '/reports' },
];

const TopModuleNav: React.FC = () => {
  const { pathname } = useLocation();

  return (
    <nav
      aria-label="Module shortcuts"
      className="w-full border-b border-border bg-card"
    >
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5">
        {MODULES.map((m) => {
          const Icon = m.icon;
          const active = pathname.startsWith(m.matchPrefix);
          return (
            <NavLink
              key={m.id}
              to={m.to}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-sm rounded-md transition-colors',
                'text-muted-foreground hover:text-foreground hover:bg-muted/60',
                active && 'text-primary font-medium bg-primary/5'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{m.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default TopModuleNav;