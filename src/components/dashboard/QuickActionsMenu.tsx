import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, FileText, AlertTriangle, Award, 
  Users, Wrench, ClipboardCheck, ChevronDown,
  Target, Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

interface QuickAction {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  description?: string;
}

interface QuickActionGroup {
  label: string;
  actions: QuickAction[];
}

const quickActionGroups: QuickActionGroup[] = [
  {
    label: 'Create New',
    actions: [
      { label: 'New Form Submission', icon: FileText, href: '/ism/forms/templates', description: 'Start a new form' },
      { label: 'Log Incident', icon: AlertTriangle, href: '/incidents?new=true', description: 'Report an incident' },
      { label: 'Schedule Drill', icon: Target, href: '/ism/drills?new=true', description: 'Plan a drill' },
    ],
  },
  {
    label: 'Quick Access',
    actions: [
      { label: 'Crew Roster', icon: Users, href: '/operations/crew' },
      { label: 'Certificates', icon: Award, href: '/certificates' },
      { label: 'Maintenance', icon: Wrench, href: '/maintenance' },
      { label: 'Audits & Surveys', icon: ClipboardCheck, href: '/ism/audits' },
    ],
  },
];

export const QuickActionsMenu: React.FC = () => {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Quick Actions
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {quickActionGroups.map((group, groupIndex) => (
          <React.Fragment key={group.label}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.actions.map((action) => (
              <DropdownMenuItem 
                key={action.label}
                onClick={() => navigate(action.href)}
                className="cursor-pointer"
              >
                <action.icon className="w-4 h-4 mr-2" />
                <div className="flex flex-col">
                  <span>{action.label}</span>
                  {action.description && (
                    <span className="text-xs text-muted-foreground">{action.description}</span>
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
