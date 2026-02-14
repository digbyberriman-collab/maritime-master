import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Plus, 
  FileText, 
  AlertTriangle, 
  Ship,
  Users,
  Map,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  variant?: 'default' | 'outline';
}

const quickActions: QuickAction[] = [
  { label: 'Add Crew Member', icon: Users, href: '/crew?new=true', variant: 'default' },
  { label: 'Add Vessel', icon: Ship, href: '/vessels/list?new=true', variant: 'default' },
  { label: 'Fleet Map', icon: Map, href: '/fleet-map', variant: 'outline' },
  { label: 'Report Incident', icon: AlertTriangle, href: '/incidents?new=true', variant: 'outline' },
];

interface HeaderQuickActionsProps {
  className?: string;
}

export const HeaderQuickActions: React.FC<HeaderQuickActionsProps> = ({ className }) => {
  const navigate = useNavigate();
  const location = useLocation();

  // Hide on settings pages
  if (location.pathname.startsWith('/settings')) {
    return null;
  }

  return (
    <>
      {/* Desktop: Inline buttons */}
      <div className={cn('hidden lg:flex items-center gap-2', className)}>
        {quickActions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant || 'outline'}
            size="sm"
            onClick={() => navigate(action.href)}
            className="gap-1.5"
          >
            <action.icon className="w-4 h-4" />
            <span className="hidden xl:inline">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Mobile/Tablet: Collapsed dropdown */}
      <div className={cn('lg:hidden', className)}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Plus className="w-4 h-4" />
              <span className="sr-only">Quick Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {quickActions.map((action) => (
              <DropdownMenuItem 
                key={action.label}
                onClick={() => navigate(action.href)}
                className="cursor-pointer gap-2"
              >
                <action.icon className="w-4 h-4" />
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default HeaderQuickActions;
