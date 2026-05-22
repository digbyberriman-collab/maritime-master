import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { format } from 'date-fns';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

export type ExportScope = 'all' | 'filtered' | 'selected';

export interface CrewExportRow {
  name: string;
  preferred_name: string;
  rank: string;
  department: string;
  vessel: string;
  status: string;
  cert_status: string;
  earliest_cert_expiry: string;
  medical_status: string;
  medical_expiry: string;
  nationality: string;
  email: string;
  phone: string;
  date_of_birth: string;
  cabin: string;
  rotation: string;
  contract_start_date: string;
  contract_end_date: string;
  passport_number: string;
  passport_expiry: string;
  visa_status: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
}

const toRow = (m: CrewMemberWithStatus): CrewExportRow => ({
  name: `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
  preferred_name: m.preferred_name ?? '',
  rank: m.rank ?? '',
  department: m.department ?? '',
  vessel: m.current_assignment?.vessel_name ?? '',
  status: m.account_status ?? m.status ?? '',
  cert_status: m.certStatus,
  earliest_cert_expiry: m.earliestCertExpiry ? format(m.earliestCertExpiry, 'yyyy-MM-dd') : '',
  medical_status: m.medicalStatus,
  medical_expiry: m.medical_expiry ?? '',
  nationality: m.nationality ?? '',
  email: m.email ?? '',
  phone: m.phone ?? '',
  date_of_birth: m.date_of_birth ?? '',
  cabin: m.cabin ?? '',
  rotation: m.rotation ?? '',
  contract_start_date: m.contract_start_date ?? '',
  contract_end_date: m.contract_end_date ?? '',
  passport_number: m.passport_number ?? '',
  passport_expiry: m.passport_expiry ?? '',
  visa_status: m.visa_status ?? '',
  emergency_contact_name: m.emergency_contact_name ?? '',
  emergency_contact_phone: m.emergency_contact_phone ?? '',
});

const fileBase = (scope: ExportScope) =>
  `crew_${scope}_${format(new Date(), 'yyyyMMdd-HHmm')}`;

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportCrewToCSV = (members: CrewMemberWithStatus[], scope: ExportScope) => {
  const rows = members.map(toRow);
  const csv = Papa.unparse(rows, { header: true });
  // UTF-8 BOM keeps Excel happy with diacritics in names/ranks.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `${fileBase(scope)}.csv`);
};

export const exportCrewToExcel = async (members: CrewMemberWithStatus[], scope: ExportScope) => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maritime Master';
  wb.created = new Date();

  const crewSheet = wb.addWorksheet('Crew');
  const rows = members.map(toRow);
  const headers: Array<{ key: keyof CrewExportRow; header: string; width: number }> = [
    { key: 'name', header: 'Name', width: 28 },
    { key: 'preferred_name', header: 'Preferred Name', width: 18 },
    { key: 'rank', header: 'Rank', width: 18 },
    { key: 'department', header: 'Department', width: 18 },
    { key: 'vessel', header: 'Vessel', width: 22 },
    { key: 'status', header: 'Status', width: 14 },
    { key: 'cert_status', header: 'Cert Status', width: 14 },
    { key: 'earliest_cert_expiry', header: 'Earliest Cert Expiry', width: 20 },
    { key: 'medical_status', header: 'Medical Status', width: 16 },
    { key: 'medical_expiry', header: 'Medical Expiry', width: 16 },
    { key: 'nationality', header: 'Nationality', width: 16 },
    { key: 'email', header: 'Email', width: 30 },
    { key: 'phone', header: 'Phone', width: 18 },
    { key: 'cabin', header: 'Cabin', width: 10 },
    { key: 'rotation', header: 'Rotation', width: 14 },
    { key: 'contract_start_date', header: 'Contract Start', width: 16 },
    { key: 'contract_end_date', header: 'Contract End', width: 16 },
    { key: 'passport_number', header: 'Passport #', width: 18 },
    { key: 'passport_expiry', header: 'Passport Expiry', width: 16 },
    { key: 'visa_status', header: 'Visa', width: 14 },
    { key: 'emergency_contact_name', header: 'Emergency Contact', width: 24 },
    { key: 'emergency_contact_phone', header: 'Emergency Phone', width: 18 },
  ];
  crewSheet.columns = headers.map((h) => ({ key: h.key, header: h.header, width: h.width }));
  crewSheet.views = [{ state: 'frozen', ySplit: 1 }];
  crewSheet.getRow(1).font = { bold: true };
  crewSheet.addRows(rows);

  const certSheet = wb.addWorksheet('Certificates');
  certSheet.columns = [
    { key: 'name', header: 'Crew Name', width: 28 },
    { key: 'rank', header: 'Rank', width: 18 },
    { key: 'vessel', header: 'Vessel', width: 22 },
    { key: 'certificate_type', header: 'Certificate', width: 30 },
    { key: 'expiry_date', header: 'Expiry', width: 16 },
    { key: 'status', header: 'Status', width: 14 },
  ];
  certSheet.views = [{ state: 'frozen', ySplit: 1 }];
  certSheet.getRow(1).font = { bold: true };
  for (const m of members) {
    const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim();
    const vessel = m.current_assignment?.vessel_name ?? '';
    for (const c of m.crew_certificates ?? []) {
      certSheet.addRow({
        name,
        rank: m.rank ?? '',
        vessel,
        certificate_type: c.certificate_type ?? '',
        expiry_date: c.expiry_date ?? '',
        status: c.status ?? '',
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${fileBase(scope)}.xlsx`);
};

export const exportCrewToPDF = async (
  members: CrewMemberWithStatus[],
  scope: ExportScope,
  opts: { companyName?: string } = {}
) => {
  // Lazy-load the heavy PDF libraries so the toolbar doesn't pay for them
  // until the user actually picks PDF.
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = (autoTableModule as { default: typeof import('jspdf-autotable').default }).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = format(new Date(), "yyyy-MM-dd HH:mm");

  doc.setFontSize(14);
  doc.text(opts.companyName ? `${opts.companyName} — Crew List` : 'Crew List', 40, 36);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${generatedAt} · ${members.length} crew · scope: ${scope}`, 40, 52);
  doc.setTextColor(0);

  const rows = members.map((m) => [
    `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
    m.rank ?? '',
    m.department ?? '',
    m.current_assignment?.vessel_name ?? '',
    m.account_status ?? m.status ?? '',
    m.certStatus,
    m.earliestCertExpiry ? format(m.earliestCertExpiry, 'yyyy-MM-dd') : '',
    m.medicalStatus,
    m.medical_expiry ?? '',
    m.contract_end_date ?? '',
  ]);

  autoTable(doc, {
    head: [['Name', 'Rank', 'Dept', 'Vessel', 'Status', 'Certs', 'Earliest Expiry', 'Medical', 'Med Exp', 'Contract End']],
    body: rows,
    startY: 64,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [40, 60, 80], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageNumber = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(140);
      doc.text(`Page ${pageNumber}`, pageWidth - 60, doc.internal.pageSize.getHeight() - 20);
      doc.setTextColor(0);
    },
  });

  doc.save(`${fileBase(scope)}.pdf`);
};
