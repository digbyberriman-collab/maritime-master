import jsPDF from 'jspdf';
import {
  addDays, differenceInCalendarDays, eachMonthOfInterval, endOfMonth,
  format, parseISO, startOfMonth,
} from 'date-fns';
import type {
  RotationAssignment, VesselLocation, PlannerLane, ZoomLevel, FrpRotationType,
} from '../types';
import { ROTATION_TYPE_COLOURS, ROTATION_TYPE_LABELS, STATUS_LABELS } from '../constants';

export interface PdfExportOptions {
  /** Already filtered assignments — exactly what the user is looking at. */
  assignments: RotationAssignment[];
  locations: VesselLocation[];
  lanes: PlannerLane[];
  viewStart: Date;
  viewEnd: Date;
  zoom: ZoomLevel;
  vesselName: (id: string | null) => string;
  crewName: (id: string | null) => string;
  /** Optional human-readable summary of the active filters, printed in the header. */
  filterSummary?: string;
  /** Include a table of every block after the timeline pages. */
  includeSchedule?: boolean;
}

const LOCATION_STATUS_COLOURS: Record<string, string> = {
  confirmed: '#0f766e',
  estimated: '#0891b2',
  tbc: '#94a3b8',
};

/** Days rendered per page at each zoom level — keeps day/month labels legible. */
const DAYS_PER_PAGE: Record<ZoomLevel, number> = {
  day: 31,
  week: 92,
  fortnight: 184,
  month: 366,
  quarter: 549,
  year: 1096,
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Black or white text, whichever stays readable on the block colour. */
const textColourFor = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? [17, 24, 39] : [255, 255, 255];
};

