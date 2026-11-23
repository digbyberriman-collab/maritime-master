/**
 * Command-line flags of the DB harness (Phase 2 spec §D.1). Pure: no I/O,
 * so `scripts/db/test/cli.test.mjs` can cover every case.
 */

export const USAGE = `Usage: node scripts/db/harness.mjs [flags]

Run it as: flock /tmp/storm-db.lock node scripts/db/harness.mjs [flags]

  (no flags)            full run: discover -> cluster -> stub -> legacy replay -> fidelity
                        -> build-out x2 -> contract -> SQL tests -> teardown
  --replay-only         stop after the legacy replay and fidelity
  --file <migration>    build-out files up to and including <migration> once, then
                        <migration> again (idempotency loop for one file)
  --tests <glob>        only SQL test files matching <glob> (relative to supabase/tests/sql/)
  --no-tests            skip the SQL tests
  --no-fidelity         skip the fidelity check
  --no-contract         skip the pending-contract check
  --keep                keep the cluster running and print the psql command
  --report <path>       JSON report path (default $TMPDIR/storm-db-report.json; never in the repo)
  --allow-skip          exit 0 with "SKIP: no PostgreSQL binaries found" when none exist
  --pg-bin <dir>        PostgreSQL binaries directory (initdb, pg_ctl, postgres, psql)
  --verbose             echo psql output
  -h, --help            this text

Exit codes: 0 green, 1 failure, 2 no PostgreSQL (without --allow-skip), 3 usage error.`;

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

const BOOLEAN_FLAGS = new Map([
  ['--replay-only', 'replayOnly'],
  ['--no-tests', 'noTests'],
  ['--no-fidelity', 'noFidelity'],
  ['--no-contract', 'noContract'],
  ['--keep', 'keep'],
  ['--allow-skip', 'allowSkip'],
  ['--verbose', 'verbose'],
  ['--help', 'help'],
  ['-h', 'help'],
]);

const VALUE_FLAGS = new Map([
  ['--file', 'file'],
  ['--tests', 'tests'],
  ['--report', 'report'],
  ['--pg-bin', 'pgBin'],
]);

/** The default options: a full run. */
export function defaultOptions() {
  return {
    replayOnly: false,
    file: null,
    tests: null,
    noTests: false,
    noFidelity: false,
    noContract: false,
    keep: false,
    report: null,
    allowSkip: false,
    pgBin: null,
    verbose: false,
    help: false,
  };
}

/**
 * Parses `argv` (without `node` and the script). Accepts `--flag value` and
 * `--flag=value`. Throws `UsageError` for an unknown flag, a missing or empty
 * value, a repeated flag, or a contradictory combination.
 */
export function parseArgs(argv) {
  const options = defaultOptions();
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1;
    const flag = eq === -1 ? raw : raw.slice(0, eq);
    if (seen.has(flag)) throw new UsageError(`${flag} given more than once`);
    if (BOOLEAN_FLAGS.has(flag)) {
      if (eq !== -1) throw new UsageError(`${flag} takes no value`);
      seen.add(flag);
      options[BOOLEAN_FLAGS.get(flag)] = true;
      continue;
    }
    if (VALUE_FLAGS.has(flag)) {
      let value;
      if (eq !== -1) value = raw.slice(eq + 1);
      else {
        value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) throw new UsageError(`${flag} needs a value`);
        i += 1;
      }
      if (!value) throw new UsageError(`${flag} needs a value`);
      seen.add(flag);
      options[VALUE_FLAGS.get(flag)] = value;
      continue;
    }
    throw new UsageError(raw.startsWith('-') ? `unknown flag ${raw}` : `unexpected argument ${raw}`);
  }
  if (options.help) return options;
  if (options.replayOnly && options.file) throw new UsageError('--replay-only and --file cannot be combined (--file runs the build-out)');
  if (options.replayOnly && options.tests) throw new UsageError('--replay-only runs no SQL tests, so --tests cannot be combined with it');
  if (options.noTests && options.tests) throw new UsageError('--no-tests and --tests cannot be combined');
  return options;
}

/** Which phases run for these options (the report and the summary use it). */
export function plannedPhases(options) {
  const buildOut = !options.replayOnly;
  return {
    replay: true,
    fidelity: !options.noFidelity,
    buildOut,
    contract: buildOut && !options.noContract,
    tests: buildOut && !options.noTests,
  };
}
