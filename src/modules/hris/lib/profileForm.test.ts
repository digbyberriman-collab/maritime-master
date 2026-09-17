import { describe, expect, it } from 'vitest';
import type { Tables } from '@/integrations/supabase/types';
import {
  avatarStoragePath,
  buildProfilePatch,
  PROFILE_FORM_FIELDS,
  profileFormSchema,
  profileInitials,
  profileToFormValues,
  resolveEditableFields,
  validateAvatarFile,
  withStoredOption,
} from './profileForm';

// Only the columns these helpers read are set; the rest default to null.
const baseProfile = {
  id: 'p1',
  user_id: null,
  company_id: 'c1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'Silva',
  preferred_name: null,
  phone: '+351 900',
  date_of_birth: '1990-04-12',
  gender: null,
  nationality: 'Portuguese',
  avatar_url: null,
  rank: 'Stewardess',
  position: null,
  department: 'Interior',
  status: 'Active',
  rotation: null,
  rotation_pattern: '2:2',
  cabin: null,
  contract_start_date: '2026-01-01',
  contract_end_date: '2026-12-31T00:00:00+00:00',
  probation_end_date: null,
  employment_start_date: null,
  employment_status: null,
  medical_expiry: null,
  passport_number: 'X123',
  passport_expiry: null,
  visa_status: null,
  visa_expiry: null,
  notes: null,
  account_status: 'not_invited',
  is_imported: true,
  last_login_at: null,
  role: 'crew',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
  version: 1,
  airtable_id: null,
  annual_leave_entitlement: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  hod_user_id: null,
  imported_vessel_id: null,
  invitation_count: null,
  invitation_token: null,
  invitation_token_expires: null,
  invited_at: null,
  joining_date: null,
  last_invited_at: null,
  leave_accrual_method: null,
  leaving_date: null,
  watch_pattern: null,
} as unknown as Tables<'profiles'>;


describe('profileToFormValues', () => {
  it('maps nulls to empty strings and trims date-times to calendar dates', () => {
    const values = profileToFormValues(baseProfile);
    expect(values.preferred_name).toBe('');
    expect(values.first_name).toBe('Ana');
    expect(values.contract_end_date).toBe('2026-12-31');
    expect(Object.keys(values).sort()).toEqual([...PROFILE_FORM_FIELDS].sort());
  });
});

describe('buildProfilePatch', () => {
  const original = profileToFormValues(baseProfile);
  const hrEditable = resolveEditableFields({ canEdit: true, isOwnRecord: false });

  it('returns only changed, editable fields with empty strings as null', () => {
    const patch = buildProfilePatch(
      original,
      { ...original, phone: '', cabin: ' 12 ', email: 'hacked@example.com' },
      hrEditable,
    );
    expect(patch).toEqual({ phone: null, cabin: '12' });
  });

  it('is empty when nothing changed', () => {
    expect(buildProfilePatch(original, { ...original }, hrEditable)).toEqual({});
  });

  it('ignores fields outside the self-service allow-list', () => {
    const selfEditable = resolveEditableFields({ canEdit: false, isOwnRecord: true });
    const patch = buildProfilePatch(
      original,
      { ...original, preferred_name: 'Annie', rank: 'Master', passport_number: 'Z999' },
      selfEditable,
    );
    expect(patch).toEqual({ preferred_name: 'Annie' });
  });
});

describe('resolveEditableFields', () => {
  it('lets HR editors edit everything except the read-only columns', () => {
    const fields = resolveEditableFields({ canEdit: true, isOwnRecord: false });
    expect(fields.has('first_name')).toBe(true);
    expect(fields.has('passport_number')).toBe(true);
    expect(fields.has('email')).toBe(false);
    expect(fields.has('contract_start_date')).toBe(false);
    expect(fields.has('contract_end_date')).toBe(false);
  });

  it('limits self-service users to their own allow-list', () => {
    const fields = resolveEditableFields({ canEdit: false, isOwnRecord: true });
    expect([...fields].sort()).toEqual(['phone', 'preferred_name']);
  });

  it('grants nothing to a viewer looking at someone else', () => {
    expect(resolveEditableFields({ canEdit: false, isOwnRecord: false }).size).toBe(0);
  });
});

describe('profileFormSchema', () => {
  const valid = profileToFormValues(baseProfile);

  it('accepts a mapped profile', () => {
    expect(profileFormSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a probation end before the employment start', () => {
    const result = profileFormSchema.safeParse({
      ...valid,
      employment_start_date: '2026-03-01',
      probation_end_date: '2026-02-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['probation_end_date']);
    }
  });

  it('rejects a future date of birth and a missing last name', () => {
    expect(profileFormSchema.safeParse({ ...valid, date_of_birth: '2999-01-01' }).success).toBe(false);
    expect(profileFormSchema.safeParse({ ...valid, last_name: '  ' }).success).toBe(false);
  });
});

describe('withStoredOption', () => {
  it('keeps a stored value that is not in the vocabulary', () => {
    expect(withStoredOption(['Deck', 'Engine'], 'Legacy Dept')).toEqual(['Legacy Dept', 'Deck', 'Engine']);
    expect(withStoredOption(['Deck', 'Engine'], 'Deck')).toEqual(['Deck', 'Engine']);
    expect(withStoredOption(['Deck'], null)).toEqual(['Deck']);
  });
});

describe('avatar helpers', () => {
  it('validates type and size', () => {
    expect(validateAvatarFile({ type: 'image/png', size: 1024 })).toBeNull();
    expect(validateAvatarFile({ type: 'image/gif', size: 1024 })).toMatch(/JPEG, PNG or WebP/);
    expect(validateAvatarFile({ type: 'image/jpeg', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
    expect(validateAvatarFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/);
  });

  it('builds the bucket path convention', () => {
    expect(avatarStoragePath('c1', 'p1', 'image/webp', 1700000000000)).toBe('c1/p1/1700000000000.webp');
    expect(avatarStoragePath('c1', 'p1', 'image/jpeg', 1)).toBe('c1/p1/1.jpg');
  });

  it('derives initials', () => {
    expect(profileInitials('Ana', 'Silva')).toBe('AS');
    expect(profileInitials(' ana', null)).toBe('A');
    expect(profileInitials(null, null)).toBe('?');
  });
});
