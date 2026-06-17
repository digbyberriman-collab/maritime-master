import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { parsePlannerWorkbook, type ImportPreview } from '../lib/xlsxImporter';
import type { VesselLite, CrewLite } from '../hooks/useVesselsAndCrew';
import type { PlannerLane } from '../types';
import { toast } from '@/shared/hooks/use-toast';
import { Loader2, Upload, CheckCircle2 } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  vessels: VesselLite[];
  crew: CrewLite[];
  lanes: PlannerLane[];
  onComplete: () => void;
}

const ImportDialog: React.FC<Props> = ({ open, onClose, vessels, crew, lanes, onComplete }) => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [vesselId, setVesselId] = useState<string>('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

  const vesselName = vessels.find((v) => v.id === vesselId)?.name ?? '';

  const onParse = async () => {
    if (!file || !vesselId) return;
    setBusy(true);
    try {
      const p = await parsePlannerWorkbook(file, vesselName);
      setPreview(p);
    } catch (e: any) {
      toast({ title: 'Parse failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const matchCrew = (name: string): string | null => {
    const lc = name.toLowerCase().trim();
    const m = crew.find((c) => `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase().trim() === lc
      || (c.last_name ?? '').toLowerCase() === lc);
    return m?.user_id ?? null;
  };

  const onCommit = async () => {
    if (!preview || !vesselId || !user) return;
    setBusy(true);
    try {
      const { data: prof } = await supabase.from('profiles').select('company_id').eq('user_id', user.id).single();
      const company_id = (prof as any)?.company_id;
      if (!company_id) throw new Error('No company');

      const { data: batch } = await (supabase as any).from('frp_import_batches')
        .insert({ company_id, filename: file!.name, imported_by: user.id, status: 'processing' })
        .select().single();

      // Ensure lanes exist
      const laneIdByLabel = new Map<string, string>();
      for (const ln of lanes.filter((l) => l.vessel_id === vesselId)) laneIdByLabel.set(ln.lane_label.toLowerCase(), ln.id);
      const uniqueLanes = Array.from(new Set(preview.rotations.map((r) => r.laneLabel))).filter(Boolean);
      for (const label of uniqueLanes) {
        if (laneIdByLabel.has(label.toLowerCase())) continue;
        const r = preview.rotations.find((x) => x.laneLabel === label)!;
        const { data: created } = await (supabase as any).from('frp_planner_lanes')
          .insert({ company_id, vessel_id: vesselId, lane_label: label, department: r.department, position_title: r.positionTitle, lane_order: laneIdByLabel.size })
          .select().single();
        if (created) laneIdByLabel.set(label.toLowerCase(), created.id);
      }

      // Insert rotations
      const rotsPayload = preview.rotations.map((r) => ({
        company_id, vessel_id: vesselId,
        lane_id: laneIdByLabel.get(r.laneLabel.toLowerCase()) ?? null,
        crew_user_id: matchCrew(r.crewName),
        crew_name_raw: r.crewName,
        start_date: r.start, end_date: r.end,
        label: r.crewName, rotation_type: r.rotationType, status: 'draft',
        source_import_id: batch.id, created_by: user.id, updated_by: user.id,
      }));
      if (rotsPayload.length) await (supabase as any).from('frp_rotation_assignments').insert(rotsPayload);

      const locsPayload = preview.locations.map((l) => ({
        company_id, vessel_id: vesselId,
        start_date: l.start, end_date: l.end,
        location_name: l.location, location_status: l.status,
        source_import_id: batch.id, created_by: user.id, updated_by: user.id,
      }));
      if (locsPayload.length) await (supabase as any).from('frp_vessel_locations').insert(locsPayload);

      const travelPayload = preview.travel.map((t) => ({
        company_id, vessel_id: vesselId,
        crew_user_id: matchCrew(t.crewName), crew_name_raw: t.crewName,
        direction: t.direction,
        flight_datetime: t.flightDate ? new Date(t.flightDate).toISOString() : null,
        flight_number: t.flightNumber ?? null, changeover_date: t.changeoverDate ?? null,
        accommodation: t.accommodation ?? null, route: t.route ?? null,
        flight_supplier: t.supplier ?? null, transfer_details: t.transfer ?? null,
        source_import_id: batch.id, created_by: user.id, updated_by: user.id,
      }));
      if (travelPayload.length) await (supabase as any).from('frp_travel_movements').insert(travelPayload);

      await (supabase as any).from('frp_import_batches').update({
        status: 'complete',
        summary: {
          rotations: rotsPayload.length, locations: locsPayload.length, travel: travelPayload.length, warnings: preview.warnings,
        },
      }).eq('id', batch.id);

      toast({ title: 'Import complete', description: `${rotsPayload.length} rotations, ${locsPayload.length} locations, ${travelPayload.length} travel records.` });
      onComplete();
      onClose();
    } catch (e: any) {
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import rotation planner from XLSX</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Target vessel</Label>
            <Select value={vesselId} onValueChange={setVesselId}>
              <SelectTrigger><SelectValue placeholder="Pick a vessel" /></SelectTrigger>
              <SelectContent>
                {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>XLSX file</Label>
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <Button onClick={onParse} disabled={!file || !vesselId || busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Parse preview
          </Button>

          {preview && (
            <div className="rounded border p-3 text-xs space-y-1 max-h-72 overflow-auto bg-muted/30">
              <div className="flex items-center gap-2 text-green-600"><CheckCircle2 className="h-4 w-4" /> Detected</div>
              <div>Rotations: <b>{preview.rotations.length}</b></div>
              <div>Vessel locations: <b>{preview.locations.length}</b></div>
              <div>Travel records: <b>{preview.travel.length}</b></div>
              {preview.warnings.length > 0 && (
                <div className="text-amber-600 mt-2">
                  {preview.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={onCommit} disabled={!preview || busy}>
            {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Commit import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportDialog;