import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileText, Pencil, Plus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePinnedShortcuts } from '@/shared/hooks/usePinnedShortcuts';

const FloatingQuickActions: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { effectiveShortcuts, suggestions, addPin } = usePinnedShortcuts();

  return (
    <div className="fixed bottom-5 right-5 z-30">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" className="h-12 w-12 rounded-full shadow-lg" aria-label="Open quick actions">
            <Zap className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={10} className="w-64">
          <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
          {effectiveShortcuts.map((shortcut) => (
            <DropdownMenuItem
              key={shortcut.target}
              onClick={() => navigate(shortcut.target)}
              className="gap-2 cursor-pointer"
            >
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">{shortcut.label}</span>
              {location.pathname === shortcut.target.split('?')[0] && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-label="Current page" />
              )}
            </DropdownMenuItem>
          ))}
          {suggestions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 text-muted-foreground">
                <Pencil className="h-3.5 w-3.5" /> Suggested
              </DropdownMenuLabel>
              {suggestions.map((shortcut) => (
                <DropdownMenuItem key={shortcut.target} onClick={() => addPin(shortcut)} className="gap-2 cursor-pointer">
                  <Plus className="h-4 w-4" />
                  <span className="truncate">Pin {shortcut.label}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default FloatingQuickActions;