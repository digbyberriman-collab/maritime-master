import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';
import { logClientExport } from '@/lib/records/services/exports';
import { EXPORT_COPY, exportFileName, isLegacyUnloggedExport } from '@/lib/export';

/**
 * One person on the official crew list: the identity fields of FAL 5. A
 * CrewMember fits; the vessel crew list report builds these from the
 * as-at list and the profiles' identity columns.
 */
export interface CrewListPerson {
  first_name?: string | null;
  last_name?: string | null;
  rank?: string | null;
  job_title?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  place_of_birth?: string | null;
  passport_number?: string | null;
  passport_country?: string | null;
  passport_expiry?: string | null;
  seamans_book_number?: string | null;
  embarkation_port?: string | null;
  contract_start_date?: string | null;
  personnel_type?: string | null;
  current_assignment?: { join_date?: string | null } | null;
}

export interface CrewListVessel {
  name: string;
  imo_number?: string | null;
  flag_state?: string | null;
  vessel_type?: string | null;
  gross_tonnage?: number | null;
}

export interface OfficialCrewListOptions {
  vessel: CrewListVessel;
  portOfArrival: string;
  dateOfArrival: string;
  lastPortOfCall?: string;
  masterName?: string;
  includeContractors: boolean;
  /** The day the list is for, when it is not the day it is made (T-306: a crew list as at a later day). */
  asAtDate?: string;
  /** A line under the list, e.g. what the list leaves out. */
  footnote?: string;
}

const dash = (value?: string | null) => (value && value.trim() !== '' ? value : '—');

const fmtDate = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : format(parsed, 'dd/MM/yyyy');
};

/**
 * Builds an official crew list in the IMO FAL Form 5 layout: vessel particulars
 * header, numbered list of persons on board with identity documents, and a
 * master's declaration footer.
 */
export const buildOfficialCrewListPdf = (
  people: readonly CrewListPerson[],
  options: OfficialCrewListOptions,
): jsPDF => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CREW LIST', pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    options.asAtDate ? `IMO FAL Form 5 · crew as at ${fmtDate(options.asAtDate)}` : 'IMO FAL Form 5',
    pageWidth / 2,
    54,
    { align: 'center' },
  );

  const particulars: string[][] = [
    ['Name of ship', dash(options.vessel.name), 'IMO number', dash(options.vessel.imo_number)],
    ['Flag State', dash(options.vessel.flag_state), 'Ship type', dash(options.vessel.vessel_type)],
    [
      'Port of arrival / departure',
      dash(options.portOfArrival),
      'Date',
      fmtDate(options.dateOfArrival),
    ],
    [
      'Last port of call',
      dash(options.lastPortOfCall),
      'Gross tonnage',
      options.vessel.gross_tonnage ? String(options.vessel.gross_tonnage) : '—',
    ],
  ];

  autoTable(doc, {
    startY: 66,
    body: particulars,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 4 },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 140 },
      2: { fontStyle: 'bold', cellWidth: 120 },
    },
  });

  const rows = people.map((person, index) => [
    String(index + 1),
    `${person.last_name ?? ''}, ${person.first_name ?? ''}`.replace(/^, |, $/g, ''),
    dash(person.rank ?? person.job_title),
    dash(person.nationality),
    fmtDate(person.date_of_birth),
    dash(person.place_of_birth),
    dash(person.passport_number),
    dash(person.passport_country ?? person.nationality),
    fmtDate(person.passport_expiry),
    dash(person.seamans_book_number),
    fmtDate(person.current_assignment?.join_date ?? person.contract_start_date),
    dash(person.embarkation_port),
    person.personnel_type === 'contractor' ? 'Contractor' : 'Crew',
  ]);

  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12,
    head: [[
      'No.',
      'Family name, given names',
      'Rank / rating',
      'Nationality',
      'Date of birth',
      'Place of birth',
      'Passport no.',
      'Issuing state',
      'Passport expiry',
      "Seaman's book",
      'Signed on',
      'Port of embarkation',
      'Status',
    ]],
    body: rows.length > 0 ? rows : [[{ content: 'No personnel on board for this vessel.', colSpan: 13 }]],
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [0, 102, 204], textColor: 255, fontSize: 7 },
    columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 120 } },
    didDrawPage: () => {
      const height = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(
        `Generated ${format(new Date(), 'dd MMM yyyy HH:mm')} — total persons listed: ${people.length}`,
        40,
        height - 18,
      );
      doc.setTextColor(0);
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const height = doc.internal.pageSize.getHeight();
  let declarationY = finalY + 30;
  if (options.footnote) {
    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(options.footnote, 40, finalY + 14, { maxWidth: pageWidth - 80 });
    doc.setTextColor(0);
    declarationY += 10;
  }
  if (declarationY > height - 90) {
    doc.addPage();
    declarationY = 60;
  }

  doc.setFontSize(8);
  doc.text(
    'I certify that the particulars given above are true and correct to the best of my knowledge.',
    40,
    declarationY,
  );
  doc.text(`Master: ${dash(options.masterName)}`, 40, declarationY + 26);
  doc.text('Signature: ______________________________', 300, declarationY + 26);
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, 620, declarationY + 26);

  // Page numbering must run after all pages exist.
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - 40, height - 18, { align: 'right' });
    doc.setTextColor(0);
  }

  return doc;
};

