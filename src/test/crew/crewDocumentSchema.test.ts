/**
 * The crew document form rules (X1-04; gap/04 C24, C25, C26): the schema per
 * type (the field schema, the passport rules, expiry after issue, the "No
 * expiry" tick clearing the date, one of the two required), the payload
 * (the type's fields only; changed fields only on an edit; the tick and the
 * date together), the file, the default validity suggestion, the refusal
 * mapper, and the rules the server shares (pinned in the migration).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOGUE_MISSING_NOTICE,
  DOCUMENT_FIELD_LABEL,
  SAVE_UNAVAILABLE_NOTICE,
  allowedPayloadFields,
  buildCrewDocumentSchema,
  crewDocumentRefusal,
  documentFormDefaults,
  documentFormFields,
  emptyDocumentValues,
  suggestedExpiryDate,
  toDocumentPayload,
  withDocumentFile,
  type CrewDocumentFormValues,
  type DocumentTypeForForm,
} from '@/modules/crew/lib/crewDocumentSchema';

const TODAY = '2026-11-26';
const PASSPORT: DocumentTypeForForm = { name: 'Passport', expiry_item_type: 'passport', field_schema: { issuing_office: 'optional' }, default_validity_months: 120 };
const PST: DocumentTypeForForm = { name: 'Personal survival techniques', expiry_item_type: 'crew_qualification', field_schema: { issuing_office: 'optional' }, default_validity_months: 60 };
const COC: DocumentTypeForForm = {
  name: 'Master (yachts under 3000 GT)',
  expiry_item_type: 'crew_qualification',
  field_schema: { capacity: 'required', limitations: 'optional', issuing_office: 'optional' },
};
const VISA: DocumentTypeForForm = { name: 'Visa', expiry_item_type: 'visa', field_schema: { visa_type: 'required', entries: 'optional', issuing_office: 'optional' } };
const FLAG: DocumentTypeForForm = {
  name: 'Flag state endorsement',
  expiry_item_type: 'crew_qualification',
  field_schema: { capacity: 'required', limitations: 'optional', endorsement_date: 'optional', issuing_office: 'optional' },
};

const values = (over: Partial<CrewDocumentFormValues>): CrewDocumentFormValues => ({ ...emptyDocumentValues(), ...over });
const parse = (type: DocumentTypeForForm, over: Partial<CrewDocumentFormValues>) => buildCrewDocumentSchema(type, { today: TODAY }).safeParse(values(over));
const issues = (type: DocumentTypeForForm, over: Partial<CrewDocumentFormValues>) => {
  const r = parse(type, over);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('the fields a type shows', () => {
  it('core fields, the type\'s extra fields in order, the crew-report flag for a passport only', () => {
    expect(documentFormFields(PASSPORT).map((f) => `${f.field}${f.required ? '!' : ''}`)).toEqual([
      'number', 'issuing_country_code!', 'issuing_office', 'issue_date!', 'expiry_date', 'no_expiry', 'use_in_crew_report', 'notes',
    ]);
    expect(documentFormFields(COC).map((f) => `${f.field}${f.required ? '!' : ''}`)).toEqual([
      'number', 'issuing_country_code', 'issuing_office', 'issue_date', 'expiry_date', 'no_expiry', 'capacity!', 'limitations', 'notes',
    ]);
    expect(documentFormFields(FLAG).map((f) => f.field)).toContain('endorsement_due_date');
    expect(allowedPayloadFields(PST).has('capacity')).toBe(false);
    expect(allowedPayloadFields(PST).has('use_in_crew_report')).toBe(false);
    for (const f of documentFormFields(VISA)) expect(DOCUMENT_FIELD_LABEL[f.field]).toBeTruthy();
  });

  it('reads a stored field schema and ignores what it does not know', () => {
    const odd: DocumentTypeForForm = { name: 'x', expiry_item_type: 'crew_document', field_schema: { colour: 'required', grade: 'optional' } };
    expect(documentFormFields(odd).map((f) => f.field)).toEqual(['number', 'issuing_country_code', 'issue_date', 'expiry_date', 'no_expiry', 'grade', 'notes']);
    expect(documentFormFields({ ...odd, field_schema: null }).map((f) => f.field)).not.toContain('grade');
  });
});

describe('the schema', () => {
  it('a valid certificate: trimmed, blank is null', () => {
    const r = parse(PST, { number: '  PST-1 ', issue_date: '2024-01-10', expiry_date: '2029-01-10', issuing_office: ' ', notes: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toMatchObject({ number: 'PST-1', issue_date: '2024-01-10', expiry_date: '2029-01-10', issuing_office: null, notes: null, no_expiry: false });
  });

  it('an expiry date or the No expiry tick is required (D-31: never a silent missing date)', () => {
    expect(issues(PST, {})).toMatchObject({ expiry_date: 'Enter the expiry date, or tick No expiry.' });
    expect(parse(PST, { no_expiry: true }).success).toBe(true);
  });

  it('the tick clears the expiry date', () => {
    const ok = parse(PST, { no_expiry: true, expiry_date: '2029-01-10' });
    expect(ok.success && ok.data.expiry_date).toBeNull();
    // The cleared date is not compared with the issue date either.
    expect(issues(PST, { no_expiry: true, expiry_date: '2020-01-10', issue_date: '2024-01-01' })).toEqual({});
  });

  it('expiry not before issue; issue not in the future; real dates only', () => {
    expect(issues(PST, { issue_date: '2025-05-01', expiry_date: '2025-04-30' })).toMatchObject({ expiry_date: 'The expiry date cannot be before the issue date.' });
    expect(parse(PST, { issue_date: '2025-05-01', expiry_date: '2025-05-01' }).success).toBe(true);
    expect(issues(PST, { issue_date: '2026-11-27', expiry_date: '2030-01-01' })).toMatchObject({ issue_date: 'The issue date cannot be in the future.' });
    expect(parse(PST, { issue_date: TODAY, expiry_date: '2030-01-01' }).success).toBe(true);
    expect(issues(PST, { issue_date: '2026-02-30', expiry_date: '2030-01-01' })).toMatchObject({ issue_date: 'Enter a valid date' });
    expect(issues(PST, { issue_date: '1899-12-31', expiry_date: '2030-01-01' })).toMatchObject({ issue_date: 'Check the issue date.' });
  });

  it('a passport needs its issuing country and issue date (C26)', () => {
    expect(issues(PASSPORT, { expiry_date: '2034-01-01' })).toMatchObject({
      issuing_country_code: 'Enter the issuing country.',
      issue_date: 'Enter the issue date.',
    });
    const r = parse(PASSPORT, { issuing_country_code: ' gb ', issue_date: '2024-01-01', expiry_date: '2034-01-01', use_in_crew_report: true });
    expect(r.success && r.data).toMatchObject({ issuing_country_code: 'GB', use_in_crew_report: true });
    expect(issues(PASSPORT, { issuing_country_code: 'GBR', issue_date: '2024-01-01', expiry_date: '2034-01-01' })).toMatchObject({
      issuing_country_code: 'Choose the issuing country from the list.',
    });
  });

  it('only a passport can be the crew-report one', () => {
    expect(issues(PST, { expiry_date: '2030-01-01', use_in_crew_report: true })).toMatchObject({ use_in_crew_report: 'Only a passport can be used in the crew report.' });
  });

  it('the type\'s required fields, lengths and entries', () => {
    expect(issues(COC, { expiry_date: '2030-01-01' })).toMatchObject({ capacity: 'Enter the capacity.' });
    expect(parse(COC, { expiry_date: '2030-01-01', capacity: 'Master' }).success).toBe(true);
    expect(issues(VISA, { expiry_date: '2030-01-01' })).toMatchObject({ visa_type: 'Enter the visa type.' });
    expect(issues(VISA, { expiry_date: '2030-01-01', visa_type: 'C', entries: 'triple' as never })).toHaveProperty('entries');
    expect(parse(VISA, { expiry_date: '2030-01-01', visa_type: 'C', entries: 'multiple' }).success).toBe(true);
    expect(issues(PST, { expiry_date: '2030-01-01', number: 'x'.repeat(61) })).toHaveProperty('number');
    expect(issues(PST, { expiry_date: '2030-01-01', notes: 'x'.repeat(2001) })).toHaveProperty('notes');
    expect(issues(COC, { expiry_date: '2030-01-01', capacity: 'Master', limitations: 'x'.repeat(501) })).toHaveProperty('limitations');
  });

  it('the rules are the server\'s (crew_document_save)', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261124060400_crew_document_catalogue.sql'), 'utf8');
    for (const sentence of [
      'Enter the expiry date, or tick No expiry.',
      'The expiry date cannot be before the issue date.',
      'The issue date cannot be in the future.',
      'Enter the issuing country.',
      'Enter the issue date.',
      'Only a passport can be used in the crew report.',
      'Choose the issuing country from the list.',
    ]) expect(sql, sentence).toContain(sentence);
    expect(sql).toContain("ARRAY['number', 'issue_date', 'expiry_date', 'no_expiry', 'issuing_country_code', 'use_in_crew_report',");
    expect(sql).toContain("(v_details ->> 'entries') NOT IN ('single', 'double', 'multiple')");
    expect(sql).toMatch(/length\(v_number\) > 60/);
  });
});

describe('the payload', () => {
  it('a new document carries every field of its type, nothing else', () => {
    const v = values({ number: 'P-1', issuing_country_code: 'GB', issue_date: '2024-01-01', expiry_date: '2034-01-01', use_in_crew_report: true, capacity: 'ignored' });
    expect(toDocumentPayload(v, PASSPORT)).toEqual({
      number: 'P-1', issuing_country_code: 'GB', issuing_office: null, issue_date: '2024-01-01', use_in_crew_report: true, notes: null,
      no_expiry: false, expiry_date: '2034-01-01',
    });
    expect(Object.keys(toDocumentPayload(values({ expiry_date: '2030-01-01' }), PST))).not.toContain('use_in_crew_report');
  });

  it('an edit carries only what changed', () => {
    const before = values({ number: 'P-1', issue_date: '2024-01-01', expiry_date: '2034-01-01', capacity: 'Master' });
    expect(toDocumentPayload({ ...before, number: 'P-2' }, COC, before)).toEqual({ number: 'P-2' });
    expect(toDocumentPayload(before, COC, before)).toEqual({});
  });

  it('the tick and the date travel together', () => {
    const before = values({ expiry_date: '2034-01-01' });
    expect(toDocumentPayload({ ...before, no_expiry: true }, PST, before)).toEqual({ no_expiry: true, expiry_date: null });
    const ticked = values({ no_expiry: true });
    expect(toDocumentPayload({ ...ticked, no_expiry: false, expiry_date: '2031-03-01' }, PST, ticked)).toEqual({ no_expiry: false, expiry_date: '2031-03-01' });
  });

  it('the endorsement date is sent as endorsement_due_date for a type that has it', () => {
    expect(toDocumentPayload(values({ expiry_date: '2030-01-01', capacity: 'OOW', endorsement_due_date: '2028-01-01' }), FLAG)).toMatchObject({ endorsement_due_date: '2028-01-01' });
    expect(toDocumentPayload(values({ expiry_date: '2030-01-01', endorsement_due_date: '2028-01-01' }), PST)).not.toHaveProperty('endorsement_due_date');
  });

  it('the uploaded file joins the payload as its stored path, never a URL', () => {
    expect(withDocumentFile({ number: 'x' }, { path: 'c/crew/p/documents/u-a.pdf', name: 'a.pdf', size: 12, mime: 'application/pdf' })).toEqual({
      number: 'x', file_path: 'c/crew/p/documents/u-a.pdf', file_name: 'a.pdf', file_size: 12, file_mime: 'application/pdf',
    });
  });

  it('defaults from a stored document (the details fields, the tick)', () => {
    expect(
      documentFormDefaults({
        number: 'V-1', issue_date: '2024-01-01', expiry_date: '2026-01-01', no_expiry: false, issuing_country_code: 'US', issuing_office: 'Consulate',
        endorsement_due_date: null, use_in_crew_report: false, details: { visa_type: 'C1/D', entries: 'multiple', colour: 'x' }, notes: null,
      }),
    ).toMatchObject({ visa_type: 'C1/D', entries: 'multiple', capacity: null, issuing_office: 'Consulate' });
    expect(
      documentFormDefaults({
        number: null, issue_date: null, expiry_date: '2030-01-01', no_expiry: true, issuing_country_code: null, issuing_office: null,
        endorsement_due_date: null, use_in_crew_report: false, details: { entries: 'triple' }, notes: null,
      }),
    ).toMatchObject({ no_expiry: true, expiry_date: null, entries: null });
  });

  it('the default validity suggests an expiry date', () => {
    expect(suggestedExpiryDate('2024-01-31', 60)).toBe('2029-01-31');
    expect(suggestedExpiryDate('2024-01-31', 1)).toBe('2024-02-29');
    expect(suggestedExpiryDate('2024-01-31', null)).toBeNull();
    expect(suggestedExpiryDate(null, 60)).toBeNull();
    expect(suggestedExpiryDate('2024-01-31', 0)).toBeNull();
  });
});

describe('refusals', () => {
  it('a 22023 refusal shows its sentence and points at its field', () => {
    expect(crewDocumentRefusal({ code: '22023', message: 'field_required', details: 'Enter the issuing country.', hint: 'issuing_country_code' })).toEqual({
      message: 'Enter the issuing country.', field: 'issuing_country_code',
    });
    expect(crewDocumentRefusal({ code: '22023', message: 'file_path_invalid', details: 'The file must be uploaded to this person\'s documents folder.', hint: 'file_path' })).toEqual({
      message: "The file must be uploaded to this person's documents folder.", field: 'file',
    });
    expect(crewDocumentRefusal({ code: '22023', message: 'reason_required', details: 'Say why this document is being removed.', hint: 'reason' }).field).toBe('reason');
    expect(crewDocumentRefusal({ code: '22023', message: 'x', details: 'Something.', hint: 'not_a_field' }).field).toBeNull();
  });

  it('P0002 says what could not be found; 42501 keeps its sentence', () => {
    expect(crewDocumentRefusal({ code: 'P0002', message: 'document_type_not_found', details: 'This document type could not be found.' }).message).toBe('This document type could not be found.');
    expect(crewDocumentRefusal({ code: 'P0002', message: 'document_not_found' }).message).toBe('This document could not be found.');
    expect(crewDocumentRefusal({ code: '42501', message: 'crew_not_permitted', details: "You don't have permission to add documents for this person." }).message).toBe(
      "You don't have permission to add documents for this person.",
    );
    expect(crewDocumentRefusal({ code: '42501', message: 'crew_not_permitted' }).message).toBe("You don't have permission to do that.");
  });

  it('the D-01 notices', () => {
    expect(CATALOGUE_MISSING_NOTICE).toBe('Document types become available once the crew update is applied.');
    expect(SAVE_UNAVAILABLE_NOTICE).toMatch(/once the crew update is applied\.$/);
  });
});
