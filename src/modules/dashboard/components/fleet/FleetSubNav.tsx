import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  Map,
  FileBarChart,
  Calendar,
  Files,
  ListChecks,
  Ship,
  Users,
  Bell,
  UserCog,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Item {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const PRIMARY: Item[] = [
  { label: 'Fleet Dashboard', to: '/dashboard?view=fleet', icon: LayoutGrid, end: true },
  { label: 'Fleet Tracker', to: '/fleet-map', icon: Map },
  { label: 'Fleet Reports', to: '/analytics', icon: FileBarChart },
  { label: 'Fleet Calendar', to: '/calendar', icon: Calendar },
  { label: 'Fleet Documents', to: '/documents', icon: Files },
  { label: 'Fleet Checklists', to: '/ism/checklists', icon: ListChecks },
  { label: 'Vessels', to: '/vessels', icon: Ship },
];

const ADMIN: Item[] = [
  { label: 'Users & Access', to: '/users-access', icon: Users },
  { label: 'Notification Management', to: '/settings/notifications', icon: Bell },
  { label: 'Account', to: '/settings', icon: UserCog },
];

const FleetSubNav: React.FC = () => {
  const renderItem = (it: Item) => (
    <NavLink
      key={it.to}
      to={it.to}
      end={it.end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
          isActive
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
        )
      }
    >
      <it.icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{it.label}</span>
    </NavLink>
  );

  return (
    <aside className="lg:w-56 shrink-0">
      <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
        {PRIMARY.map(renderItem)}
      </nav>
      <div className="hidden lg:block mt-6">
        <div className="px-3 pb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Administration
        </div>
        <nav className="flex flex-col gap-1">{ADMIN.map(renderItem)}</nav>
      </div>
    </aside>
  );
};

export default FleetSubNav;