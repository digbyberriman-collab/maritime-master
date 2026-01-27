import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, AlertTriangle, AlertCircle, ChevronRight } from 'lucide-react';

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [redCount, setRedCount] = useState(0);
  const [orangeCount, setOrangeCount] = useState(0);

  const loadUnreadCount = async () => {
    if (!profile?.company_id) return;

    try {
      // Get RED alerts count
      const { count: redAlerts } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'OPEN')
        .eq('severity_color', 'RED');

      // Get ORANGE alerts count
      const { count: orangeAlerts } = await supabase
        .from('alerts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .eq('status', 'OPEN')
        .eq('severity_color', 'ORANGE');

      setRedCount(redAlerts || 0);
      setOrangeCount(orangeAlerts || 0);
      setUnreadCount((redAlerts || 0) + (orangeAlerts || 0));
    } catch (error) {
      console.error('Failed to load alert count:', error);
    }
  };

  useEffect(() => {
    loadUnreadCount();

    // Subscribe to new alerts
    const subscription = supabase
      .channel('alerts-notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile?.company_id]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 bg-popover">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alerts</span>
          {unreadCount > 0 && (
            <span className="text-xs text-muted-foreground">{unreadCount} open</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {unreadCount > 0 ? (
          <>
            {redCount > 0 && (
              <DropdownMenuItem
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => navigate('/alerts?severity=RED')}
              >
                <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">
                    {redCount} critical alert{redCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Requires immediate attention
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </DropdownMenuItem>
            )}
            {orangeCount > 0 && (
              <DropdownMenuItem
                className="flex items-center gap-3 p-3 cursor-pointer"
                onClick={() => navigate('/alerts?severity=ORANGE')}
              >
                <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-warning" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-warning">
                    {orangeCount} high priority alert{orangeCount !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Action required within 24h
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center justify-center p-2 cursor-pointer text-primary"
              onClick={() => navigate('/alerts')}
            >
              View all alerts
            </DropdownMenuItem>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No open alerts</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
