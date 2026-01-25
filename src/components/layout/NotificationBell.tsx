import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePendingReviewCount } from '@/hooks/useDocumentWorkflow';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, FileText, ChevronRight } from 'lucide-react';

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const pendingCount = usePendingReviewCount();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {pendingCount > 0 && (
            <span className="text-xs text-muted-foreground">{pendingCount} pending</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {pendingCount > 0 ? (
          <>
            <DropdownMenuItem
              className="flex items-center gap-3 p-3 cursor-pointer"
              onClick={() => navigate('/review-queue')}
            >
              <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
                <FileText className="w-4 h-4 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {pendingCount} document{pendingCount !== 1 ? 's' : ''} pending review
                </p>
                <p className="text-xs text-muted-foreground">
                  Click to view review queue
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center justify-center p-2 cursor-pointer text-primary"
              onClick={() => navigate('/review-queue')}
            >
              View all pending reviews
            </DropdownMenuItem>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No new notifications</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
