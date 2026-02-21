import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Shield, Lock, AlertTriangle } from 'lucide-react';
import { useAdminActions } from '@/modules/auth/hooks/useAdminActions';

interface AdminPinModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
  title?: string;
  description?: string;
}

const AdminPinModal: React.FC<AdminPinModalProps> = ({
  open,
  onOpenChange,
  onConfirmed,
  title = 'Confirm Admin Action',
  description = 'Enter your 6-digit admin PIN to proceed with this action.',
}) => {
  const [pin, setPin] = useState('');
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { hasPinSet, verifyPin, setPin: setPinMutation, isConfirmed } = useAdminActions();

  useEffect(() => {
    if (open) {
      setPin('');
      setConfirmPin('');
      setError(null);
      setIsSetupMode(!hasPinSet);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, hasPinSet]);

  // If already confirmed within window, auto-proceed
  useEffect(() => {
    if (open && isConfirmed()) {
      onConfirmed();
      onOpenChange(false);
    }
  }, [open, isConfirmed, onConfirmed, onOpenChange]);

  const handleVerify = async () => {
    if (pin.length !== 6) {
      setError('PIN must be exactly 6 digits');
      return;
    }

    try {
      const result = await verifyPin.mutateAsync(pin);
      if (result.success) {
        onConfirmed();
        onOpenChange(false);
      }
    } catch (err: any) {
      setError(err.message);
      setPin('');
    }
  };

  const handleSetupPin = async () => {
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits');
      return;
    }
    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    try {
      await setPinMutation.mutateAsync(pin);
      setIsSetupMode(false);
      setPin('');
      setConfirmPin('');
      setError(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePinChange = (value: string, setter: (v: string) => void) => {
    // Only allow digits, max 6
    const cleaned = value.replace(/\D/g, '').slice(0, 6);
    setter(cleaned);
    setError(null);
  };

  const isLoading = verifyPin.isPending || setPinMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {isSetupMode ? 'Set Admin PIN' : title}
          </DialogTitle>
          <DialogDescription>
            {isSetupMode 
              ? 'Create a 6-digit PIN to secure admin actions. You\'ll need this PIN to perform sensitive operations.'
              : description
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isSetupMode ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="new-pin">New PIN</Label>
                <Input
                  id="new-pin"
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => handlePinChange(e.target.value, setPin)}
                  className="text-center text-2xl tracking-widest"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pin">Confirm PIN</Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={confirmPin}
                  onChange={(e) => handlePinChange(e.target.value, setConfirmPin)}
                  className="text-center text-2xl tracking-widest"
                  disabled={isLoading}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="pin">Admin PIN</Label>
              <Input
                id="pin"
                ref={inputRef}
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="••••••"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value, setPin)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                className="text-center text-2xl tracking-widest"
                disabled={isLoading}
              />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {isSetupMode 
              ? 'Your PIN will be securely stored and required for sensitive admin actions.'
              : 'Confirmation is valid for 10 minutes after verification.'
            }
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={isSetupMode ? handleSetupPin : handleVerify}
            disabled={isLoading || (isSetupMode ? pin.length !== 6 || confirmPin.length !== 6 : pin.length !== 6)}
          >
            {isLoading ? 'Processing...' : isSetupMode ? 'Set PIN' : 'Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminPinModal;