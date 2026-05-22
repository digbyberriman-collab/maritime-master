import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/shared/hooks/use-toast';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: CrewMemberWithStatus[];
}

export const BulkEmailDialog: React.FC<BulkEmailDialogProps> = ({ open, onOpenChange, members }) => {
  const emails = members.map((m) => m.email).filter(Boolean).join(', ');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(emails);
      toast({ title: 'Copied', description: `${members.length} email${members.length === 1 ? '' : 's'} copied.` });
    } catch {
      toast({ title: 'Copy failed', description: 'Select and copy manually.', variant: 'destructive' });
    }
  };

  const openMailto = () => {
    // BCC keeps recipient privacy; some clients reject very long URLs, so we
    // also surface the textarea so users can paste into their own tool.
    const href = `mailto:?bcc=${encodeURIComponent(emails)}`;
    window.open(href, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email {members.length} crew</DialogTitle>
          <DialogDescription>Copy the BCC list or open it in your mail client.</DialogDescription>
        </DialogHeader>
        <Textarea readOnly value={emails} className="font-mono text-xs h-48" />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={copy}>Copy</Button>
          <Button onClick={openMailto}>Open in mail client</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
