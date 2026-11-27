/**
 * The certificates module's legacy writer (useCrewCertificates) says in
 * words why the server refused a direct write to crew_certificates
 * (crew_certificates_guard, D-371): crew add or change their own documents
 * only while crew uploads are on, and remove only their own upload within
 * 24 hours. Any other failure keeps the generic sentence; never a success.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { certificateWriteMessage } from '@/modules/certificates/hooks/useCrewCertificates';

const refused = { code: '42501', message: 'crew_not_permitted', details: "Crew uploads are off for this person's vessel." };

describe('certificateWriteMessage', () => {
  it('says crew uploads are off for a refused add or change', () => {
    expect(certificateWriteMessage(refused, 'add')).toBe('Crew uploads are off for your vessel. Ask the HR team to add this document.');
    expect(certificateWriteMessage(refused, 'update')).toBe('Crew uploads are off for your vessel. Ask the HR team to change this document.');
  });

  it('says who may remove a document for a refused delete', () => {
    expect(certificateWriteMessage(refused, 'delete')).toBe('Only the person who added this document, within 24 hours, or the HR team can remove it.');
    expect(certificateWriteMessage({ code: '42501', message: 'crew_document_delete_refused' }, 'delete')).toBe(
      'A reviewed document is kept. Remove it from the crew profile instead.',
    );
  });

  it('keeps the generic failure for anything else, the raw code never shown', () => {
    expect(certificateWriteMessage({ code: '42501', message: 'new row violates row-level security policy' }, 'add')).toBe('Failed to add certificate. Please try again.');
    expect(certificateWriteMessage(new Error('network'), 'update')).toBe('Failed to update certificate. Please try again.');
    expect(certificateWriteMessage(null, 'delete')).toBe('Failed to delete certificate. Please try again.');
    for (const action of ['add', 'update', 'delete'] as const) expect(certificateWriteMessage(refused, action)).not.toMatch(/crew_not_permitted|42501/);
  });
});
