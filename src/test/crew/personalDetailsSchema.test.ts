/**
 * The Personal and Contact forms (X1-03; gap/04 C17, C20, W1 field rules,
 * T-68): the field rules, the starting values, the payloads that carry only
 * what changed (and only what the viewer may change), the phone pairs, the
 * refusal mapping, and the field groups, which must equal the server's
 * crew_personal_field_groups() in 20261124060300_crew_profile_details.sql.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BIOGRAPHY_MAX,
  PERSONAL_FIELD_GROUP,
  biographySchema,
  contactDefaults,
  contactDetailsSchema,
  contactPayload,
  languagesPayload,
  personalDefaults,
  personalDetailsSchema,
  personalPayload,
  profileSaveRefusal,
  type PersonalDetailsValues,
} from '@/modules/crew/lib/personalDetailsSchema';
import { todayDateOnly } from '@/shared/lib/form';
import type { CrewPersonalDetailsRow } from '@/modules/crew/types/db.pending';

const NAMES = { first_name: 'Demo', last_name: 'Bosun', preferred_name: null };

const row = (over: Partial<CrewPersonalDetailsRow> = {}): Partial<CrewPersonalDetailsRow> => ({
  title: 'mr',
  middle_name: null,
  sex: 'male',
  date_of_birth: '1990-04-12',
  nationality_code: 'GB',
  height_cm: 182,
  weight_kg: null,
  crew_number: 'DRA-0042',
  phone_dial_code: '44',
  phone_number: '7700 900123',
  mobile_dial_code: null,
  mobile_number: null,
  city: 'Antibes',
  country_code: 'FR',
  ...over,
});

const valid = (over: Partial<PersonalDetailsValues> = {}): PersonalDetailsValues => ({ ...personalDefaults(row(), NAMES, []), ...over });
const issues = (values: PersonalDetailsValues) => {
  const r = personalDetailsSchema.safeParse(values);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('field groups (mirror of crew_personal_field_groups)', () => {
  it('equals the SQL list field by field', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261124060300_crew_profile_details.sql'), 'utf8');
    const body = sql.slice(sql.indexOf('FUNCTION public.crew_personal_field_groups()'), sql.indexOf('-- ---------------------------------------------------------------- visibility'));
    const fromSql = Object.fromEntries(Array.from(body.matchAll(/\('([a-z0-9_]+)', '(identity|self)', '(profiles|details)'\)/g)).map((m) => [m[1], m[2]]));
    expect(Object.keys(fromSql).length).toBe(30);
    expect(fromSql).toEqual(PERSONAL_FIELD_GROUP);
  });

  it('keeps the names, birth, nationality and crew number with editors, and contact with the person', () => {
    for (const f of ['first_name', 'last_name', 'date_of_birth', 'nationality_code', 'crew_number', 'work_email'] as const) expect(PERSONAL_FIELD_GROUP[f]).toBe('identity');
    for (const f of ['city', 'phone_number', 'mobile_dial_code', 'biography', 'height_cm', 'repatriation_airport'] as const) expect(PERSONAL_FIELD_GROUP[f]).toBe('self');
  });
});

describe('the Personal form rules (gap/04 W1)', () => {
  it('accepts the stored row as it comes back', () => {
    expect(issues(valid())).toEqual([]);
  });

  it('needs a first and last name of up to 50 characters', () => {
    expect(issues(valid({ first_name: '  ' }))).toEqual(['first_name']);
    expect(issues(valid({ last_name: 'x'.repeat(51) }))).toEqual(['last_name']);
    expect(issues(valid({ middle_name: 'x'.repeat(51) }))).toEqual(['middle_name']);
  });

  it('checks the date of birth: a real date, from 1900 to today', () => {
    expect(issues(valid({ date_of_birth: '' }))).toEqual([]);
    expect(issues(valid({ date_of_birth: '2026-02-30' }))).toEqual(['date_of_birth']);
    expect(issues(valid({ date_of_birth: '1899-12-31' }))).toEqual(['date_of_birth']);
    expect(issues(valid({ date_of_birth: todayDateOnly() }))).toEqual([]);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const t = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    expect(issues(valid({ date_of_birth: t }))).toEqual(['date_of_birth']);
  });

  it('keeps height and weight in range as whole numbers', () => {
    expect(issues(valid({ height_cm: '99' }))).toEqual(['height_cm']);
    expect(issues(valid({ height_cm: '251' }))).toEqual(['height_cm']);
    expect(issues(valid({ height_cm: '180.5' }))).toEqual(['height_cm']);
    expect(issues(valid({ weight_kg: '29' }))).toEqual(['weight_kg']);
    expect(issues(valid({ weight_kg: '250' }))).toEqual([]);
  });

  it('checks the work email, the codes and the crew number length', () => {
    expect(issues(valid({ work_email: 'not an email' }))).toEqual(['work_email']);
    expect(issues(valid({ work_email: 'bosun@example.test' }))).toEqual([]);
    expect(issues(valid({ nationality_code: 'gb' }))).toEqual(['nationality_code']);
    expect(issues(valid({ crew_number: 'x'.repeat(21) }))).toEqual(['crew_number']);
  });

  it('refuses a second nationality equal to the first', () => {
    expect(issues(valid({ dual_nationality_code: 'GB' }))).toEqual(['dual_nationality_code']);
    expect(issues(valid({ dual_nationality_code: 'MT' }))).toEqual([]);
  });

  it('languages: a mother tongue first, each language once, a level for the others', () => {
    const langs = (...l: Array<[string, string]>) => {
      const out = l.map(([code, proficiency]) => ({ code, proficiency })) as PersonalDetailsValues['languages'];
      while (out.length < 4) out.push({ code: '', proficiency: '' });
      return out;
    };
    expect(issues(valid({ languages: langs(['en', ''], ['fr', 'fluent']) }))).toEqual([]);
    expect(issues(valid({ languages: langs(['', ''], ['fr', 'fluent']) }))).toEqual(['languages.0.code']);
    expect(issues(valid({ languages: langs(['en', ''], ['en', 'basic']) }))).toEqual(['languages.1.code']);
    expect(issues(valid({ languages: langs(['en', ''], ['fr', '']) }))).toEqual(['languages.1.proficiency']);
  });
});

describe('personalDefaults', () => {
  it('maps the row, the names and the languages to form values (blanks as empty strings)', () => {
    const v = personalDefaults(row({ weight_kg: null }), { first_name: 'Demo', last_name: 'Bosun', preferred_name: 'Bo' }, [
      { slot: 2, language_code: 'fr', proficiency: 'fluent' },
      { slot: 1, language_code: 'en', proficiency: null },
    ]);
    expect(v).toMatchObject({ title: 'mr', first_name: 'Demo', preferred_name: 'Bo', height_cm: '182', weight_kg: '', date_of_birth: '1990-04-12' });
    expect(v.languages).toEqual([
      { code: 'en', proficiency: '' },
      { code: 'fr', proficiency: 'fluent' },
      { code: '', proficiency: '' },
      { code: '', proficiency: '' },
    ]);
  });

  it('starts empty without a row', () => {
    const v = personalDefaults(null, { first_name: null, last_name: null, preferred_name: null }, []);
    expect(v.first_name).toBe('');
    expect(v.title).toBe('');
    expect(v.languages.every((l) => l.code === '')).toBe(true);
  });
});

describe('personalPayload: only what changed, only what the viewer may change', () => {
  const initial = valid();

  it('sends nothing for an unchanged form', () => {
    expect(personalPayload(initial, initial, { identity: true, self: true })).toEqual({});
  });

  it('sends changed fields as the server stores them (blank -> null, numbers, lower-case email)', () => {
    const next = { ...initial, height_cm: '185', crew_number: '', work_email: 'Bosun@Example.TEST', middle_name: ' Ray ' };
    expect(personalPayload(next, initial, { identity: true, self: true })).toEqual({
      height_cm: 185,
      crew_number: null,
      work_email: 'bosun@example.test',
      middle_name: 'Ray',
    });
  });

  it('leaves identity fields out for the person themselves (the server would refuse them)', () => {
    const next = { ...initial, first_name: 'Changed', height_cm: '185' };
    expect(personalPayload(next, initial, { identity: false, self: true })).toEqual({ height_cm: 185 });
  });

  it('and self fields out for a viewer without self rights', () => {
    const next = { ...initial, first_name: 'Changed', height_cm: '185' };
    expect(personalPayload(next, initial, { identity: true, self: false })).toEqual({ first_name: 'Changed' });
  });
});

describe('languagesPayload', () => {
  const base = personalDefaults(row(), NAMES, [{ slot: 1, language_code: 'en', proficiency: null }]);

  it('null when unchanged', () => {
    expect(languagesPayload(base, base)).toBeNull();
  });

  it('the filled places in order, the mother tongue without a level', () => {
    const next: PersonalDetailsValues = {
      ...base,
      languages: [
        { code: 'MT', proficiency: '' },
        { code: 'en', proficiency: 'fluent' },
        { code: '', proficiency: '' },
        { code: '', proficiency: '' },
      ],
    };
    expect(languagesPayload(next, base)).toEqual([
      { slot: 1, language_code: 'mt', proficiency: null },
      { slot: 2, language_code: 'en', proficiency: 'fluent' },
    ]);
  });

  it('an empty list clears them', () => {
    const next: PersonalDetailsValues = { ...base, languages: base.languages.map(() => ({ code: '', proficiency: '' })) };
    expect(languagesPayload(next, base)).toEqual([]);
  });
});

describe('the Contact form (T-68)', () => {
  const initial = contactDefaults(row());
  const parse = (over: Partial<typeof initial>) => {
    const r = contactDetailsSchema.safeParse({ ...initial, ...over });
    return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
  };

  it('accepts the stored row', () => {
    expect(parse({})).toEqual([]);
  });

  it('needs a dial code with a number, and a national number of 4 to 20 digits', () => {
    expect(parse({ mobile_number: '6 12 34 56 78' })).toEqual(['mobile_dial_code']);
    expect(parse({ mobile_number: '12', mobile_dial_code: '33' })).toEqual(['mobile_number']);
    expect(parse({ phone_number: '+44 7700 900123' })).toEqual(['phone_number']);
    expect(parse({ mobile_number: '', mobile_dial_code: '33' })).toEqual([]);
  });

  it('the repatriation airport is a three-letter code (any case)', () => {
    expect(parse({ repatriation_airport: 'nce' })).toEqual([]);
    expect(parse({ repatriation_airport: 'Nice' })).toEqual(['repatriation_airport']);
  });

  it('contactPayload sends phone pairs together and normalised, a dial code without a number dropped', () => {
    expect(contactPayload({ ...initial, phone_number: '7700-900.124' }, initial)).toEqual({ phone_dial_code: '44', phone_number: '7700 900 124' });
    expect(contactPayload({ ...initial, mobile_dial_code: '33' }, initial)).toEqual({});
    expect(contactPayload({ ...initial, phone_number: '' }, initial)).toEqual({ phone_dial_code: null, phone_number: null });
    expect(contactPayload({ ...initial, repatriation_airport: 'nce', city: '' }, initial)).toEqual({ repatriation_airport: 'NCE', city: null });
  });
});

describe('the biography', () => {
  it('is at most 2,000 characters', () => {
    expect(biographySchema.safeParse({ biography: 'x'.repeat(BIOGRAPHY_MAX) }).success).toBe(true);
    expect(biographySchema.safeParse({ biography: 'x'.repeat(BIOGRAPHY_MAX + 1) }).success).toBe(false);
  });
});

describe('profileSaveRefusal', () => {
  it('a 22023 refusal is its DETAIL, with the field from HINT', () => {
    expect(profileSaveRefusal({ code: '22023', message: 'field_invalid', details: 'Height is between 100 and 250 cm.', hint: 'height_cm' })).toEqual({
      message: 'Height is between 100 and 250 cm.',
      field: 'height_cm',
    });
  });

  it('a 42501 refusal reads its sentence', () => {
    expect(
      profileSaveRefusal({ code: '42501', message: 'crew_identity_locked', details: 'Only HR or a crew editor of this person’s vessel can change names.' }).message,
    ).toBe('Only HR or a crew editor of this person’s vessel can change names.');
  });

  it('a hint that is not a field name is ignored, and anything else gets a sentence', () => {
    expect(profileSaveRefusal({ code: '22023', details: 'One of the values could not be read.', hint: '' }).field).toBeNull();
    expect(profileSaveRefusal(new Error('Network down')).message).toBeTruthy();
    expect(profileSaveRefusal({ code: '42501', message: 'crew_profile_edit_refused' }).message).not.toMatch(/_/);
  });
});
