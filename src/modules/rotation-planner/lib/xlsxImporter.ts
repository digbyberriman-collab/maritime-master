import * as XLSX from 'xlsx';
import type { FrpRotationType, FrpLocationStatus } from '../types';

export interface ParsedRotationRow {
  vesselGuess: string;
  laneLabel: string;
  department: string | null;
  positionTitle: string | null;
  crewName: string;
  start: string;
  end: string;
  rotationType: FrpRotationType;
  notes?: string;
}

export interface ParsedLocationRow {
  vesselGuess: string;
  location: string;
  status: FrpLocationStatus;
  start: string;
  end: string;
}

export interface ParsedTravelRow {
  vesselGuess: string;
  crewName: string;
  direction: 'arrival' | 'departure';
  flightDate?: string;
  flightNumber?: string;
  changeoverDate?: string;
  accommodation?: string;
  route?: string;
  supplier?: string;
  transfer?: string;
}

export interface ImportPreview {
  rotations: ParsedRotationRow[];
  locations: ParsedLocationRow[];
  travel: ParsedTravelRow[];
  warnings: string[];
}

function excelDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return undefined;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  if (typeof v === 'string') {
    const parsed = new Date(v);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return undefined;
}

function classifyRotation(label: string): FrpRotationType {
  const t = label.toLowerCase();
  if (t.includes('leave') || t.includes('vac') || t.includes('off')) return 'leave';
  if (t.includes('travel') || t.includes('flight')) return 'travel';
  if (t.includes('yard')) return 'yard';
  if (t.includes('wfh') || t.includes('home')) return 'wfh';
  if (t.includes('temp') || t.includes('cover')) return 'temp_cover';
  if (t.includes('train')) return 'training';
  if (t.includes('no crew') || t.includes('gap')) return 'no_crew';
  if (t.includes('tbc')) return 'tbc';
  if (t.includes('standby')) return 'standby';
  return 'onboard';
}

function classifyLocationStatus(name: string): FrpLocationStatus {
  const t = name.toLowerCase();
  if (t.includes('tbc')) return 'tbc';
  if (t.includes('?') || t.includes('estim')) return 'estimated';
  return 'confirmed';
}

/**
 * Generic best-effort parser. The "Draak - Rotation Planner.xlsx" Timeline sheet
 * uses merged-cell colour ranges that XLSX can read via !merges; we map each
 * merged cell on rows >= 5 (after header rows) into a rotation.
 */
export async function parsePlannerWorkbook(file: File, vesselNameDefault: string): Promise<ImportPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true, cellStyles: true } as any);
  const warnings: string[] = [];
  const rotations: ParsedRotationRow[] = [];
  const locations: ParsedLocationRow[] = [];
  const travel: ParsedTravelRow[] = [];

  // ---- Timeline sheet ----
  const timelineName = wb.SheetNames.find((n) => /timeline/i.test(n)) ?? wb.SheetNames[0];
  const tl = wb.Sheets[timelineName];
  if (!tl) {
    warnings.push('No Timeline sheet found');
  } else {
    const range = XLSX.utils.decode_range(tl['!ref'] ?? 'A1');
    // Build a date column index from header rows (rows 3/4 in spreadsheet -> indices 2/3)
    const dateForCol: Record<number, string> = {};
    for (let R = 0; R <= Math.min(5, range.e.r); R++) {
      for (let C = range.s.c + 1; C <= range.e.c; C++) {
        const cell = tl[XLSX.utils.encode_cell({ r: R, c: C })];
        const iso = excelDate(cell?.v);
        if (iso) dateForCol[C] = iso;
      }
    }
    const colCount = Object.keys(dateForCol).length;
    if (colCount === 0) warnings.push('Could not detect date columns in Timeline');

    // Row 0 = vessel locations
    for (const m of tl['!merges'] ?? []) {
      if (m.s.r === 0 && m.s.c > 0) {
        const cell = tl[XLSX.utils.encode_cell({ r: 0, c: m.s.c })];
        const name = String(cell?.v ?? '').trim();
        const start = dateForCol[m.s.c];
        const end = dateForCol[m.e.c] ?? start;
        if (name && start) {
          locations.push({
            vesselGuess: vesselNameDefault,
            location: name,
            status: classifyLocationStatus(name),
            start,
            end: end ?? start,
          });
        }
      }
    }

    // Detect lane label per row from column A
    const laneLabelByRow: Record<number, { lane: string; dept: string | null; position: string | null }> = {};
    let currentDept: string | null = null;
    for (let R = 4; R <= range.e.r; R++) {
      const cell = tl[XLSX.utils.encode_cell({ r: R, c: range.s.c })];
      const v = String(cell?.v ?? '').trim();
      if (!v) continue;
      const looksDept = /^(deck|engineering|interior|galley|bridge|stew|management|hotel)/i.test(v);
      if (looksDept) currentDept = v;
      laneLabelByRow[R] = { lane: v, dept: currentDept, position: looksDept ? null : v };
    }

    // Merged ranges below row 0 = rotation blocks
    for (const m of tl['!merges'] ?? []) {
      if (m.s.r < 4) continue;
      if (m.s.c === range.s.c) continue;
      const cell = tl[XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c })];
      const label = String(cell?.v ?? '').trim();
      const start = dateForCol[m.s.c];
      const end = dateForCol[m.e.c] ?? start;
      const laneInfo = laneLabelByRow[m.s.r];
      if (!laneInfo || !start) continue;
      rotations.push({
        vesselGuess: vesselNameDefault,
        laneLabel: laneInfo.lane,
        department: laneInfo.dept,
        positionTitle: laneInfo.position,
        crewName: label || laneInfo.lane,
        start,
        end: end ?? start,
        rotationType: classifyRotation(label || laneInfo.lane),
        notes: undefined,
      });
    }
  }

  // ---- Monthly arrival/departure sheets ----
  for (const sname of wb.SheetNames) {
    if (!/^[A-Za-z]{3,}\s*\d{2,4}$/.test(sname)) continue;
    const sheet = wb.Sheets[sname];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: '', raw: false });
    let direction: 'arrival' | 'departure' = 'arrival';
    for (const r of rows) {
      const keys = Object.keys(r).map((k) => k.toLowerCase());
      if (keys.some((k) => k.includes('depart'))) direction = 'departure';
      const name = r.Name || r.name || r['Crew'] || '';
      if (!name) continue;
      travel.push({
        vesselGuess: vesselNameDefault,
        crewName: String(name),
        direction,
        flightDate: excelDate(r['Flight Date'] || r['Departure Date'] || r['Arrival Date']),
        flightNumber: r['Flight'] || r['Flight Number'] || undefined,
        changeoverDate: excelDate(r['Changeover Date']),
        accommodation: r['Accommodation'] || undefined,
        route: r['Route'] || undefined,
        supplier: r['Flight Supplier'] || undefined,
        transfer: r['Transfer'] || r['Transfer From Airport'] || undefined,
      });
    }
  }

  if (rotations.length === 0 && locations.length === 0 && travel.length === 0) {
    warnings.push('No recognisable rotation/location/travel rows found. The workbook may need manual mapping.');
  }
  return { rotations, locations, travel, warnings };
}