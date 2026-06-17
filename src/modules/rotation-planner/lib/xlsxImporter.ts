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

export interface ParsedCrewRow {
  externalId?: string;
  fullName: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  nationality?: string;
  dateOfBirth?: string;
  passportNumber?: string;
  passportExpiry?: string;
  repatriationPort?: string;
  homeAddress?: string;
  gender?: string;
}

export interface ImportPreview {
  rotations: ParsedRotationRow[];
  locations: ParsedLocationRow[];
  travel: ParsedTravelRow[];
  crew: ParsedCrewRow[];
  warnings: string[];
}

function excelDate(v: unknown): string | undefined {
  if (!v) return undefined;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
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

/** Carry-forward date builder for the Draak Timeline sheet:
 * - Header row index 2 (3rd row): month markers in some columns (Date values).
 * - Header row index 3 (4th row): day-of-month numbers (1..31) per column.
 * Combines the most-recent month with each day to produce a per-column ISO date.
 */
function buildDateAxis(tl: XLSX.WorkSheet, range: XLSX.Range): Record<number, string> {
  const dateForCol: Record<number, string> = {};
  let curYear: number | null = null;
  let curMonth: number | null = null;
  let lastDay = 0;
  for (let C = range.s.c + 1; C <= range.e.c; C++) {
    const monthCell = tl[XLSX.utils.encode_cell({ r: 2, c: C })];
    const mv = monthCell?.v;
    if (mv instanceof Date && !isNaN(mv.getTime())) {
      curYear = mv.getFullYear();
      curMonth = mv.getMonth() + 1;
    } else if (typeof mv === 'number') {
      const d = XLSX.SSF.parse_date_code(mv);
      if (d) {
        curYear = d.y;
        curMonth = d.m;
      }
    }
    const dayCell = tl[XLSX.utils.encode_cell({ r: 3, c: C })];
    const dv = dayCell?.v;
    let day: number | null = null;
    if (typeof dv === 'number' && dv >= 1 && dv <= 31) day = Math.round(dv);
    else if (typeof dv === 'string' && /^\d{1,2}$/.test(dv.trim())) day = parseInt(dv.trim(), 10);
    if (day && curYear && curMonth) {
      // month rollover: if the day decreased significantly, advance the month
      if (day < lastDay - 10) {
        curMonth += 1;
        if (curMonth > 12) { curMonth = 1; curYear += 1; }
      }
      lastDay = day;
      dateForCol[C] = `${curYear}-${String(curMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return dateForCol;
}

const DEPT_RE = /\b(BRIDGE|DECK|ENG(?:INEERING)?|INTERIOR|GALLEY|WELLNESS|SHORESIDE|DIVE|HOTEL|MANAGEMENT|MEDIA|STEW)\b.*DEPT\b/i;

/**
 * Parser calibrated to the "Draak - Rotation Planner.xlsx" workbook.
 * - Timeline: weekly columns (Mon date in row 4) with crew names typed into cells.
 *   Consecutive cells in the same row sharing the same crew text form one block.
 *   Department headers (e.g. "BRIDGE DEPT") group the lanes that follow.
 * - Monthly tabs (e.g. "Feb 26"): header row at index 2 with Name / Arrival / etc.
 * - Also still handles legacy merged-cell layouts as a fallback.
 */
export async function parsePlannerWorkbook(file: File, vesselNameDefault: string): Promise<ImportPreview> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { cellDates: true, cellStyles: true } as any);
  const warnings: string[] = [];
  const rotations: ParsedRotationRow[] = [];
  const locations: ParsedLocationRow[] = [];
  const travel: ParsedTravelRow[] = [];
  const crew: ParsedCrewRow[] = [];

  // ---- Timeline sheet ----
  const timelineName = wb.SheetNames.find((n) => /timeline/i.test(n)) ?? wb.SheetNames[0];
  const tl = wb.Sheets[timelineName];
  if (!tl) {
    warnings.push('No Timeline sheet found');
  } else {
    const range = XLSX.utils.decode_range(tl['!ref'] ?? 'A1');
    const dateForCol = buildDateAxis(tl, range);
    const colCount = Object.keys(dateForCol).length;
    if (colCount === 0) warnings.push('Could not detect date columns in Timeline');
    // Each column represents roughly a week (Mon..Sun); approximate the block end.
    const colEndDate = (c: number): string => {
      const start = dateForCol[c];
      if (!start) return '';
      // find the next column's date; use day-before as this column's end
      let nextC = c + 1;
      while (nextC <= range.e.c && !dateForCol[nextC]) nextC++;
      const nextStart = dateForCol[nextC];
      if (nextStart) {
        const d = new Date(nextStart + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      }
      // fall back: +6 days
      const d = new Date(start + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 6);
      return d.toISOString().slice(0, 10);
    };

    // Vessel locations live in merged cells on rows 0–1 (if present)
    for (const m of tl['!merges'] ?? []) {
      if (m.s.r <= 1 && m.s.c > 0) {
        const cell = tl[XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c })];
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

    // Detect lane label per row from column A. Dept rows match "<NAME> DEPT".
    const laneLabelByRow: Record<number, { lane: string; dept: string | null; position: string | null }> = {};
    let currentDept: string | null = null;
    for (let R = 4; R <= range.e.r; R++) {
      const cell = tl[XLSX.utils.encode_cell({ r: R, c: range.s.c })];
      const v = String(cell?.v ?? '').trim();
      if (!v || v === '.') continue;
      const looksDept = DEPT_RE.test(v);
      if (looksDept) {
        currentDept = v.replace(/\s*DEPT\s*$/i, '').trim();
        continue; // header row, no lane
      }
      laneLabelByRow[R] = { lane: v, dept: currentDept, position: v };
    }

    // Pass 1: legacy merged-cell rotation blocks (if any).
    const handledByMerge = new Set<string>();
    for (const m of tl['!merges'] ?? []) {
      if (m.s.r < 4 || m.s.c === range.s.c) continue;
      const laneInfo = laneLabelByRow[m.s.r];
      const start = dateForCol[m.s.c];
      if (!laneInfo || !start) continue;
      const cell = tl[XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c })];
      const label = String(cell?.v ?? '').trim();
      const end = dateForCol[m.e.c] ? colEndDate(m.e.c) : colEndDate(m.s.c);
      rotations.push({
        vesselGuess: vesselNameDefault,
        laneLabel: laneInfo.lane,
        department: laneInfo.dept,
        positionTitle: laneInfo.position,
        crewName: label || laneInfo.lane,
        start,
        end,
        rotationType: classifyRotation(label || laneInfo.lane),
      });
      for (let c = m.s.c; c <= m.e.c; c++) handledByMerge.add(`${m.s.r}:${c}`);
    }

    // Pass 2: contiguous-cell rotation blocks (the Draak format).
    const dateCols = Object.keys(dateForCol).map(Number).sort((a, b) => a - b);
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    for (const R of Object.keys(laneLabelByRow).map(Number)) {
      const laneInfo = laneLabelByRow[R];
      let runStart: number | null = null;
      let runLabel = '';
      const flush = (endCol: number) => {
        if (runStart == null) return;
        const startIso = dateForCol[runStart];
        const endIso = colEndDate(endCol);
        if (startIso && runLabel) {
          rotations.push({
            vesselGuess: vesselNameDefault,
            laneLabel: laneInfo.lane,
            department: laneInfo.dept,
            positionTitle: laneInfo.position,
            crewName: runLabel,
            start: startIso,
            end: endIso,
            rotationType: classifyRotation(runLabel),
          });
        }
        runStart = null;
        runLabel = '';
      };
      for (const C of dateCols) {
        if (handledByMerge.has(`${R}:${C}`)) { flush(C - 1); continue; }
        const cell = tl[XLSX.utils.encode_cell({ r: R, c: C })];
        const raw = cell?.v == null ? '' : String(cell.v).trim();
        if (!raw) { flush(C - 1); continue; }
        if (runStart != null && norm(raw) === norm(runLabel)) continue;
        flush(C - 1);
        runStart = C;
        runLabel = raw;
      }
      flush(dateCols[dateCols.length - 1] ?? 0);
    }
  }

  // ---- Monthly arrival/departure sheets (e.g. "Feb 26") ----
  // Real header row is row index 2 (3rd row); titles often have trailing spaces.
  const monthRe = /^[A-Za-z]{3,9}\s*'?\s*\d{2,4}$/;
  const cleanName = (n: string) => n.replace(/[\n\r].*/s, '').replace(/\*+/g, '').trim();
  const flightDateFromText = (txt: string, sheetName: string): string | undefined => {
    // Match patterns like "10FEB on KL942 @19:50" or "1 DEC on ..."
    const m = txt.match(/(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i);
    if (!m) return undefined;
    const day = parseInt(m[1], 10);
    const monthIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase());
    // Derive year from sheet name
    const yMatch = sheetName.match(/(\d{2,4})/);
    let year = yMatch ? parseInt(yMatch[1], 10) : new Date().getFullYear();
    if (year < 100) year += 2000;
    return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  const flightNumFromText = (txt: string): string | undefined => {
    const m = txt.match(/\b([A-Z]{1,3}\s?\d{1,4}[A-Z]?)\b/);
    return m ? m[1].replace(/\s/g, '') : undefined;
  };

  for (const sname of wb.SheetNames) {
    if (!monthRe.test(sname.trim())) continue;
    const sheet = wb.Sheets[sname];
    const ref = sheet['!ref'];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    // Find header row by looking for "Name" in column A within the first 6 rows
    let headerRow = -1;
    for (let R = 0; R <= Math.min(5, range.e.r); R++) {
      const v = String(sheet[XLSX.utils.encode_cell({ r: R, c: 0 })]?.v ?? '').trim().toLowerCase();
      if (v === 'name') { headerRow = R; break; }
    }
    if (headerRow < 0) continue;
    const headers: string[] = [];
    for (let C = 0; C <= range.e.c; C++) {
      headers[C] = String(sheet[XLSX.utils.encode_cell({ r: headerRow, c: C })]?.v ?? '').trim().toLowerCase();
    }
    const colOf = (...needles: string[]) =>
      headers.findIndex((h) => needles.some((n) => h.includes(n)));
    const cName = colOf('name');
    const cArrival = colOf('arrival date', 'arrival ');
    const cChange = colOf('change over', 'changeover');
    const cAccom = colOf('accomodation', 'accommodation');
    const cRoute = colOf('route');
    const cSupp = colOf('flight supplier', 'supplier');
    const cTransfer = colOf('transfer');
    // Heuristic for direction: "ARRIVALS" / "DEPARTURES" banner in rows above header
    let direction: 'arrival' | 'departure' = 'arrival';
    for (let R = 0; R < headerRow; R++) {
      const v = String(sheet[XLSX.utils.encode_cell({ r: R, c: 0 })]?.v ?? '').toLowerCase();
      if (v.includes('departure')) { direction = 'departure'; break; }
      if (v.includes('arrival')) { direction = 'arrival'; }
    }
    for (let R = headerRow + 1; R <= range.e.r; R++) {
      const rawName = String(sheet[XLSX.utils.encode_cell({ r: R, c: cName })]?.v ?? '').trim();
      if (!rawName) continue;
      const name = cleanName(rawName);
      if (!name) continue;
      // Banner row inside the table? Skip if it looks like "DEPARTURES - FEB 26"
      if (/^(arrivals|departures)/i.test(name)) {
        direction = name.toLowerCase().startsWith('depart') ? 'departure' : 'arrival';
        continue;
      }
      const arrCell = cArrival >= 0 ? sheet[XLSX.utils.encode_cell({ r: R, c: cArrival })]?.v : undefined;
      const arrText = arrCell == null ? '' : String(arrCell);
      const flightDate = excelDate(arrCell) ?? flightDateFromText(arrText, sname);
      const flightNumber = flightNumFromText(arrText);
      travel.push({
        vesselGuess: vesselNameDefault,
        crewName: name,
        direction,
        flightDate,
        flightNumber,
        changeoverDate: cChange >= 0 ? excelDate(sheet[XLSX.utils.encode_cell({ r: R, c: cChange })]?.v) : undefined,
        accommodation: cAccom >= 0 ? String(sheet[XLSX.utils.encode_cell({ r: R, c: cAccom })]?.v ?? '').trim() || undefined : undefined,
        route: cRoute >= 0 ? String(sheet[XLSX.utils.encode_cell({ r: R, c: cRoute })]?.v ?? '').trim() || undefined : undefined,
        supplier: cSupp >= 0 ? String(sheet[XLSX.utils.encode_cell({ r: R, c: cSupp })]?.v ?? '').trim() || undefined : undefined,
        transfer: cTransfer >= 0 ? String(sheet[XLSX.utils.encode_cell({ r: R, c: cTransfer })]?.v ?? '').trim() || undefined : undefined,
      });
    }
  }

  if (rotations.length === 0 && locations.length === 0 && travel.length === 0) {
    warnings.push('No recognisable rotation/location/travel rows found. The workbook may need manual mapping.');
  }

  // ---- Crew Data sheet ----
  const crewSheetName = wb.SheetNames.find((n) => /^crew\s*data$/i.test(n));
  if (crewSheetName) {
    const cs = wb.Sheets[crewSheetName];
    const ref = cs['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      // Find header row containing "Full Name" or "FirstName"
      let headerRow = -1;
      for (let R = 0; R <= Math.min(5, range.e.r); R++) {
        for (let C = 0; C <= Math.min(40, range.e.c); C++) {
          const v = String(cs[XLSX.utils.encode_cell({ r: R, c: C })]?.v ?? '').trim().toLowerCase();
          if (v === 'full name' || v === 'firstname' || v === 'jobtitle') { headerRow = R; break; }
        }
        if (headerRow >= 0) break;
      }
      if (headerRow >= 0) {
        const headers: string[] = [];
        for (let C = 0; C <= range.e.c; C++) {
          headers[C] = String(cs[XLSX.utils.encode_cell({ r: headerRow, c: C })]?.v ?? '').trim().toLowerCase();
        }
        const col = (...needles: string[]) =>
          headers.findIndex((h) => needles.some((n) => h === n || h.includes(n)));
        const cId = col('id');
        const cJob = col('jobtitle', 'job title');
        const cFull = col('full name', 'fullname');
        const cFirst = col('firstname', 'first name');
        const cMiddle = col('middlename', 'middle name');
        const cLast = col('lastname', 'last name');
        const cEmail = col('email');
        const cPhone = col('contact number', 'phone');
        const cNat = col('nationality');
        const cDob = col('dateofbirth', 'date of birth');
        const cPass = col('passport #', 'passport number');
        const cPassExp = col('passport expiry');
        const cRepat = col('repatriation port', 'repatriation');
        const cAddr = col('home address', 'residental address');
        const cGender = col('gender');
        for (let R = headerRow + 1; R <= range.e.r; R++) {
          const get = (c: number) => c >= 0 ? cs[XLSX.utils.encode_cell({ r: R, c })]?.v : undefined;
          const fullRaw = String(get(cFull) ?? '').trim();
          const firstRaw = String(get(cFirst) ?? '').trim();
          const lastRaw = String(get(cLast) ?? '').trim();
          const fullName = fullRaw || [firstRaw, lastRaw].filter(Boolean).join(' ').trim();
          if (!fullName) continue;
          const idVal = get(cId);
          crew.push({
            externalId: idVal == null ? undefined : String(idVal).replace(/\.0$/, ''),
            fullName,
            firstName: firstRaw || undefined,
            middleName: String(get(cMiddle) ?? '').trim() || undefined,
            lastName: lastRaw || undefined,
            jobTitle: String(get(cJob) ?? '').trim() || undefined,
            email: String(get(cEmail) ?? '').trim() || undefined,
            phone: (() => { const p = get(cPhone); return p == null ? undefined : String(p).trim() || undefined; })(),
            nationality: String(get(cNat) ?? '').trim() || undefined,
            dateOfBirth: excelDate(get(cDob)),
            passportNumber: (() => { const p = get(cPass); return p == null ? undefined : String(p).trim() || undefined; })(),
            passportExpiry: excelDate(get(cPassExp)),
            repatriationPort: String(get(cRepat) ?? '').trim() || undefined,
            homeAddress: String(get(cAddr) ?? '').trim() || undefined,
            gender: String(get(cGender) ?? '').trim() || undefined,
          });
        }
        if (crew.length === 0) warnings.push('Crew Data sheet found but no rows parsed');
      } else {
        warnings.push('Crew Data sheet found but no recognisable header row');
      }
    }
  } else {
    warnings.push('No "Crew Data" sheet found');
  }

  if (rotations.length > 0) warnings.push(`Parsed ${rotations.length} rotation blocks from Timeline`);
  if (travel.length > 0) warnings.push(`Parsed ${travel.length} travel rows across monthly sheets`);
  if (crew.length > 0) warnings.push(`Parsed ${crew.length} crew records from Crew Data`);
  return { rotations, locations, travel, crew, warnings };
}