/** The crew list report's source key (an export that worked before the log, LEGACY_UNLOGGED_EXPORTS). */
export const CREW_LIST_EXPORT_SOURCE = 'crew.crew_list';

export type CrewListPdfResult = { status: 'ok'; fileName: string; logged: boolean } | { status: 'refused'; message: string };

/**
 * Log, then build and save the official crew list (gap/08 EX1, EX4; the
 * export engine's contract 9). The export is logged first with
 * `logClientExport` (kind register_pdf, personal data, the vessel and the
 * as-at day); while the log is not in the database (D-01) this export,
 * which worked before the log existed, still runs unlogged; any other
 * refusal stops it before anything is built. The file is named
 * `<VESSEL>_CrewList_<as-at day>_<made on>.pdf`.
 */
export async function downloadOfficialCrewList(
  people: readonly CrewListPerson[],
  options: OfficialCrewListOptions & { vesselId?: string | null; vesselCode?: string | null; now?: Date },
): Promise<CrewListPdfResult> {
  const asAt = options.asAtDate ?? options.dateOfArrival;
  let logged = false;
  try {
    const log = await logClientExport({
      kind: 'register_pdf',
      sourceKey: CREW_LIST_EXPORT_SOURCE,
      params: { as_at: asAt, include_contractors: options.includeContractors },
      containsPersonalData: true,
      rowCount: people.length,
      vesselId: options.vesselId ?? undefined,
    });
    if (log.status === 'refused') {
      return { status: 'refused', message: log.code === 'impersonating' ? EXPORT_COPY.impersonating : EXPORT_COPY.invalid };
    }
    if (log.status === 'missing' && !isLegacyUnloggedExport(CREW_LIST_EXPORT_SOURCE)) {
      return { status: 'refused', message: EXPORT_COPY.logMissingPersonal };
    }
    logged = log.status === 'ok';
  } catch (error) {
    const code = (error as { code?: unknown } | null)?.code;
    return { status: 'refused', message: code === '42501' ? EXPORT_COPY.accessDenied : EXPORT_COPY.logFailed };
  }
  try {
    const fileName = exportFileName({
      vesselCode: options.vesselCode,
      kind: 'Crew list',
      range: asAt ? { on: asAt } : null,
      ext: 'pdf',
      generatedOn: options.now,
    });
    buildOfficialCrewListPdf(people, options).save(fileName);
    return { status: 'ok', fileName, logged };
  } catch {
    return { status: 'refused', message: EXPORT_COPY.buildFailed };
  }
}

export const personnelToCsv = (people: CrewMember[]): string => {
  const headers = [
    'Last name', 'First name', 'Type', 'Rank / job title', 'Department', 'Vessel / office',
    'Nationality', 'Date of birth', 'Email', 'Phone', 'Status', 'Passport number',
    'Passport expiry', 'Contract start', 'Contract end',
  ];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = people.map((person) => [
    person.last_name,
    person.first_name,
    person.personnel_type ?? 'crew',
    person.rank ?? person.job_title ?? '',
    person.department ?? '',
    person.current_assignment?.vessel_name ?? person.office_location ?? '',
    person.nationality ?? '',
    person.date_of_birth ?? '',
    person.email ?? '',
    person.phone ?? '',
    person.status ?? '',
    person.passport_number ?? '',
    person.passport_expiry ?? '',
    person.contract_start_date ?? '',
    person.contract_end_date ?? '',
  ].map(escape).join(','));

  return [headers.join(','), ...lines].join('\n');
};
