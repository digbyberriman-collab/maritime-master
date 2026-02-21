import jsPDF from 'jspdf';
import ExcelJS from 'exceljs';
import { Document } from '@/modules/documents/hooks/useDocuments';
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

export const exportMDIToExcel = async (
  documents: ExportDocument[],
  companyName: string
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = new Date();
  
  const worksheet = workbook.addWorksheet('Master Document Index');

  // Set column headers and widths
  worksheet.columns = [
    { header: 'Document Number', key: 'docNumber', width: 20 },
    { header: 'Title', key: 'title', width: 50 },
    { header: 'Category', key: 'category', width: 15 },
    { header: 'Revision', key: 'revision', width: 10 },
    { header: 'Issue Date', key: 'issueDate', width: 12 },
    { header: 'Next Review Date', key: 'nextReviewDate', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Responsible Person', key: 'responsiblePerson', width: 25 },
    { header: 'Vessel', key: 'vessel', width: 20 },
  ];

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '3B82F6' }
  };
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };

  // Add data rows
  documents.forEach(doc => {
    worksheet.addRow({
      docNumber: doc.document_number,
      title: doc.title,
      category: doc.category?.name || '',
      revision: doc.revision,
      issueDate: doc.issue_date ? format(new Date(doc.issue_date), 'dd/MM/yyyy') : '',
      nextReviewDate: doc.next_review_date ? format(new Date(doc.next_review_date), 'dd/MM/yyyy') : '',
      status: doc.status.replace('_', ' '),
      responsiblePerson: doc.author ? `${doc.author.first_name} ${doc.author.last_name}` : '',
      vessel: doc.vessel?.name || 'All Vessels',
    });
  });

  // Generate and download file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Master_Document_Index_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
};
