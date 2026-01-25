import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { Document } from '@/hooks/useDocuments';
import { format } from 'date-fns';

interface ExportDocument {
  document_number: string;
  title: string;
  category?: { name: string } | null;
  revision: string;
  issue_date?: string | null;
  next_review_date?: string | null;
  status: string;
  author?: { first_name: string; last_name: string } | null;
  vessel?: { name: string } | null;
}

export const exportMDIToPDF = (
  documents: ExportDocument[],
  companyName: string,
  filters: { vessel?: string; status?: string; category?: string }
) => {
  const doc = new jsPDF('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Master Document Index', margin, yPos);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(companyName, pageWidth - margin, yPos, { align: 'right' });
  
  yPos += 10;
  doc.setFontSize(9);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, margin, yPos);
  doc.text(`Total Documents: ${documents.length}`, pageWidth - margin, yPos, { align: 'right' });

  // Filters applied
  if (filters.vessel || filters.status || filters.category) {
    yPos += 6;
    const filterText = [
      filters.vessel && `Vessel: ${filters.vessel}`,
      filters.status && `Status: ${filters.status}`,
      filters.category && `Category: ${filters.category}`,
    ].filter(Boolean).join(' | ');
    doc.text(`Filters: ${filterText}`, margin, yPos);
  }

  yPos += 10;

  // Table headers
  const columns = [
    { header: 'Doc Number', width: 35 },
    { header: 'Title', width: 70 },
    { header: 'Category', width: 30 },
    { header: 'Rev', width: 15 },
    { header: 'Issue Date', width: 25 },
    { header: 'Next Review', width: 25 },
    { header: 'Status', width: 25 },
    { header: 'Owner', width: 40 },
    { header: 'Vessel', width: 30 },
  ];

  // Draw header row
  doc.setFillColor(59, 130, 246);
  doc.rect(margin, yPos, pageWidth - margin * 2, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  let xPos = margin + 2;
  columns.forEach(col => {
    doc.text(col.header, xPos, yPos + 5.5);
    xPos += col.width;
  });

  yPos += 10;
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');

  // Draw rows
  documents.forEach((document, index) => {
    // Check if new page needed
    if (yPos > pageHeight - 25) {
      doc.addPage();
      yPos = margin;

      // Redraw header on new page
      doc.setFillColor(59, 130, 246);
      doc.rect(margin, yPos, pageWidth - margin * 2, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      xPos = margin + 2;
      columns.forEach(col => {
        doc.text(col.header, xPos, yPos + 5.5);
        xPos += col.width;
      });
      yPos += 10;
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', 'normal');
    }

    // Alternate row background
    if (index % 2 === 0) {
      doc.setFillColor(245, 247, 250);
      doc.rect(margin, yPos - 1, pageWidth - margin * 2, 7, 'F');
    }

    xPos = margin + 2;
    const rowData = [
      document.document_number,
      document.title.length > 40 ? document.title.substring(0, 37) + '...' : document.title,
      document.category?.name || '-',
      document.revision,
      document.issue_date ? format(new Date(document.issue_date), 'dd/MM/yy') : '-',
      document.next_review_date ? format(new Date(document.next_review_date), 'dd/MM/yy') : '-',
      document.status.replace('_', ' '),
      document.author ? `${document.author.first_name} ${document.author.last_name}` : '-',
      document.vessel?.name || 'All',
    ];

    doc.setFontSize(7);
    columns.forEach((col, i) => {
      doc.text(rowData[i], xPos, yPos + 4);
      xPos += col.width;
    });

    yPos += 7;
  });

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  doc.save(`Master_Document_Index_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
};

export const exportMDIToExcel = (
  documents: ExportDocument[],
  companyName: string
) => {
  const worksheetData = documents.map(doc => ({
    'Document Number': doc.document_number,
    'Title': doc.title,
    'Category': doc.category?.name || '',
    'Revision': doc.revision,
    'Issue Date': doc.issue_date ? format(new Date(doc.issue_date), 'dd/MM/yyyy') : '',
    'Next Review Date': doc.next_review_date ? format(new Date(doc.next_review_date), 'dd/MM/yyyy') : '',
    'Status': doc.status.replace('_', ' '),
    'Responsible Person': doc.author ? `${doc.author.first_name} ${doc.author.last_name}` : '',
    'Vessel': doc.vessel?.name || 'All Vessels',
  }));

  const worksheet = XLSX.utils.json_to_sheet(worksheetData);
  const workbook = XLSX.utils.book_new();

  // Set column widths
  worksheet['!cols'] = [
    { wch: 20 },
    { wch: 50 },
    { wch: 15 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 12 },
    { wch: 25 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Master Document Index');
  XLSX.writeFile(workbook, `Master_Document_Index_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
};
