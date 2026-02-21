import Papa from 'papaparse';

export interface CrewImportRow {
  first_name: string;
  last_name: string;
  email: string;
  phone_number?: string;
  rank?: string;
  position?: string;
  nationality?: string;
  vessel_assignment: string;
  join_date?: string;
  status?: string;
  rowNumber?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: CrewImportRow;
  rowNumber: number;
}

export interface ParseResult {
  results: ValidationResult[];
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
}

const ALLOWED_STATUSES = ['Active', 'Pending', 'On Leave', 'Invited', 'Inactive'];

// Generate CSV template
export const generateCSVTemplate = (): string => {
  const headers = [
    'first_name',
    'last_name', 
    'email',
    'phone_number',
    'rank',
    'position',
    'nationality',
    'vessel_assignment',
    'join_date',
    'status'
  ];
  
  const sampleRows = [
    ['John', 'Smith', 'john.smith@example.com', '+44 7700 900000', 'Chief Engineer', 'Chief Engineer', 'British', 'VESSEL_NAME_OR_IMO', '2025-01-15', 'Active'],
    ['Sarah', 'Johnson', 'sarah.j@example.com', '+1 555-0123', 'Bosun', 'Bosun', 'American', 'VESSEL_NAME_OR_IMO', '2025-02-01', 'Pending'],
    ['Maria', 'Garcia', 'maria.garcia@example.com', '', 'Stewardess', 'Chief Stewardess', 'Spanish', 'VESSEL_NAME_OR_IMO', '2025-01-20', 'Active'],
  ];
  
  const csvContent = [
    headers.join(','),
    ...sampleRows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  return csvContent;
};

// Download template as file
export const downloadCSVTemplate = () => {
  const template = generateCSVTemplate();
  const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'crew_import_template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Parse CSV file
export const parseCrewCSV = (file: File): Promise<ParseResult> => {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (results) => {
        const validationResults: ValidationResult[] = results.data.map((row: any, index: number) => 
          validateRow(row, index + 2) // +2 for header row + 0-index
        );
        
        const validRows = validationResults.filter(r => r.valid).length;
        const errorRows = validationResults.filter(r => !r.valid).length;
        const warningRows = validationResults.filter(r => r.warnings.length > 0).length;
        
        resolve({
          results: validationResults,
          totalRows: validationResults.length,
          validRows,
          errorRows,
          warningRows,
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      }
    });
  });
};

// Validate a single row
const validateRow = (row: any, rowNumber: number): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Handle full_name vs first_name/last_name
  let firstName = row.first_name?.trim() || '';
  let lastName = row.last_name?.trim() || '';

  if (row.full_name && !firstName && !lastName) {
    const parts = row.full_name.trim().split(' ');
    firstName = parts[0] || '';
    lastName = parts.slice(1).join(' ') || parts[0] || '';
  }

  // Required field validation
  if (!firstName) {
    errors.push('First name is required');
  }
  
  if (!lastName) {
    errors.push('Last name is required');
  }

  const email = row.email?.toLowerCase().trim() || '';
  if (!email) {
    errors.push('Email is required');
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.push('Invalid email format');
    }
  }

  const vesselAssignment = row.vessel_assignment?.trim() || '';
  if (!vesselAssignment) {
    errors.push('Vessel assignment is required');
  }

  const rank = row.rank?.trim() || '';
  const position = row.position?.trim() || '';
  if (!rank && !position) {
    errors.push('Either rank or position is required');
  }

  // Optional field validation
  const phoneNumber = row.phone_number?.trim() || '';
  if (phoneNumber) {
    const phoneRegex = /^[\d\s+()\-]+$/;
    if (!phoneRegex.test(phoneNumber)) {
      warnings.push('Phone number format may be invalid');
    }
  }

  const joinDate = row.join_date?.trim() || '';
  if (joinDate) {
    const date = new Date(joinDate);
    if (isNaN(date.getTime())) {
      errors.push('Invalid join date format (use YYYY-MM-DD)');
    } else if (date > new Date()) {
      warnings.push('Join date is in the future');
    }
  }

  const status = row.status?.trim() || 'Pending';
  if (status && !ALLOWED_STATUSES.some(s => s.toLowerCase() === status.toLowerCase())) {
    warnings.push(`Status should be one of: ${ALLOWED_STATUSES.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    rowNumber,
    data: {
      first_name: firstName,
      last_name: lastName,
      email,
      phone_number: phoneNumber || undefined,
      rank: rank || undefined,
      position: position || rank || undefined, // Use rank as position if position not specified
      nationality: row.nationality?.trim() || undefined,
      vessel_assignment: vesselAssignment,
      join_date: joinDate || new Date().toISOString().split('T')[0],
      status: ALLOWED_STATUSES.find(s => s.toLowerCase() === status.toLowerCase()) || 'Pending',
      rowNumber,
    }
  };
};

// Export error rows as CSV for user to fix
export const exportErrorRowsCSV = (results: ValidationResult[]): void => {
  const errorRows = results.filter(r => !r.valid);
  if (errorRows.length === 0) return;

  const headers = [
    'row_number',
    'errors',
    'first_name',
    'last_name',
    'email',
    'phone_number',
    'rank',
    'position',
    'nationality',
    'vessel_assignment',
    'join_date',
    'status'
  ];

  const rows = errorRows.map(r => [
    r.rowNumber,
    r.errors.join('; '),
    r.data.first_name,
    r.data.last_name,
    r.data.email,
    r.data.phone_number || '',
    r.data.rank || '',
    r.data.position || '',
    r.data.nationality || '',
    r.data.vessel_assignment,
    r.data.join_date || '',
    r.data.status || ''
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'crew_import_errors.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
