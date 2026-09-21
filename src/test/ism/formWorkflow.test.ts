/**
 * The ISM form workflow lives in the database now. These checks keep the
 * client from drifting back.
 *
 * The module used to carry four status vocabularies at once — the constants
 * in this module, a dead types.ts with lower-case names, pages reading
 * 'draft' / 'active' / 'completed' that no row has ever held, and a dashboard
 * function counting 'pending_signatures' — so every one of those surfaces was
 * permanently empty. It also decided who could sign, in what order and when a
 * submission became SIGNED entirely in the browser.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  FORM_TEMPLATE_STATUSES,
  FORM_SUBMISSION_STATUSES,
} from '@/modules/ism/forms/constants';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const ismSource = walk(join(ROOT, 'src/modules/ism'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const numberedModules = ['audits', 'drills']
  .flatMap((m) => walk(join(ROOT, 'src/modules', m)))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** The literal list inside a CHECK (col IN (...)) constraint in the migrations. */
function checkValues(constraint: string): string[] {
  const m = migrations.match(
    new RegExp(`ADD CONSTRAINT ${constraint}\\s*\\n?\\s*CHECK \\([a-z_]+ IN \\(([^)]*)\\)\\)`),
  );
  if (!m) return [];
  return Array.from(m[1].matchAll(/'([A-Z_]+)'/g)).map((x) => x[1]);
}

describe('ISM form status vocabulary', () => {
  it('template statuses match the database CHECK exactly', () => {
    const allowed = checkValues('form_templates_status_check');
    expect(allowed.length).toBeGreaterThan(0);
    expect([...FORM_TEMPLATE_STATUSES].sort()).toEqual([...allowed].sort());
  });

  it('submission statuses match the database CHECK exactly', () => {
    const allowed = checkValues('form_submissions_status_check');
    expect(allowed.length).toBeGreaterThan(0);
    expect([...FORM_SUBMISSION_STATUSES].sort()).toEqual([...allowed].sort());
  });

  it('no ISM source filters form_templates or form_submissions on a lower-case status', () => {
    const offenders = Array.from(
      ismSource.matchAll(/\.(?:eq|update)\(\s*(?:'status',\s*)?'?(?:\{\s*status:\s*)?'(draft|active|completed|pending_signatures|published|archived)'/g),
    ).map((m) => m[1]);
    expect(offenders).toEqual([]);
  });

  it('the dead third vocabulary is gone', () => {
    expect(existsSync(join(ROOT, 'src/modules/ism/forms/types.ts'))).toBe(false);
  });
});

describe('ISM signature workflow is server-side', () => {
  it('the client never sets a submission to SIGNED', () => {
    expect(ismSource).not.toMatch(/status:\s*'SIGNED'/);
  });

  it('the client never writes to form_signatures', () => {
    expect(ismSource).not.toMatch(/from\(\s*['"]form_signatures['"]\s*\)\s*\n?\s*\.(insert|update|delete|upsert)/);
  });

  it('the client never computes or writes a content hash', () => {
    // Declaring the column on a row type is fine; assigning to it is not.
    expect(ismSource).not.toMatch(/content_hash:(?!\s*string)/);
    expect(ismSource).not.toContain('generateContentHash');
  });

  it('signing and rejecting go through the RPCs the migration creates', () => {
    for (const fn of ['form_sign_submission', 'form_reject_submission', 'form_pending_signatures']) {
      expect(ismSource).toContain(fn);
      expect(migrations).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
  });

  it('the duplicate sms_* signature path is gone', () => {
    expect(existsSync(join(ROOT, 'src/modules/ism/forms/hooks/useSMSForms.ts'))).toBe(false);
    expect(read('src/modules/ism/forms/index.ts')).not.toContain('useSMSForms');
  });
});

describe('ISM form migration guarantees', () => {
  it('signatures are append-only for authenticated sessions', () => {
    expect(migrations).toMatch(
      /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.form_signatures FROM authenticated/,
    );
    expect(migrations).toMatch(/DROP POLICY IF EXISTS "Users can sign their own signatures"/);
  });

  it('the submission UPDATE policy has a WITH CHECK', () => {
    const policy = migrations.match(
      /CREATE POLICY "Users can update their own submissions"[\s\S]*?;/,
    );
    expect(policy).not.toBeNull();
    expect(policy![0]).toContain('WITH CHECK');
  });

  it('numbering runs through the counter table rather than a max()+1 scan', () => {
    expect(migrations).toContain('CREATE TABLE IF NOT EXISTS public.form_submission_counters');
    expect(migrations).toMatch(/ON CONFLICT \(company_id, template_id, year\)\s*\n\s*DO UPDATE SET next_value/);
    expect(migrations).toMatch(/DROP TRIGGER IF EXISTS generate_submission_number ON public\.form_submissions/);
  });
});

describe('reference numbers come from the database', () => {
  it('no module derives a reference number from an array length', () => {
    for (const helper of [
      'generateAuditNumber',
      'generateDrillNumber',
      'generateFindingNumber',
      'generateSubmissionNumber',
      'formatSubmissionNumber',
    ]) {
      expect(numberedModules + ismSource, `${helper} is gone`).not.toContain(helper + '(');
    }
  });

  it('the client does not supply audit, drill or finding numbers on insert', () => {
    // Declaring the column on a row type is fine; assigning to it is not.
    expect(numberedModules).not.toMatch(/audit_number:(?!\s*string)/);
    expect(numberedModules).not.toMatch(/drill_number:(?!\s*string)/);
    expect(numberedModules).not.toMatch(/finding_number:(?!\s*string)/);
  });

  it('a trigger numbers each of the three tables', () => {
    for (const trg of [
      'trg_audits_set_number',
      'trg_drills_set_number',
      'trg_audit_findings_set_number',
    ]) {
      expect(migrations).toContain(`CREATE TRIGGER ${trg}`);
    }
    expect(migrations).toMatch(/ON CONFLICT \(scope\)\s*\n\s*DO UPDATE SET next_value/);
  });

  it('uniqueness is scoped the same way the numbering is', () => {
    expect(migrations).toMatch(/ADD CONSTRAINT audits_company_number_key UNIQUE \(company_id, audit_number\)/);
    expect(migrations).toMatch(/ADD CONSTRAINT drills_vessel_number_key UNIQUE \(vessel_id, drill_number\)/);
    expect(migrations).toMatch(/ADD CONSTRAINT audit_findings_number_key UNIQUE \(audit_id, finding_number\)/);
  });
});
