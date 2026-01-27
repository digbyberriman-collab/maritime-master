import React from 'react';
import { cn } from '@/lib/utils';
import { MoreHorizontal } from 'lucide-react';
import { SettingsNavItem } from '@/utils/settingsPermissions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

interface SettingsMobileNavProps {
  navItems: SettingsNavItem[];
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

const SettingsMobileNav: React.FC<SettingsMobileNavProps> = ({
  navItems,
  activeSection,
  onSectionChange,
  mobileMenuOpen,
  setMobileMenuOpen,
}) => {
  // Show first 3 items + More button in bottom nav
  const visibleItems = navItems.slice(0, 3);
  const hasMoreItems = navItems.length > 3;

  const handleNavClick = (sectionId: string) => {
    onSectionChange(sectionId);
    setMobileMenuOpen(false);
  };

  const selfItems = navItems.filter(item => item.scope === 'self');
  const adminItems = navItems.filter(item => item.scope === 'admin');

  return (
    <>
      {/* Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-50 safe-area-inset-bottom">
        <div className="flex items-center justify-around h-16 px-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                  'focus:outline-none focus:bg-muted/50 rounded-lg mx-0.5',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                <span className={cn(
                  'text-xs font-medium truncate max-w-[60px]',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* More Button */}
          {hasMoreItems && (
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className={cn(
                    'flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors',
                    'focus:outline-none focus:bg-muted/50 rounded-lg mx-0.5',
                    mobileMenuOpen ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="text-xs font-medium">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl">
                <SheetHeader className="text-left pb-4">
                  <SheetTitle>Settings</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100%-60px)]">
                  <div className="space-y-1 pb-8">
                    {/* Personal Settings */}
                    <p className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Personal
                    </p>
                    {selfItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeSection === item.id;

                      return (
                        <button
                          key={item.id}
                          onClick={() => handleNavClick(item.id)}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                            'active:bg-muted/70',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-foreground hover:bg-muted/50'
                          )}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}

                    {/* Admin Settings */}
                    {adminItems.length > 0 && (
                      <>
                        <Separator className="my-4" />
                        <p className="px-2 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Administration
                        </p>
                        {adminItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = activeSection === item.id;

                          return (
                            <button
                              key={item.id}
                              onClick={() => handleNavClick(item.id)}
                              className={cn(
                                'w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors',
                                'active:bg-muted/70',
                                isActive
                                  ? 'bg-primary text-primary-foreground'
                                  : 'text-foreground hover:bg-muted/50'
                              )}
                            >
                              <Icon className="h-5 w-5 shrink-0" />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </nav>

      {/* Spacer for fixed bottom nav */}
      <div className="md:hidden h-16" />
    </>
  );
};

export default SettingsMobileNav;
