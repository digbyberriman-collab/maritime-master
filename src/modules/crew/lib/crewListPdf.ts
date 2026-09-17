import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

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
  people: CrewMember[],
  options: OfficialCrewListOptions,
): jsPDF => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('CREW LIST', pageWidth / 2, 40, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('IMO FAL Form 5', pageWidth / 2, 54, { align: 'center' });

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
