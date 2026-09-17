import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { DisciplinaryRecordRow } from '@/modules/hris/lib/disciplinary';

interface AppealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: DisciplinaryRecordRow | null;
  onLodge: (notes: string | null) => Promise<void>;
  onResolve: (result: 'upheld' | 'overturned', notes: string | null) => Promise<void>;
  isPending?: boolean;
}

/** Lodge an appeal, or record its result when one is already open. */
export const AppealDialog: React.FC<AppealDialogProps> = ({ open, onOpenChange, record, onLodge, onResolve, isPending }) => {
  const [notes, setNotes] = useState('');
  const lodged = record?.appeal_status === 'lodged';

  useEffect(() => {
    if (open) setNotes(record?.appeal_notes ?? '');
  }, [open, record?.appeal_notes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lodged ? 'Resolve appeal' : 'Lodge appeal'}</DialogTitle>
          <DialogDescription>
            {lodged
              ? 'Record the appeal outcome. Overturning the decision marks the whole record as overturned; it will no longer count as a live warning.'
              : 'Record that the crew member has appealed. The warning will not lapse while the appeal is open.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="appeal-notes">Appeal notes</Label>
          <Textarea
            id="appeal-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={lodged ? 'Who heard the appeal, grounds considered, reasoning…' : 'Grounds of appeal, date received, who will hear it…'}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          {lodged ? (
            <>
              <Button variant="secondary" onClick={() => void onResolve('upheld', notes.trim() || null)} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Decision stands
              </Button>
              <Button onClick={() => void onResolve('overturned', notes.trim() || null)} disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Overturn decision
              </Button>
            </>
          ) : (
            <Button onClick={() => void onLodge(notes.trim() || null)} disabled={isPending || !record}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Lodge appeal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppealDialog;
