import { describe, expect, it } from 'vitest';
import { csvEscape, exportFilename, REQUEST_CSV_HEADERS, requestsToCsv, toCsv } from './export';
import type { LegalRequestRow } from './requests';

describe('csv', () => {
  it('escapes quotes, commas and newlines', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line\nbreak')).toBe('"line\nbreak"');
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(12.5)).toBe('12.5');
  });

  it('joins rows with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [null, 'y,z']])).toBe('a,b\r\n1,x\r\n,"y,z"');
  });

  it('exports requests with resolved names', () => {
    const row: LegalRequestRow = {
      id: 'r1',
      reference_number: 'LEG-2026-007',
      company_id: 'co',
      submitted_by: 'u1',
      request_type: 'contract_review',
      priority: 'high',
      status: 'completed',
      risk_level: 'low',
      title: 'Charter, Med season',
      description: null,
      counterparty: 'Blue Water',
      contract_value: 1500,
      currency: 'EUR',
      jurisdiction: 'Cayman Islands',
      requested_deadline: '2026-09-30',
      sla_deadline: '2026-09-18T10:00:00.000Z',
      assigned_to: 'l1',
      requester_department: 'Deck',
      vessel_id: 'v1',
      incident_id: null,
      cfm_employee_id: null,
      profile_id: null,
      tags: ['charter', 'med'],
      attachments: [],
      resolution_summary: null,
      resolved_at: '2026-09-17T10:00:00.000Z',
      source_id: null,
      created_at: '2026-09-16T10:00:00.000Z',
      updated_at: '2026-09-17T10:00:00.000Z',
    };
    const csv = requestsToCsv([row], { nameFor: (id) => (id === 'u1' ? 'Sam Crew' : id === 'l1' ? 'Lee Legal' : ''), vesselName: () => 'Draak' });
    const [header, line] = csv.split('\r\n');
    expect(header.split(',')).toEqual(REQUEST_CSV_HEADERS);
    expect(line).toBe(
      'LEG-2026-007,"Charter, Med season",Service Agreement,Completed,High,Low risk,Sam Crew,Deck,Lee Legal,Draak,Blue Water,1500,EUR,Cayman Islands,2026-09-30,2026-09-18T10:00:00.000Z,SLA met,2026-09-16T10:00:00.000Z,2026-09-17T10:00:00.000Z,charter; med',
    );
  });

  it('builds dated filenames', () => {
    expect(exportFilename('legal-requests', 'csv', new Date('2026-09-16T12:00:00.000Z'))).toBe('legal-requests-2026-09-16.csv');
  });
});
