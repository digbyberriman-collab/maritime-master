import React, { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Lock, Unlock, MapPin, Calendar, Pencil, Save, XCircle } from 'lucide-react';
import LocationSearchInput from '@/components/common/LocationSearchInput';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useUpdateEntry, useDeleteEntry, useTripTypes, useUpdateEntryVessels, useItineraryVessels } from '@/hooks/useItinerary';
import { useToast } from '@/hooks/use-toast';
import type { ItineraryEntry, ItineraryStatus } from '@/types/itinerary';
import { STATUS_CONFIG as statusConfig } from '@/types/itinerary';

interface EntryDetailPanelProps {
  entry: ItineraryEntry;
  onClose: () => void;
}

const EntryDetailPanel: React.FC<EntryDetailPanelProps> = ({ entry, onClose }) => {
  const { toast } = useToast();
  const { data: tripTypes = [] } = useTripTypes();
  const { data: allVessels = [] } = useItineraryVessels();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const updateVessels = useUpdateEntryVessels();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: entry.title,
    start_date: entry.start_date,
    end_date: entry.end_date,
    location: entry.location || '',
    country: entry.country || '',
    notes: entry.notes || '',
    trip_type_id: entry.trip_type_id || '',
    status: entry.status,
    vessel_ids: (entry.vessels || []).map(v => v.vessel_id),
  });

  // Sync form when entry changes (e.g. after drag)
  useEffect(() => {
    if (!editing) {
      setForm({
        title: entry.title,
        start_date: entry.start_date,
        end_date: entry.end_date,
        location: entry.location || '',
        country: entry.country || '',
        notes: entry.notes || '',
        trip_type_id: entry.trip_type_id || '',
        status: entry.status,
        vessel_ids: (entry.vessels || []).map(v => v.vessel_id),
      });
    }
  }, [entry, editing]);

  const tripType = entry.trip_type;
  const colour = tripType?.colour || '#6B7280';
  const sc = statusConfig[entry.status];
  const isEditable = !entry.is_locked;

  const toggleVessel = (vesselId: string) => {
    setForm(f => ({
      ...f,
      vessel_ids: f.vessel_ids.includes(vesselId)
        ? f.vessel_ids.filter(v => v !== vesselId)
        : [...f.vessel_ids, vesselId],
    }));
  };

  const handleSave = async () => {
    if (form.vessel_ids.length === 0) {
      toast({ title: 'Select at least one vessel', variant: 'destructive' });
      return;
    }
    try {
      // Update entry fields
      await updateEntry.mutateAsync({
        id: entry.id,
        title: form.title,
        start_date: form.start_date,
        end_date: form.end_date,
        location: form.location || null,
        country: form.country || null,
        notes: form.notes || null,
        trip_type_id: form.trip_type_id || null,
        status: form.status,
      });
      // Update vessel assignments
      const currentVesselIds = (entry.vessels || []).map(v => v.vessel_id).sort().join(',');
      const newVesselIds = [...form.vessel_ids].sort().join(',');
      if (currentVesselIds !== newVesselIds) {
        await updateVessels.mutateAsync({ entryId: entry.id, vesselIds: form.vessel_ids });
      }
      toast({ title: 'Entry updated' });
      setEditing(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleCancel = () => {
    setForm({
      title: entry.title,
      start_date: entry.start_date,
      end_date: entry.end_date,
      location: entry.location || '',
      country: entry.country || '',
      notes: entry.notes || '',
      trip_type_id: entry.trip_type_id || '',
      status: entry.status,
      vessel_ids: (entry.vessels || []).map(v => v.vessel_id),
    });
    setEditing(false);
  };

  const handleStatusChange = async (newStatus: ItineraryStatus) => {
    if (editing) {
      setForm(f => ({ ...f, status: newStatus }));
    } else {
      try {
        await updateEntry.mutateAsync({ id: entry.id, status: newStatus });
        toast({ title: `Status changed to ${newStatus}` });
      } catch (err: any) {
        toast({ title: 'Error', description: err.message, variant: 'destructive' });
      }
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
              {editing ? (
                <Select value={form.trip_type_id} onValueChange={v => setForm(f => ({ ...f, trip_type_id: v }))}>
                  <SelectTrigger className="h-6 text-[10px] w-auto">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {tripTypes.map(tt => (
                      <SelectItem key={tt.id} value={tt.id} className="text-xs">{tt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">{tripType?.name || 'No type'}</span>
              )}
            </div>
            {editing ? (
              <Input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="h-7 text-sm font-semibold"
              />
            ) : (
              <h3 className="font-semibold text-foreground text-sm leading-tight">{entry.title}</h3>
            )}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            {isEditable && !editing && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-4 space-y-4">
        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Status</label>
          {isEditable ? (
            <Select value={editing ? form.status : entry.status} onValueChange={v => handleStatusChange(v as ItineraryStatus)}>
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
          {editing ? (
            <div className="flex gap-2">
              <Input
                type="date"
                value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="h-8 text-xs flex-1"
              />
              <Input
                type="date"
                value={form.end_date}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="h-8 text-xs flex-1"
              />
            </div>
          ) : (
            <p className="text-sm text-foreground">
              {format(parseISO(entry.start_date), 'MMM d, yyyy')} → {format(parseISO(entry.end_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>

        {/* Location */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <MapPin className="w-3 h-3" /> Location
          </label>
          {editing ? (
            <LocationSearchInput
              value={form.location}
              country={form.country}
              onSelect={(location, country) => setForm(f => ({ ...f, location, country }))}
              placeholder="Search location..."
              inputClassName="h-8 text-xs"
            />
          ) : (
            entry.location ? (
              <p className="text-sm text-foreground">{entry.location}{entry.country ? `, ${entry.country}` : ''}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No location set</p>
            )
          )}
        </div>

        {/* Vessels */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Vessels</label>
          {editing ? (
            <div className="grid grid-cols-1 gap-0.5 p-2 border border-border rounded-md max-h-32 overflow-y-auto bg-muted/30">
              {allVessels.map(v => (
                <label key={v.id} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                  <Checkbox
                    checked={form.vessel_ids.includes(v.id)}
                    onCheckedChange={() => toggleVessel(v.id)}
                  />
                  <span className="truncate">{v.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {entry.vessels?.map(ev => (
                <Badge key={ev.id} variant="outline" className="text-xs">
                  {ev.vessel?.name || ev.vessel_id}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          {editing ? (
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="text-xs min-h-[60px]"
              placeholder="Add notes..."
            />
          ) : (
            entry.notes ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No notes</p>
            )
          )}
        </div>

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
      <div className="p-4 border-t border-border space-y-2">
        {editing ? (
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 text-xs" onClick={handleSave} disabled={updateEntry.isPending}>
              <Save className="w-3 h-3 mr-1" /> Save
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={handleCancel}>
              <XCircle className="w-3 h-3 mr-1" /> Cancel
            </Button>
          </div>
        ) : isEditable ? (
          <Button variant="destructive" size="sm" className="w-full text-xs" onClick={handleDelete}>
            Delete Entry
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export default EntryDetailPanel;
