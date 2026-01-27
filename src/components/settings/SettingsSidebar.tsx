import React from 'react';
import { cn } from '@/lib/utils';
import { SettingsNavItem } from '@/utils/settingsPermissions';
import { Separator } from '@/components/ui/separator';

interface SettingsSidebarProps {
  navItems: SettingsNavItem[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  navItems,
  activeSection,
  onSectionChange,
}) => {
  // Group items by scope for visual separation
  const selfItems = navItems.filter(item => item.scope === 'self');
  const adminItems = navItems.filter(item => item.scope === 'admin');

  const renderNavItem = (item: SettingsNavItem) => {
    const Icon = item.icon;
    const isActive = activeSection === item.id;

    return (
      <button
        key={item.id}
        onClick={() => onSectionChange(item.id)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
          'hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/20',
          isActive
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </button>
    );
  };

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r bg-card">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your preferences</p>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {/* Personal Settings */}
        <div className="space-y-1">
          {selfItems.slice(0, 4).map(renderNavItem)}
        </div>

        {/* Admin Settings - only show if there are admin items */}
        {adminItems.length > 0 && (
          <>
            <Separator className="my-3" />
            <p className="px-3 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Administration
            </p>
            <div className="space-y-1">
              {adminItems.map(renderNavItem)}
            </div>
          </>
        )}

        {/* Remaining self items */}
        {selfItems.length > 4 && (
          <>
            <Separator className="my-3" />
            <div className="space-y-1">
              {selfItems.slice(4).map(renderNavItem)}
            </div>
          </>
        )}
      </nav>
    </aside>
  );
};

export default SettingsSidebar;
