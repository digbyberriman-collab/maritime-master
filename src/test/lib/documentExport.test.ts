import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jsPDF
const mockSave = vi.fn();
const mockText = vi.fn();
const mockSetFontSize = vi.fn();
const mockSetFont = vi.fn();
const mockSetFillColor = vi.fn();
const mockSetTextColor = vi.fn();
const mockRect = vi.fn();
const mockAddPage = vi.fn();
const mockSetPage = vi.fn();
const mockGetNumberOfPages = vi.fn().mockReturnValue(1);

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
    text: mockText,
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    setFillColor: mockSetFillColor,
    setTextColor: mockSetTextColor,
    rect: mockRect,
    addPage: mockAddPage,
    setPage: mockSetPage,
    getNumberOfPages: mockGetNumberOfPages,
    save: mockSave,
  })),
}));

// Mock ExcelJS
const mockAddRow = vi.fn();
const mockGetRow = vi.fn().mockReturnValue({
  font: {},
  fill: {},
});
const mockWriteBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(10));
const mockAddWorksheet = vi.fn().mockReturnValue({
  columns: [],
  addRow: mockAddRow,
  getRow: mockGetRow,
});

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn().mockImplementation(() => ({
      creator: '',
      created: null,
      addWorksheet: mockAddWorksheet,
      xlsx: { writeBuffer: mockWriteBuffer },
    })),
  },
}));

// Mock DOM APIs for download
vi.stubGlobal('URL', {
  createObjectURL: vi.fn().mockReturnValue('blob:test'),
  revokeObjectURL: vi.fn(),
});

const mockClick = vi.fn();
vi.spyOn(document, 'createElement').mockReturnValue({
  href: '',
  download: '',
  click: mockClick,
} as any);

import { exportMDIToPDF, exportMDIToExcel } from '@/lib/documentExport';

const sampleDocuments = [
  {
    document_number: 'DOC-001',
    title: 'Safety Management Manual',
    category: { name: 'SMS' },
    revision: '3.0',
    issue_date: '2025-01-15',
    next_review_date: '2026-01-15',
    status: 'approved',
    author: { first_name: 'John', last_name: 'Smith' },
    vessel: { name: 'MV Oceanus' },
  },
  {
    document_number: 'DOC-002',
    title: 'Emergency Response Plan',
    category: null,
    revision: '1.0',
    issue_date: null,
    next_review_date: null,
    status: 'draft',
    author: null,
    vessel: null,
  },
];

describe('documentExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportMDIToPDF', () => {
    it('should create a PDF and save it', () => {
      exportMDIToPDF(sampleDocuments, 'Test Company', {});

      expect(mockSave).toHaveBeenCalledTimes(1);
      expect(mockSave.mock.calls[0][0]).toMatch(/^Master_Document_Index_\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    it('should include company name in PDF', () => {
      exportMDIToPDF(sampleDocuments, 'Maritime Corp', {});

      expect(mockText).toHaveBeenCalledWith(
        'Maritime Corp',
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'right' })
      );
    });

    it('should include Master Document Index title', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {});

      expect(mockText).toHaveBeenCalledWith(
        'Master Document Index',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('should include document count', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {});

      expect(mockText).toHaveBeenCalledWith(
        `Total Documents: ${sampleDocuments.length}`,
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ align: 'right' })
      );
    });

    it('should include filter text when filters are provided', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {
        vessel: 'MV Oceanus',
        status: 'approved',
      });

      const filterCalls = mockText.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('Filters:')
      );
      expect(filterCalls.length).toBe(1);
      expect(filterCalls[0][0]).toContain('Vessel: MV Oceanus');
      expect(filterCalls[0][0]).toContain('Status: approved');
    });

    it('should not include filter text when no filters', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {});

      const filterCalls = mockText.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('Filters:')
      );
      expect(filterCalls.length).toBe(0);
    });

    it('should draw table headers', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {});

      // Should draw header background
      expect(mockSetFillColor).toHaveBeenCalledWith(59, 130, 246);
      // Should render header text
      const headerTexts = mockText.mock.calls.map((c: any[]) => c[0]);
      expect(headerTexts).toContain('Doc Number');
      expect(headerTexts).toContain('Title');
      expect(headerTexts).toContain('Status');
    });

    it('should handle empty documents array', () => {
      exportMDIToPDF([], 'Test', {});

      expect(mockSave).toHaveBeenCalledTimes(1);
    });

    it('should truncate long titles', () => {
      const longTitleDoc = [{
        ...sampleDocuments[0],
        title: 'A'.repeat(50),
      }];

      exportMDIToPDF(longTitleDoc, 'Test', {});

      const titleCalls = mockText.mock.calls.find(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('...')
      );
      expect(titleCalls).toBeDefined();
    });

    it('should handle null optional fields gracefully', () => {
      exportMDIToPDF([sampleDocuments[1]], 'Test', {});

      // Should render "-" or "All" for null fields
      const textCalls = mockText.mock.calls.map((c: any[]) => c[0]);
      expect(textCalls).toContain('-');
    });

    it('should add page numbers', () => {
      exportMDIToPDF(sampleDocuments, 'Test', {});

      expect(mockSetPage).toHaveBeenCalled();
      const pageNumCalls = mockText.mock.calls.filter(
        (call: any[]) => typeof call[0] === 'string' && call[0].includes('Page ')
      );
      expect(pageNumCalls.length).toBeGreaterThan(0);
    });
  });

  describe('exportMDIToExcel', () => {
    it('should create a workbook with correct worksheet name', async () => {
      await exportMDIToExcel(sampleDocuments, 'Test Company');

      expect(mockAddWorksheet).toHaveBeenCalledWith('Master Document Index');
    });

    it('should add data rows for each document', async () => {
      await exportMDIToExcel(sampleDocuments, 'Test Company');

      expect(mockAddRow).toHaveBeenCalledTimes(sampleDocuments.length);
    });

    it('should style the header row', async () => {
      await exportMDIToExcel(sampleDocuments, 'Test Company');

      expect(mockGetRow).toHaveBeenCalledWith(1);
    });

    it('should generate the file and trigger download', async () => {
      await exportMDIToExcel(sampleDocuments, 'Test Company');

      expect(mockWriteBuffer).toHaveBeenCalled();
      expect(mockClick).toHaveBeenCalled();
    });

    it('should include correct data in rows', async () => {
      await exportMDIToExcel(sampleDocuments, 'Test Company');

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          docNumber: 'DOC-001',
          title: 'Safety Management Manual',
          category: 'SMS',
          revision: '3.0',
        })
      );
    });

    it('should handle null fields with defaults', async () => {
      await exportMDIToExcel([sampleDocuments[1]], 'Test Company');

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          category: '',
          responsiblePerson: '',
          vessel: 'All Vessels',
        })
      );
    });

    it('should format status by replacing underscores', async () => {
      const doc = { ...sampleDocuments[0], status: 'under_review' };
      await exportMDIToExcel([doc], 'Test');

      expect(mockAddRow).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'under review',
        })
      );
    });
  });
});
