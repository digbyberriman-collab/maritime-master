import React from 'react';
import { format, parseISO } from 'date-fns';
import { X, Lock, Unlock, MapPin, Calendar, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useUpdateEntry, useDeleteEntry, useTripTypes } from '@/hooks/useItinerary';
import { useToast } from '@/hooks/use-toast';
import type { ItineraryEntry, ItineraryStatus, STATUS_CONFIG } from '@/types/itinerary';
import { STATUS_CONFIG as statusConfig } from '@/types/itinerary';

interface EntryDetailPanelProps {
  entry: ItineraryEntry;
  onClose: () => void;
}

const EntryDetailPanel: React.FC<EntryDetailPanelProps> = ({ entry, onClose }) => {
  const { toast } = useToast();
  const { data: tripTypes = [] } = useTripTypes();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  const tripType = entry.trip_type;
  const colour = tripType?.colour || '#6B7280';
  const sc = statusConfig[entry.status];
  const isEditable = !entry.is_locked && entry.status !== 'completed' && entry.status !== 'cancelled';

  const handleStatusChange = async (newStatus: ItineraryStatus) => {
    try {
      await updateEntry.mutateAsync({ id: entry.id, status: newStatus });
      toast({ title: `Status changed to ${newStatus}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleToggleLock = async () => {
    try {
      await updateEntry.mutateAsync({
        id: entry.id,
        is_locked: !entry.is_locked,
        locked_at: !entry.is_locked ? new Date().toISOString() : null,
      });
      toast({ title: entry.is_locked ? 'Entry unlocked' : 'Entry locked' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try {
      await deleteEntry.mutateAsync(entry.id);
      toast({ title: 'Entry deleted' });
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <div className="w-80 border-l border-border bg-card h-full overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colour }} />
              <span className="text-xs text-muted-foreground">{tripType?.name || 'No type'}</span>
            </div>
            <h3 className="font-semibold text-foreground text-sm leading-tight">{entry.title}</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-4">
        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          {isEditable ? (
            <Select value={entry.status} onValueChange={v => handleStatusChange(v as ItineraryStatus)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['draft', 'tentative', 'confirmed', 'postponed', 'cancelled'] as ItineraryStatus[]).map(s => (
                  <SelectItem key={s} value={s} className="text-xs capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary" className="capitalize">{sc.label}</Badge>
          )}
        </div>

        {/* Dates */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Dates
          </label>
          <p className="text-sm text-foreground">
            {format(parseISO(entry.start_date), 'MMM d, yyyy')} → {format(parseISO(entry.end_date), 'MMM d, yyyy')}
          </p>
        </div>

        {/* Location */}
        {entry.location && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <MapPin className="w-3 h-3" /> Location
            </label>
            <p className="text-sm text-foreground">{entry.location}{entry.country ? `, ${entry.country}` : ''}</p>
          </div>
        )}

        {/* Vessels */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Vessels</label>
          <div className="flex flex-wrap gap-1">
            {entry.vessels?.map(ev => (
              <Badge key={ev.id} variant="outline" className="text-xs">
                {ev.vessel?.name || ev.vessel_id}
              </Badge>
            ))}
          </div>
        </div>

        {/* Notes */}
        {entry.notes && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
          </div>
        )}

        <Separator />

        {/* Lock */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            {entry.is_locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {entry.is_locked ? 'Locked' : 'Unlocked'}
          </span>
          {entry.status !== 'completed' && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleToggleLock}>
              {entry.is_locked ? 'Unlock' : 'Lock'}
            </Button>
          )}
        </div>

        {/* Metadata */}
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Created: {format(parseISO(entry.created_at), 'MMM d, yyyy HH:mm')}</p>
          <p>Updated: {format(parseISO(entry.updated_at), 'MMM d, yyyy HH:mm')}</p>
        </div>
      </div>

      {/* Footer actions */}
      {isEditable && (
        <div className="p-4 border-t border-border">
          <Button variant="destructive" size="sm" className="w-full text-xs" onClick={handleDelete}>
            Delete Entry
          </Button>
        </div>
      )}
    </div>
  );
};

export default EntryDetailPanel;
