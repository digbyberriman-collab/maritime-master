import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { VolumeRow } from '../lib/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  volume: VolumeRow | null;
  saving: boolean;
  onSubmit: (input: { place: string; reason: string }) => Promise<void>;
}

const CloseVolumeDialog: React.FC<Props> = ({ open, onOpenChange, volume, saving, onSubmit }) => {
  const [place, setPlace] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [reviewed, setReviewed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => { if (open) { setPlace(''); setReason(''); setReviewed(false); setError(null); } }, [open]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reviewed) { setError('Review the volume and confirm its pages are complete.'); return; }
    try { await onSubmit({ place: place.trim(), reason: reason.trim() }); } catch (e) { setError((e as Error).message); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Close volume — {volume?.label}</DialogTitle>
          <DialogDescription>The volume remains readable after closure. A continuation allows new records and linked corrections.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1"><Label htmlFor="close-place">Place</Label><Input id="close-place" value={place} required maxLength={500} onChange={(e) => setPlace(e.target.value)} /></div>
          <div className="space-y-1"><Label htmlFor="close-reason">Closure reason</Label><Textarea id="close-reason" value={reason} required maxLength={4000} onChange={(e) => setReason(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={reviewed} onCheckedChange={(v) => setReviewed(v === true)} /> I have reviewed this volume and completed its pages.</label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Closing…' : 'Close volume'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CloseVolumeDialog;