/** Truncates to a single line with an ellipsis so labels never wrap out of a block. */
const fitText = (doc: jsPDF, text: string, maxW: number): string => {
  if (!text) return '';
  if (doc.getTextWidth(text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
  return s.length > 1 ? s.trimEnd() + '…' : '';
};

const blockColour = (a: RotationAssignment) =>
  a.colour || ROTATION_TYPE_COLOURS[a.rotation_type] || '#9ca3af';

const clampISO = (iso: string, min: Date, max: Date) => {
  const d = parseISO(iso);
  return d < min ? min : d > max ? max : d;
};

/**
 * Renders the filtered planner view as a landscape timeline PDF, preserving the
 * on-screen block colours, exact start/end dates and block labels. Wide date
 * ranges and long lane lists are paginated across pages.
 */
export function exportPlannerToPDF(opts: PdfExportOptions) {
  const {
    assignments, locations, lanes, viewStart, viewEnd, zoom,
    vesselName, crewName, filterSummary, includeSchedule = true,
  } = opts;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a3' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const MARGIN = 28;
  const LABEL_W = 190;
  const HEADER_TOP = 74;      // title block
  const AXIS_H = 30;          // month + day axis
  const LOC_H = 22;           // vessel location lane
  const ROW_H = 20;
  const FOOTER_H = 46;        // legend + page number

  const gridX = MARGIN + LABEL_W;
  const gridW = pageW - gridX - MARGIN;

  // Lanes that actually carry visible blocks, keeping the on-screen order.
  const laneHasBlocks = new Set(assignments.map((a) => a.lane_id).filter(Boolean) as string[]);
  const usedLanes = lanes.filter((l) => laneHasBlocks.has(l.id));
  const orphans = assignments.filter((a) => !a.lane_id || !laneHasBlocks.has(a.lane_id!));
  type Row = { key: string; label: string; sub: string; laneId: string | null };
  const rows: Row[] = usedLanes.map((l) => ({
    key: l.id,
    laneId: l.id,
    label: l.lane_label,
    sub: [vesselName(l.vessel_id), l.department, l.position_title].filter(Boolean).join(' • '),
  }));
  if (orphans.length) rows.push({ key: '__unassigned__', laneId: null, label: 'Unassigned', sub: 'No lane' });

  const totalDays = Math.max(1, differenceInCalendarDays(viewEnd, viewStart) + 1);
  const daysPerPage = Math.min(totalDays, DAYS_PER_PAGE[zoom]);
  const dateSlices: { start: Date; end: Date }[] = [];
  for (let d = 0; d < totalDays; d += daysPerPage) {
    dateSlices.push({
      start: addDays(viewStart, d),
      end: addDays(viewStart, Math.min(totalDays - 1, d + daysPerPage - 1)),
    });
  }

  const gridTop = MARGIN + HEADER_TOP + AXIS_H + LOC_H;
  const rowsPerPage = Math.max(1, Math.floor((pageH - gridTop - MARGIN - FOOTER_H) / ROW_H));
  const rowSlices: Row[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerPage) rowSlices.push(rows.slice(i, i + rowsPerPage));
  if (rowSlices.length === 0) rowSlices.push([]);

  const generatedAt = format(new Date(), 'd MMM yyyy HH:mm');
  let pageNo = 0;
  

  const drawHeader = (slice: { start: Date; end: Date }, partLabel: string) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('Fleet Rotation Planner', MARGIN, MARGIN + 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${format(slice.start, 'd MMM yyyy')} – ${format(slice.end, 'd MMM yyyy')}  ·  ${zoom} view  ·  ${assignments.length} blocks`,
      MARGIN, MARGIN + 34,
    );
    if (filterSummary) {
      doc.text(`Filters: ${filterSummary}`, MARGIN, MARGIN + 48, { maxWidth: pageW - MARGIN * 2 - 200 });
    }
    doc.text(`${partLabel}  ·  Generated ${generatedAt}`, pageW - MARGIN, MARGIN + 34, { align: 'right' });
  };

  const drawAxis = (slice: { start: Date; end: Date }, dayW: number, bodyBottom: number) => {
    const axisY = MARGIN + HEADER_TOP;
    const months = eachMonthOfInterval({ start: slice.start, end: slice.end });

    // Month bands
    doc.setFontSize(8);
    months.forEach((m, i) => {
      const s = startOfMonth(m) < slice.start ? slice.start : startOfMonth(m);
      const e = endOfMonth(m) > slice.end ? slice.end : endOfMonth(m);
      const x = gridX + differenceInCalendarDays(s, slice.start) * dayW;
      const w = (differenceInCalendarDays(e, s) + 1) * dayW;
      doc.setFillColor(...(i % 2 === 0 ? [241, 245, 249] : [226, 232, 240]) as [number, number, number]);
      doc.rect(x, axisY, w, 15, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      if (w > 26) doc.text(fitText(doc, format(m, w > 52 ? 'MMM yyyy' : 'MMM'), w - 3), x + 2, axisY + 11);
      // Month separator down the grid
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.6);
      doc.line(x, axisY, x, bodyBottom);
    });

    // Day / week ticks
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    const tickEvery = dayW >= 12 ? 1 : dayW >= 5 ? 7 : dayW >= 2 ? 14 : 30;
    for (let d = 0; d <= differenceInCalendarDays(slice.end, slice.start); d += tickEvery) {
      const day = addDays(slice.start, d);
      const x = gridX + d * dayW;
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(x, axisY + 15, x, bodyBottom);
      doc.setTextColor(100, 116, 139);
      if (dayW * tickEvery > 9) doc.text(format(day, tickEvery === 1 ? 'd' : 'd MMM'), x + 1, axisY + 26);
    }

    // Frame
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.8);
    doc.rect(gridX, axisY, gridW, bodyBottom - axisY);
    doc.line(gridX, axisY + 15, gridX + gridW, axisY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text('Vessel / Department / Role', MARGIN, axisY + 11);
  };

  const drawLocationLane = (slice: { start: Date; end: Date }, dayW: number) => {
    const y = MARGIN + HEADER_TOP + AXIS_H;
    doc.setFillColor(248, 250, 252);
    doc.rect(gridX, y, gridW, LOC_H, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Vessel itinerary', MARGIN, y + 14);

    locations
      .filter((l) => parseISO(l.end_date) >= slice.start && parseISO(l.start_date) <= slice.end)
      .forEach((l) => {
        const s = clampISO(l.start_date, slice.start, slice.end);
        const e = clampISO(l.end_date, slice.start, slice.end);
        const x = gridX + differenceInCalendarDays(s, slice.start) * dayW;
        const w = Math.max(1.5, (differenceInCalendarDays(e, s) + 1) * dayW);
        const colour = l.colour || LOCATION_STATUS_COLOURS[l.location_status] || '#64748b';
        doc.setFillColor(...hexToRgb(colour));
        doc.rect(x, y + 3, w, LOC_H - 6, 'F');
        if (w > 22) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...textColourFor(colour));
          doc.text(fitText(doc, l.location_name, w - 4), x + 2, y + LOC_H / 2 + 2.2);
        }
      });

    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.6);
    doc.line(gridX, y + LOC_H, gridX + gridW, y + LOC_H);
  };

  const drawLegend = () => {
    const y = pageH - MARGIN - 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(51, 65, 85);
    doc.text('Legend', MARGIN, y - 4);
    let x = MARGIN;
    doc.setFont('helvetica', 'normal');
    (Object.keys(ROTATION_TYPE_LABELS) as FrpRotationType[]).forEach((t) => {
      const label = ROTATION_TYPE_LABELS[t];
      const w = doc.getTextWidth(label) + 16;
      if (x + w > pageW - MARGIN) return;
      doc.setFillColor(...hexToRgb(ROTATION_TYPE_COLOURS[t]));
      doc.rect(x, y + 1, 8, 8, 'F');
      doc.setTextColor(51, 65, 85);
      doc.text(label, x + 11, y + 8);
      x += w;
    });
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    
  };

  dateSlices.forEach((slice, si) => {
    const sliceDays = differenceInCalendarDays(slice.end, slice.start) + 1;
    const dayW = gridW / sliceDays;

    rowSlices.forEach((rowSet, ri) => {
      if (pageNo > 0) doc.addPage();
      pageNo += 1;

      const bodyBottom = gridTop + rowSet.length * ROW_H;
      const partLabel = `Dates ${si + 1}/${dateSlices.length} · Lanes ${ri + 1}/${rowSlices.length}`;
      drawHeader(slice, partLabel);
      drawAxis(slice, dayW, Math.max(bodyBottom, gridTop + ROW_H));
      drawLocationLane(slice, dayW);

      rowSet.forEach((row, i) => {
        const y = gridTop + i * ROW_H;
        if (i % 2 === 1) {
          doc.setFillColor(249, 250, 251);
          doc.rect(MARGIN, y, pageW - MARGIN * 2, ROW_H, 'F');
        }
        // Lane label
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(17, 24, 39);
        doc.text(fitText(doc, row.label, LABEL_W - 6), MARGIN + 2, y + 9);
        if (row.sub) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6);
          doc.setTextColor(107, 114, 128);
          doc.text(fitText(doc, row.sub, LABEL_W - 6), MARGIN + 2, y + 17);
        }
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, y + ROW_H, pageW - MARGIN, y + ROW_H);

        // Blocks in this lane that intersect this date slice
        const laneBlocks = row.laneId
          ? assignments.filter((a) => a.lane_id === row.laneId)
          : orphans;
        laneBlocks
          .filter((a) => parseISO(a.end_date) >= slice.start && parseISO(a.start_date) <= slice.end)
          .forEach((a) => {
            const s = clampISO(a.start_date, slice.start, slice.end);
            const e = clampISO(a.end_date, slice.start, slice.end);
            const x = gridX + differenceInCalendarDays(s, slice.start) * dayW;
            const w = Math.max(1.5, (differenceInCalendarDays(e, s) + 1) * dayW);
            const colour = blockColour(a);
            doc.setFillColor(...hexToRgb(colour));
            doc.rect(x, y + 3, w, ROW_H - 6, 'F');
            if (a.status === 'conflict') {
              doc.setDrawColor(220, 38, 38);
              doc.setLineWidth(1);
              doc.rect(x, y + 3, w, ROW_H - 6);
            }
            const text = [
              a.label ?? ROTATION_TYPE_LABELS[a.rotation_type],
              crewName(a.crew_user_id) || a.crew_name_raw || '',
            ].filter(Boolean).join(' — ');
            if (w > 18 && text) {
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(6.2);
              doc.setTextColor(...textColourFor(colour));
              doc.text(fitText(doc, text, w - 4), x + 2, y + ROW_H / 2 + 2);
            }
          });
      });

      if (rowSet.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(148, 163, 184);
        doc.text('No rotation blocks match the current filters.', gridX + 8, gridTop + 16);
      }

      drawLegend();
    });
  });

  // Schedule table: exact dates, labels, types and status for every block
  if (includeSchedule && assignments.length) {
    doc.addPage();
    pageNo += 1;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text('Rotation schedule', MARGIN, MARGIN + 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`${assignments.length} blocks · ${format(viewStart, 'd MMM yyyy')} – ${format(viewEnd, 'd MMM yyyy')}`, MARGIN, MARGIN + 32);

    const cols = [
      { key: 'colour', label: '', w: 14 },
      { key: 'vessel', label: 'Vessel', w: 110 },
      { key: 'lane', label: 'Lane / role', w: 150 },
      { key: 'crew', label: 'Crew', w: 130 },
      { key: 'start', label: 'Start', w: 70 },
      { key: 'end', label: 'End', w: 70 },
      { key: 'days', label: 'Days', w: 40 },
      { key: 'type', label: 'Type', w: 70 },
      { key: 'status', label: 'Status', w: 70 },
      { key: 'label', label: 'Label', w: 180 },
    ];
    const laneLabel = (id: string | null) => lanes.find((l) => l.id === id)?.lane_label ?? '—';

    const sorted = [...assignments].sort((a, b) => a.start_date.localeCompare(b.start_date));
    let y = MARGIN + 52;
    const drawTableHead = () => {
      let x = MARGIN;
      doc.setFillColor(241, 245, 249);
      doc.rect(MARGIN, y - 11, pageW - MARGIN * 2, 15, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);
      cols.forEach((c) => { doc.text(c.label, x + 2, y); x += c.w; });
      y += 12;
    };
    drawTableHead();

    sorted.forEach((a) => {
      if (y > pageH - MARGIN - 20) {
        doc.addPage();
        pageNo += 1;
        y = MARGIN + 20;
        drawTableHead();
      }
      const colour = blockColour(a);
      const values: Record<string, string> = {
        colour: '',
        vessel: vesselName(a.vessel_id),
        lane: laneLabel(a.lane_id),
        crew: crewName(a.crew_user_id) || a.crew_name_raw || '—',
        start: format(parseISO(a.start_date), 'd MMM yyyy'),
        end: format(parseISO(a.end_date), 'd MMM yyyy'),
        days: String(differenceInCalendarDays(parseISO(a.end_date), parseISO(a.start_date)) + 1),
        type: ROTATION_TYPE_LABELS[a.rotation_type],
        status: STATUS_LABELS[a.status] ?? a.status,
        label: a.label ?? '',
      };
      let x = MARGIN;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      cols.forEach((c) => {
        if (c.key === 'colour') {
          doc.setFillColor(...hexToRgb(colour));
          doc.rect(x + 2, y - 6, 8, 8, 'F');
        } else {
          doc.setTextColor(31, 41, 55);
          doc.text(fitText(doc, values[c.key], c.w - 5), x + 2, y);
        }
        x += c.w;
      });
      doc.setDrawColor(237, 240, 245);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, y + 4, pageW - MARGIN, y + 4);
      y += 13;
    });
  }

  // Stamp page numbers once the real page count is known
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${p} of ${pageCount}`, pageW - MARGIN, pageH - MARGIN, { align: 'right' });
  }

  doc.save(`fleet-rotation-planner_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}
