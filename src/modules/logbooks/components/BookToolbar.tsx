import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Layers, Plus, Printer, Settings2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { profiles } from '../lib/templates';
import type { LogbookBook } from '../lib/catalog';
import type { FlagProfileId, RegistryRow, VolumeRow } from '../lib/types';

interface Props {
  book: LogbookBook;
  profile: FlagProfileId;
  onProfileChange: (profile: FlagProfileId) => void;
  volumes: VolumeRow[];
  volume: VolumeRow | null;
  onVolumeChange: (id: string) => void;
  registry: RegistryRow | null;
  isMaster: boolean;
  autoReadings: boolean;
  onAutoReadingsChange: (value: boolean) => void;
  readingStatus: string;
  onOpenVolume: () => void;
  onContinueVolume: () => void;
  onShowCover: () => void;
  onCloseVolume: () => void;
  onPrint: () => void;
}

/** Compact toolbar: flag profile tabs, current volume, export and the Book settings disclosure. */
const BookToolbar: React.FC<Props> = ({
  book, profile, onProfileChange, volumes, volume, onVolumeChange, registry, isMaster, autoReadings, onAutoReadingsChange, readingStatus,
  onOpenVolume, onContinueVolume, onShowCover, onCloseVolume, onPrint,
}) => {
  const [open, setOpen] = React.useState(false);
  const settingsId = React.useId();
  const act = (fn: () => void) => () => { setOpen(false); fn(); };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Flag profile">
        {profiles.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={profile === p.id}
            onClick={() => onProfileChange(p.id)}
            className={cn('rounded-md border px-3 py-1.5 text-left text-sm leading-tight', profile === p.id ? 'border-primary bg-primary/10 font-semibold text-foreground' : 'border-border text-muted-foreground hover:text-foreground')}
          >
            {p.id}<small className="block text-[10px] font-normal">{p.flag}</small>
          </button>
        ))}
        <Button asChild variant="ghost" size="sm" className="text-xs"><Link to={`/vessel/logbooks/assurance?book=${book.id}`}><Layers className="mr-1 h-3.5 w-3.5" /> Compare formats</Link></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="max-w-[16rem] truncate text-sm text-muted-foreground" title={volume?.label ?? ''}>{volume ? volume.label : 'No volume opened'}</span>
        {volume ? (
          <Button type="button" variant="outline" size="sm" onClick={onPrint}><Printer className="mr-1 h-4 w-4" /> Export / print</Button>
        ) : (
          <Button type="button" size="sm" onClick={onOpenVolume} disabled={!isMaster} title={isMaster ? undefined : 'The Master opens volumes'}><Plus className="mr-1 h-4 w-4" /> Open volume</Button>
        )}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={open ? settingsId : undefined}><Settings2 className="mr-1 h-4 w-4" /> Book settings <ChevronDown className="ml-1 h-3.5 w-3.5" /></Button>
          </PopoverTrigger>
          <PopoverContent id={settingsId} align="end" className="w-80 space-y-4 text-sm">
            <h3 className="font-semibold">Book settings</h3>
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground" htmlFor="wb-volume">Current volume</label>
              <select id="wb-volume" value={volume?.id ?? ''} disabled={!volumes.length} onChange={(e) => onVolumeChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {volumes.length ? volumes.map((v) => <option key={v.id} value={v.id}>{v.label} · {v.status}</option>) : <option>Template preview · no volume opened</option>}
              </select>
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="outline" disabled={!isMaster} onClick={act(onOpenVolume)}><Plus className="mr-1 h-3.5 w-3.5" /> New volume</Button>
                {volume && <Button type="button" size="sm" variant="outline" onClick={act(onShowCover)}>Cover details</Button>}
                {volume && isMaster && (
                  volume.status === 'open'
                    ? <Button type="button" size="sm" variant="ghost" onClick={act(onCloseVolume)}>Close volume</Button>
                    : <Button type="button" size="sm" variant="ghost" onClick={act(onContinueVolume)}>Open continuation</Button>
                )}
              </div>
            </div>
            <div className="space-y-2 border-t border-border pt-3">
              <p><strong>{registry ? `${profile} registry · revision ${registry.version}` : 'Vessel registry not set up'}</strong></p>
              <Link to="/vessel/logbooks/registry" className="text-xs text-primary hover:underline">{registry ? 'Edit vessel details' : 'Set up vessel details'} ↗</Link>
              {book.sensor ? (
                <label className="flex items-start justify-between gap-2">
                  <span>Prepare an entry from readings on open<small className="block text-xs text-muted-foreground">{readingStatus}</small></span>
                  <Switch checked={autoReadings} onCheckedChange={onAutoReadingsChange} aria-label="Prepare an entry from readings on open" />
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">Saved registration details fill the cover of a new volume.</p>
              )}
            </div>
            <Link to={`/vessel/logbooks/assurance?book=${book.id}&tab=coverage`} className="block text-xs text-primary hover:underline">Sources &amp; format coverage ↗</Link>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
};

export default BookToolbar;
