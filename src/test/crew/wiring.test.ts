/**
 * Crew wiring (X1-01): the pieces that must line up across files, checked
 * with plain file reads so a later slice cannot drift one of them alone.
 *
 * - every pending table and RPC of src/modules/crew/types/db.pending.ts is
 *   created by a block-06 migration, is not in the generated types yet
 *   (D-01), and is listed in the crew contract-map fragment;
 * - every function a block-06 crew migration creates has a grants entry,
 *   every table its relation entry, and the ledger fragment lists each file
 *   (060100 reference and positions, X1-01; 060200 vessel crew list, X1-02);
 * - the positions drawer is mounted on the crew list (CrewListPage since
 *   X1-02) lazily, behind ?positions=1, and nothing eager (the manifest,
 *   the routes, the crew barrel) imports the drawer, the pickers or the
 *   positions hooks;
 * - the named-people seed list is gone (gap/04 headline 9).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const pending = read('src/modules/crew/types/db.pending.ts');
const blockOf = (typeName: string) => {
  const m = pending.match(new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\n\\};`));
  return m ? m[1] : '';
};
const namesIn = (block: string) => Array.from(block.matchAll(/^ {2}([a-z0-9_]+):/gm)).map((m) => m[1]);
const pendingTables = namesIn(blockOf('CrewPendingTables'));
const pendingFunctions = namesIn(blockOf('CrewPendingFunctions'));
const pendingViews = namesIn(blockOf('CrewPendingViews'));

const crewMigrationFiles = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => /^2026112406\d{4}_crew_[a-z0-9_]+\.sql$/.test(f))
  .sort();
const crewMigrations = crewMigrationFiles.map((f) => read(`supabase/migrations/${f}`)).join('\n');
const types = read('src/integrations/supabase/types.ts');
const contractMap = JSON.parse(read('scripts/db/contract-map.d/crew.json'));
const grants = JSON.parse(read('supabase/tests/fixtures/function-grants.d/crew.json'));
const ledger = read('supabase/MIGRATIONS-LEDGER.d/crew.md');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('pending types and the migrations', () => {
  it('declares the tables and RPCs of 060100 to 060500 and 060600 (X1-06: requirement rows, the compliance views and RPCs)', () => {
    expect(pendingTables).toEqual([
      'ref_countries', 'ref_languages', 'departments', 'contract_types', 'positions', 'position_aliases', 'position_manning',
      'crew_movements', 'crew_transfers',
      'crew_personal_details', 'crew_languages', 'crew_assignment_terms',
      'crew_document_categories', 'crew_document_types', 'crew_document_type_satisfies', 'vessel_crew_settings',
      'crew_document_versions',
      'crew_requirement_rows', 'crew_requirement_options', 'crew_requirement_positions',
    ]);
    expect(pendingViews).toEqual(['crew_requirement_status', 'crew_compliance_summary']);
    expect(pendingFunctions).toEqual([
      'crew_positions_for_vessel', 'crew_vessel_unmatched_titles', 'crew_position_create', 'crew_vessel_positions_save', 'crew_position_alias_set',
      'crew_vessel_list', 'crew_vessel_movements',
      'crew_profile_resolve', 'crew_profile_summary', 'crew_personal_details_save', 'crew_languages_save', 'crew_onboarding_save', 'crew_find_duplicates',
      'crew_documents_for_profile', 'crew_document_rights', 'crew_document_save', 'crew_document_delete', 'crew_document_issuing_suggestions',
      'crew_document_review_rights', 'crew_document_verify', 'crew_document_mute', 'crew_document_unmute', 'crew_document_renew',
      'crew_vessel_compliance', 'crew_vessel_requirement_status', 'crew_compliance_for_vessels', 'crew_requirements_config',
      'crew_requirement_row_save', 'crew_requirement_row_delete', 'crew_requirement_cell_set', 'crew_requirement_row_bulk',
      'crew_requirements_add_stcw_basic', 'crew_vessel_set_passenger', 'crew_vessel_settings_save', 'crew_document_type_create',
      'crew_document_type_satisfies_save',
    ]);
    expect(crewMigrationFiles).toEqual([
      '20261124060100_crew_reference_positions.sql',
      '20261124060200_crew_vessel_list.sql',
      '20261124060300_crew_profile_details.sql',
      '20261124060400_crew_document_catalogue.sql',
      '20261124060500_crew_document_verification.sql',
      '20261124060600_crew_compliance.sql',
      // The hours-of-rest engine and board (X1-07, X1-08): their types are the work-rest module's pending file.
      '20261124060700_crew_hor_engine.sql',
      '20261124060800_crew_hor_board.sql',
      '20261124060900_crew_planner_periods.sql',
      // Familiarisation (X1-10): its types are the training module's pending file.
      '20261124061000_crew_familiarisation.sql',
    ]);
  });

  it('every pending table and RPC is created by a block-06 migration', () => {
    for (const t of pendingTables) expect(crewMigrations, t).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t} \\(`));
    for (const f of pendingFunctions) expect(crewMigrations, f).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${f}\\(`));
    for (const v of pendingViews) expect(crewMigrations, v).toMatch(new RegExp(`CREATE OR REPLACE VIEW public\\.${v}\\b`));
  });

  it('none is in the generated types yet (D-01: the shim stays until types.ts is regenerated)', () => {
    for (const name of [...pendingTables, ...pendingViews, ...pendingFunctions]) expect(types.includes(`      ${name}: {`), name).toBe(false);
  });

  it('the crew contract-map fragment expects exactly these names from the pending file', () => {
    const entry = contractMap.files.find((f: { file: string }) => f.file === 'src/modules/crew/types/db.pending.ts');
    expect(entry?.tables).toEqual({ type: 'CrewPendingTables', expect: pendingTables });
    expect(entry?.functions).toEqual({ type: 'CrewPendingFunctions', expect: pendingFunctions });
    expect(entry?.views).toEqual({ type: 'CrewPendingViews', expect: pendingViews });
    expect(Object.keys(contractMap.notMirrored.functions).sort()).toEqual([
      'crew_caller_is_external', 'crew_cap_vessel_ids', 'crew_compliance_summary_rows', 'crew_document_visible_profile_ids', 'crew_profile_visible',
      'crew_requirement_status_rows', 'crew_vessel_cap', 'crew_visible_profile_ids',
    ]);
    expect(entry?.columns).toEqual({ type: 'CrewPendingColumns', expect: ['crew_next_of_kin', 'crew_certificates'] });
  });

  it('every function the crew migrations create has a grants entry, and every table and view its relation entry', () => {
    const fns = Array.from(new Set(Array.from(crewMigrations.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)).map((m) => m[1]))).sort();
    const granted = Object.keys(grants.functions).map((k) => k.replace(/^public\.([a-z0-9_]+)\(.*$/, '$1')).sort();
    expect(granted).toEqual(fns);
    const tables = Array.from(crewMigrations.matchAll(/CREATE (?:TABLE IF NOT EXISTS|OR REPLACE VIEW) public\.([a-z0-9_]+)[ (]/g)).map((m) => `public.${m[1]}`).sort();
    expect(Object.keys(grants.relations).sort()).toEqual(tables);
    for (const key of Object.keys(grants.functions)) expect(grants.functions[key], key).not.toContain('anon');
  });

  it('the ledger fragment lists each file with a check query and an apply-queue row', () => {
    expect(ledger).toContain('| 1 | `20261124060100_crew_reference_positions.sql` | written, not applied |');
    expect(ledger).toContain('| C1 | `20261124060100_crew_reference_positions.sql` | Query C1 |');
    expect(ledger).toMatch(/-- C1\. crew_reference_positions/);
    expect(ledger).toContain('| 2 | `20261124060200_crew_vessel_list.sql` | written, not applied |');
    expect(ledger).toContain('| C2 | `20261124060200_crew_vessel_list.sql` | Query C2 |');
    expect(ledger).toMatch(/-- C2\. crew_vessel_list/);
    expect(ledger).toContain('| 3 | `20261124060300_crew_profile_details.sql` | written, not applied |');
    expect(ledger).toContain('| C3 | `20261124060300_crew_profile_details.sql` | Query C3 |');
    expect(ledger).toMatch(/-- C3\. crew_profile_details/);
    expect(ledger).toContain('| 4 | `20261124060400_crew_document_catalogue.sql` | written, not applied |');
    expect(ledger).toContain('| C4 | `20261124060400_crew_document_catalogue.sql` | Query C4 |');
    expect(ledger).toMatch(/-- C4\. crew_document_catalogue/);
    expect(ledger).toContain('| 5 | `20261124060500_crew_document_verification.sql` | written, not applied |');
    expect(ledger).toContain('| C5 | `20261124060500_crew_document_verification.sql` | Query C5 |');
    expect(ledger).toMatch(/-- C5\. crew_document_verification/);
    expect(ledger).toContain('| 6 | `20261124060600_crew_compliance.sql` | written, not applied |');
    expect(ledger).toContain('| C6 | `20261124060600_crew_compliance.sql` | Query C6 |');
    expect(ledger).toMatch(/-- C6\. crew_compliance/);
  });

  it('the compliance parity fixture is the one both test suites read (X1-06)', () => {
    expect(read('supabase/tests/sql/crew/compliance_parity.test.sql')).toContain('src/test/crew/fixtures/complianceCases.json');
    expect(read('src/test/crew/compliance.test.ts')).toContain('src/test/crew/fixtures/complianceCases.json');
  });

  it('the status parity fixture is the one both test suites read (X1-02)', () => {
    expect(read('supabase/tests/sql/crew/vessel_list.test.sql')).toContain('src/test/crew/fixtures/crewStatusCases.json');
    expect(read('src/test/crew/crewStatus.test.ts')).toContain('./fixtures/crewStatusCases.json');
  });

  it('the parity fixture is the one both test suites read', () => {
    expect(read('supabase/tests/sql/crew/reference_positions.test.sql')).toContain('src/test/crew/fixtures/positionCases.json');
    expect(read('src/test/crew/positions.test.ts')).toContain('./fixtures/positionCases.json');
  });
});

describe('the positions drawer is lazy and behind ?positions=1', () => {
  const crewList = read('src/modules/crew/pages/CrewListPage.tsx');

  it('the crew list loads the drawer with a lazy import and opens it from the URL', () => {
    expect(crewList).toMatch(/lazy\(\(\) => import\('@\/modules\/crew\/components\/PositionsDrawer'\)\)/);
    expect(crewList).toMatch(/POSITIONS_PARAM = 'positions'/);
    expect(crewList).toMatch(/searchParams\.get\(POSITIONS_PARAM\) === '1'/);
    expect(crewList).not.toMatch(/^import .*PositionsDrawer/m);
  });

  it('nothing eager imports the drawer, the pickers or the positions hooks', () => {
    const lazyOnly = /components\/(PositionsDrawer|PositionPicker|CountrySelect|LanguageSelect)|hooks\/(usePositions|useReferenceData)/;
    for (const file of ['src/modules/crew/module.ts', 'src/modules/crew/routes.tsx', 'src/modules/crew/paths.ts', 'src/modules/crew/index.ts']) {
      const staticImports = Array.from(read(file).matchAll(/^import\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)).map((m) => m[1]);
      expect(staticImports.filter((s) => lazyOnly.test(s)), file).toEqual([]);
    }
    const staticImporters = walk(join(ROOT, 'src'))
      .filter((f) => !f.includes('/src/test/') && !f.endsWith('PositionsDrawer.tsx'))
      .filter((f) => /^import\s+[^;]*?from\s+['"][^'"]*components\/PositionsDrawer['"]/m.test(readFileSync(f, 'utf8')));
    expect(staticImporters).toEqual([]);
  });
});

describe('hygiene', () => {
  it('the named-people seed list is gone from src (gap/04 headline 9)', () => {
    // Spelled in two parts so this file is not a hit of the done check's grep.
    const name = ['CREW', 'SEED', 'DATA'].join('_');
    const hits = walk(join(ROOT, 'src')).filter((f) => readFileSync(f, 'utf8').includes(name));
    expect(hits).toEqual([]);
  });
});
