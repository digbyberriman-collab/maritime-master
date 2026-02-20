import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateCSVTemplate, parseCrewCSV, exportErrorRowsCSV } from '@/lib/csvParser';
import type { ValidationResult } from '@/lib/csvParser';

describe('csvParser', () => {
  describe('generateCSVTemplate', () => {
    it('should return a string with correct headers', () => {
      const template = generateCSVTemplate();
      const lines = template.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('first_name');
      expect(headers).toContain('last_name');
      expect(headers).toContain('email');
      expect(headers).toContain('phone_number');
      expect(headers).toContain('rank');
      expect(headers).toContain('position');
      expect(headers).toContain('nationality');
      expect(headers).toContain('vessel_assignment');
      expect(headers).toContain('join_date');
      expect(headers).toContain('status');
    });

    it('should include sample data rows', () => {
      const template = generateCSVTemplate();
      const lines = template.split('\n');

      // Header + 3 sample rows
      expect(lines.length).toBe(4);
    });

    it('should quote sample data values', () => {
      const template = generateCSVTemplate();
      expect(template).toContain('"John"');
      expect(template).toContain('"Smith"');
      expect(template).toContain('"john.smith@example.com"');
    });
  });

  describe('parseCrewCSV', () => {
    function createCSVFile(content: string): File {
      return new File([content], 'crew.csv', { type: 'text/csv' });
    }

    it('should parse a valid CSV file', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.totalRows).toBe(1);
      expect(result.validRows).toBe(1);
      expect(result.errorRows).toBe(0);
      expect(result.results[0].valid).toBe(true);
      expect(result.results[0].data.first_name).toBe('John');
      expect(result.results[0].data.last_name).toBe('Smith');
      expect(result.results[0].data.email).toBe('john@example.com');
    });

    it('should report errors for missing required fields', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
,,,, `;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.errorRows).toBe(1);
      expect(result.results[0].valid).toBe(false);
      expect(result.results[0].errors).toContain('First name is required');
      expect(result.results[0].errors).toContain('Last name is required');
      expect(result.results[0].errors).toContain('Email is required');
      expect(result.results[0].errors).toContain('Vessel assignment is required');
    });

    it('should validate email format', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,invalid-email,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].errors).toContain('Invalid email format');
    });

    it('should accept valid email formats', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john.smith@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].valid).toBe(true);
    });

    it('should warn on invalid phone number format', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,phone_number
John,Smith,john@example.com,Vessel A,Captain,abc-invalid`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].warnings).toContain('Phone number format may be invalid');
    });

    it('should accept valid phone numbers', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,phone_number
John,Smith,john@example.com,Vessel A,Captain,+44 7700 900000`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].warnings.filter(w => w.includes('Phone'))).toHaveLength(0);
    });

    it('should error on invalid join date', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,join_date
John,Smith,john@example.com,Vessel A,Captain,not-a-date`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].errors).toContain('Invalid join date format (use YYYY-MM-DD)');
    });

    it('should warn on future join date', async () => {
      const futureDate = '2099-12-31';
      const csv = `first_name,last_name,email,vessel_assignment,rank,join_date
John,Smith,john@example.com,Vessel A,Captain,${futureDate}`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].warnings).toContain('Join date is in the future');
    });

    it('should warn on invalid status', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,status
John,Smith,john@example.com,Vessel A,Captain,InvalidStatus`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].warnings.some(w => w.includes('Status should be one of'))).toBe(true);
    });

    it('should accept all valid statuses', async () => {
      const statuses = ['Active', 'Pending', 'On Leave', 'Invited', 'Inactive'];

      for (const status of statuses) {
        const csv = `first_name,last_name,email,vessel_assignment,rank,status
John,Smith,john@example.com,Vessel A,Captain,${status}`;

        const result = await parseCrewCSV(createCSVFile(csv));
        expect(result.results[0].warnings.filter(w => w.includes('Status'))).toHaveLength(0);
      }
    });

    it('should require either rank or position', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,position
John,Smith,john@example.com,Vessel A,,`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].errors).toContain('Either rank or position is required');
    });

    it('should accept rank without position', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank,position
John,Smith,john@example.com,Vessel A,Captain,`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].errors.filter(e => e.includes('rank or position'))).toHaveLength(0);
    });

    it('should handle full_name fallback when first_name/last_name are missing', async () => {
      const csv = `full_name,email,vessel_assignment,rank
John Smith,john@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].data.first_name).toBe('John');
      expect(result.results[0].data.last_name).toBe('Smith');
    });

    it('should parse multiple rows correctly', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john@example.com,Vessel A,Captain
Jane,Doe,jane@example.com,Vessel B,Officer`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(2);
    });

    it('should normalize header names (trim, lowercase, replace spaces)', async () => {
      const csv = `First Name,Last Name,Email,Vessel Assignment,Rank
John,Smith,john@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].data.first_name).toBe('John');
      expect(result.results[0].data.last_name).toBe('Smith');
    });

    it('should set row numbers correctly (starting from 2 for header offset)', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john@example.com,Vessel A,Captain
Jane,Doe,jane@example.com,Vessel B,Officer`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].rowNumber).toBe(2);
      expect(result.results[1].rowNumber).toBe(3);
    });

    it('should default status to Pending when not provided', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].data.status).toBe('Pending');
    });

    it('should use rank as position when position is not specified', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,john@example.com,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].data.position).toBe('Captain');
    });

    it('should lowercase email addresses', async () => {
      const csv = `first_name,last_name,email,vessel_assignment,rank
John,Smith,JOHN@EXAMPLE.COM,Vessel A,Captain`;

      const result = await parseCrewCSV(createCSVFile(csv));

      expect(result.results[0].data.email).toBe('john@example.com');
    });
  });

  describe('exportErrorRowsCSV', () => {
    let createElementSpy: ReturnType<typeof vi.spyOn>;
    let mockLink: { href: string; download: string; click: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      mockLink = { href: '', download: '', click: vi.fn() };
      createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);
      // jsdom does not have URL.createObjectURL, so stub it globally
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    it('should not create a download if there are no error rows', () => {
      const results: ValidationResult[] = [
        { valid: true, errors: [], warnings: [], data: {} as any, rowNumber: 2 },
      ];

      exportErrorRowsCSV(results);

      expect(createElementSpy).not.toHaveBeenCalled();
    });

    it('should create a CSV download for error rows', () => {
      const results: ValidationResult[] = [
        {
          valid: false,
          errors: ['First name is required'],
          warnings: [],
          data: {
            first_name: '',
            last_name: 'Smith',
            email: 'john@example.com',
            vessel_assignment: 'Vessel A',
          } as any,
          rowNumber: 2,
        },
      ];

      exportErrorRowsCSV(results);

      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.download).toBe('crew_import_errors.csv');
    });
  });
});
