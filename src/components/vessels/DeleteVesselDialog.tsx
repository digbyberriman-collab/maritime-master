import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Vessel } from '@/hooks/useVessels';
import { Loader2 } from 'lucide-react';

interface DeleteVesselDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vessel: Vessel | null;
  onConfirm: () => void;
  isLoading?: boolean;
}

const DeleteVesselDialog: React.FC<DeleteVesselDialogProps> = ({
  open,
  onOpenChange,
  vessel,
  onConfirm,
  isLoading,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Vessel</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to remove <strong>{vessel?.name}</strong> from your fleet? 
            This will mark the vessel as "Sold" and it will no longer appear in your vessel list.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Removing...
              </>
            ) : (
              'Remove Vessel'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DeleteVesselDialog;
