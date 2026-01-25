import { useCallback } from 'react';
import { useBrandingContext } from '@/contexts/BrandingContext';
import { createPDFTemplate, type PDFTemplateOptions } from '@/lib/pdf';
import jsPDF from 'jspdf';

export interface UsePDFExportOptions {
  title: string;
  filename?: string;
  orientation?: 'portrait' | 'landscape';
}

/**
 * Hook for creating branded PDF exports with STORM + client branding
 * and persistent Inkfish watermark
 */
export const usePDFExport = () => {
  const { clientDisplayName, clientLogoUrl, brandColor } = useBrandingContext();

  /**
   * Creates a new PDF document with branding applied
   */
  const createPDF = useCallback((options: UsePDFExportOptions): jsPDF => {
    const templateOptions: PDFTemplateOptions = {
      title: options.title,
      orientation: options.orientation,
      branding: {
        clientDisplayName,
        clientLogoUrl,
        brandColor,
      },
    };
    
    return createPDFTemplate(templateOptions);
  }, [clientDisplayName, clientLogoUrl, brandColor]);

  /**
   * Downloads a PDF document
   */
  const downloadPDF = useCallback((doc: jsPDF, filename: string) => {
    // Ensure filename ends with .pdf
    const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    doc.save(finalFilename);
  }, []);

  /**
   * Creates and downloads a simple PDF with just a title
   */
  const exportSimplePDF = useCallback((options: UsePDFExportOptions) => {
    const doc = createPDF(options);
    const filename = options.filename || `STORM_${options.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    downloadPDF(doc, filename);
  }, [createPDF, downloadPDF]);

  return {
    createPDF,
    downloadPDF,
    exportSimplePDF,
  };
};
