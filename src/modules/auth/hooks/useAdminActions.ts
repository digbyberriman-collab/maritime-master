import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/hooks/use-toast';
import { useState, useCallback } from 'react';

interface AdminActionResult {
  success: boolean;
  message?: string;
  error?: string;
  needsSetup?: boolean;
  locked?: boolean;
  attemptsRemaining?: number;
  confirmedUntil?: string;
  newStatus?: string;
  newAssignment?: any;
}

// Session-based confirmation tracking (10 minute window)
const CONFIRMATION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

export const useAdminActions = () => {
  const queryClient = useQueryClient();
  const [confirmedUntil, setConfirmedUntil] = useState<Date | null>(() => {
    const stored = sessionStorage.getItem('admin_confirmed_until');
    if (stored) {
      const date = new Date(stored);
      if (date > new Date()) return date;
    }
    return null;
  });

  const isConfirmed = useCallback(() => {
    return confirmedUntil && confirmedUntil > new Date();
  }, [confirmedUntil]);

  const setConfirmation = useCallback((until: Date) => {
    setConfirmedUntil(until);
    sessionStorage.setItem('admin_confirmed_until', until.toISOString());
  }, []);

  // Check if user has PIN set
  const { data: hasPinSet, refetch: refetchPinStatus } = useQuery({
    queryKey: ['admin-pin-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_pins')
        .select('id')
        .limit(1);
      
      if (error) {
        console.error('Error checking PIN status:', error);
        return false;
      }
      return data && data.length > 0;
    },
  });

  // Set PIN mutation
  const setPin = useMutation({
    mutationFn: async (pin: string): Promise<AdminActionResult> => {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'set_pin', pin }
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      refetchPinStatus();
      toast({
        title: 'PIN Set',
        description: 'Your admin PIN has been configured successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Verify PIN mutation
  const verifyPin = useMutation({
    mutationFn: async (pin: string): Promise<AdminActionResult> => {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'verify_pin', pin }
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      if (data.confirmedUntil) {
        setConfirmation(new Date(data.confirmedUntil));
      }
    },
  });

  // Reset account mutation
  const resetAccount = useMutation({
    mutationFn: async ({ 
      targetUserId, 
      resetType, 
      reason 
    }: { 
      targetUserId: string; 
      resetType: 'password_reset' | 'invalidate_sessions' | 'resend_invitation';
      reason?: string;
    }): Promise<AdminActionResult> => {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'reset_account', targetUserId, resetType, reason }
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({
        title: 'Account Reset',
        description: data.message || 'Action completed successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle access mutation
  const toggleAccess = useMutation({
    mutationFn: async ({ 
      targetUserId, 
      enableAccess,
      reason 
    }: { 
      targetUserId: string; 
      enableAccess: boolean;
      reason?: string;
    }): Promise<AdminActionResult> => {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { action: 'toggle_access', targetUserId, enableAccess, reason }
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({
        title: 'Access Updated',
        description: data.message || 'Account access has been updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reallocate vessel mutation
  const reallocateVessel = useMutation({
    mutationFn: async ({ 
      targetUserId, 
      vesselId,
      position,
      effectiveDate,
      endDate,
      reason 
    }: { 
      targetUserId: string; 
      vesselId: string;
      position?: string;
      effectiveDate?: string;
      endDate?: string;
      reason: string;
    }): Promise<AdminActionResult> => {
      const { data, error } = await supabase.functions.invoke('admin-actions', {
        body: { 
          action: 'reallocate_vessel', 
          targetUserId, 
          vesselId,
          position,
          effectiveDate,
          endDate,
          reason 
        }
      });
      if (error) throw new Error(error.message);
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['crew'] });
      toast({
        title: 'Vessel Assignment Updated',
        description: data.message || 'Crew member has been reassigned.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    hasPinSet,
    isConfirmed,
    confirmedUntil,
    setPin,
    verifyPin,
    resetAccount,
    toggleAccess,
    reallocateVessel,
    refetchPinStatus,
  };
};