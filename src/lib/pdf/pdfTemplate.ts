import jsPDF from 'jspdf';

export interface PDFBranding {
  clientDisplayName?: string | null;
  clientLogoUrl?: string | null;
  brandColor?: string | null;
}

export interface PDFTemplateOptions {
  title: string;
  branding?: PDFBranding;
  orientation?: 'portrait' | 'landscape';
}

const DEFAULT_BRAND_COLOR = '#1e3a8a';

/**
 * Creates a new PDF document with STORM + client branding header
 * and Inkfish ownership watermark in footer
 */
export const createPDFTemplate = (options: PDFTemplateOptions): jsPDF => {
  const { title, branding, orientation = 'portrait' } = options;
  
  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  // Add header with branding
  addHeader(doc, title, branding, pageWidth, margin);
  
  // Add footer with Inkfish watermark (will be called on each page)
  addFooter(doc, pageWidth, pageHeight, margin);
  
  return doc;
};

/**
 * Adds branded header to PDF
 */
const addHeader = (
  doc: jsPDF, 
  title: string, 
  branding: PDFBranding | undefined,
  pageWidth: number,
  margin: number
) => {
  const brandColor = branding?.brandColor || DEFAULT_BRAND_COLOR;
  
  // STORM logo text (left side)
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(brandColor);
  doc.text('STORM', margin, 15);
  
  // Client logo placeholder (right side) - if client logo exists
  if (branding?.clientLogoUrl) {
    // Note: For actual logo images, you'd need to convert to base64 first
    // This is a placeholder for the logo position
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#6b7280');
    doc.text('[Client Logo]', pageWidth - margin, 15, { align: 'right' });
  }
  
  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor('#111827');
  doc.text(title, margin, 28);
  
  // "Prepared for" line if client name exists
  if (branding?.clientDisplayName) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor('#6b7280');
    doc.text(`Prepared for: ${branding.clientDisplayName}`, margin, 35);
  }
  
  // Separator line
  const lineY = branding?.clientDisplayName ? 40 : 33;
  doc.setDrawColor('#e5e7eb');
  doc.setLineWidth(0.5);
  doc.line(margin, lineY, pageWidth - margin, lineY);
};

/**
 * Adds Inkfish ownership watermark to footer
 * This is persistent and cannot be removed by client branding settings
 */
const addFooter = (
  doc: jsPDF,
  pageWidth: number,
  pageHeight: number,
  margin: number
) => {
  const footerY = pageHeight - 10;
  
  // Inkfish watermark (bottom right)
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor('#9ca3af'); // Light gray
  doc.text('Powered by Inkfish', pageWidth - margin, footerY, { align: 'right' });
  
  // Page number (bottom center) - will need to be updated for multi-page docs
  doc.setTextColor('#9ca3af');
  doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageWidth / 2, footerY, { align: 'center' });
  
  // Date (bottom left)
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  doc.text(today, margin, footerY);
};

/**
 * Adds a new page with consistent footer
 */
export const addPageWithFooter = (doc: jsPDF) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  
  doc.addPage();
  addFooter(doc, pageWidth, pageHeight, margin);
};

/**
 * Gets the content area Y position (after header)
 */
export const getContentStartY = (hasClientName: boolean): number => {
  return hasClientName ? 48 : 41;
};

/**
 * Gets the content area end Y position (before footer)
 */
export const getContentEndY = (doc: jsPDF): number => {
  return doc.internal.pageSize.getHeight() - 20;
};
