import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { VolumeRow } from '../lib/types';
import { stamp } from '../lib/format';

interface Props { open: boolean; onOpenChange: (open: boolean) => void; volume: VolumeRow | null; }

/** Read-only view of a volume's fixed cover, source registry revision and closure. */
const VolumeCoverDialog: React.FC<Props> = ({ open, onOpenChange, volume }) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Volume particulars — {volume?.label}</DialogTitle>
        <DialogDescription>The cover is fixed. Correct particulars by closing this volume and opening another with the correction noted.</DialogDescription>
      </DialogHeader>
      {volume && (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{volume.flag_profile}</Badge>
            <Badge variant="outline">{volume.template_revision}</Badge>
            <Badge variant={volume.status === 'open' ? 'default' : 'outline'}>{volume.status}</Badge>
            <Badge variant="outline">Volume {volume.sequence}</Badge>
          </div>
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {volume.cover_fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="whitespace-pre-wrap">{volume.particulars[f.key] === undefined || volume.particulars[f.key] === '' ? '—' : String(volume.particulars[f.key])}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">Opened by {volume.opened_by_name ?? '—'} · {stamp(volume.opened_at)}</p>
          {volume.registry_source && (
            <p className="text-xs text-muted-foreground">Opening details sourced from {volume.registry_source.profile} registry revision {volume.registry_source.version} · {volume.registry_source.filled_keys.length} matching cover values. Later registry changes never alter this cover.</p>
          )}
          {volume.continuation_of && <p className="text-xs text-muted-foreground">Continuation of an earlier closed volume; template edition retained.</p>}
          {volume.closed_at && (
            <p className="text-xs text-muted-foreground">Closed {stamp(volume.closed_at)} · {volume.closure_place} · {volume.closure_reason} · {volume.page_count} signed pages</p>
          )}
        </div>
      )}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
    </DialogContent>
  </Dialog>
);

export default VolumeCoverDialog;
