"""Read a PostgreSQL custom backup without executing its SQL or connecting to a DB.

Python 3.10+ and a compatible pg_restore are required. Output can contain private
source identifiers: always choose a directory outside the repository.
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import zipfile

IDENT = r'(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z_0-9$]*)'
QUALIFIED = rf'{IDENT}\.{IDENT}'


def names(value):
    return [x.strip().strip('"').replace('""', '"') for x in value.split(',')]


def digest_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def parse_schema(sql):
    tables = {}
    for m in re.finditer(rf'^CREATE TABLE ({QUALIFIED}) \(\n(.*?)^\)(?:[^;]*);', sql, re.M | re.S):
        table = m[1].replace('"', '')
        columns = {}
        for line in m[2].splitlines():
            col = re.match(rf'^    ({IDENT}) (.*?)(?:,)?$', line)
            if not col or col[1] in ('CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK', 'FOREIGN'):
                continue
            definition = col[2]
            columns[col[1].strip('"')] = {
                'definition': definition,
                'not_null': 'NOT NULL' in definition,
                'type': re.split(r' DEFAULT | NOT NULL| GENERATED | CONSTRAINT | COLLATE ', definition)[0],
            }
        tables[table] = {'columns': columns, 'primary_key': [], 'unique_keys': [], 'foreign_keys': []}
    for m in re.finditer(rf'ALTER TABLE (?:ONLY )?({QUALIFIED})\s+ADD CONSTRAINT ({IDENT}) (PRIMARY KEY|UNIQUE) \(([^)]+)\)', sql):
        t = tables.get(m[1].replace('"', ''))
        if t is not None:
            key = names(m[4])
            if m[3] == 'PRIMARY KEY':
                t['primary_key'] = key
            t['unique_keys'].append(key)
    for m in re.finditer(rf'ALTER TABLE (?:ONLY )?({QUALIFIED})\s+ADD CONSTRAINT ({IDENT}) FOREIGN KEY \(([^)]+)\) REFERENCES ({QUALIFIED})\(([^)]+)\)([^;]*);', sql):
        table = m[1].replace('"', '')
        if table in tables:
            tables[table]['foreign_keys'].append({'name': m[2], 'columns': names(m[3]),
                'target': m[4].replace('"', ''), 'target_columns': names(m[5]), 'clause': m[6].strip()})
    return tables


def decode_copy(value):
    if value == r'\N':
        return None
    escape = {'b': '\b', 'f': '\f', 'n': '\n', 'r': '\r', 't': '\t', 'v': '\v', '\\': '\\'}
    return re.sub(r'\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|.)',
        lambda m: chr(int(m[1], 8)) if m[1][0] in '01234567' else
        chr(int(m[1][1:], 16)) if m[1].startswith('x') and len(m[1]) > 1 else escape.get(m[1], m[1]), value)


def copy_records(stream, max_line_bytes, max_total_bytes=None):
    """Yield (bounded line or None, byte count); drain long rows without buffering."""
    total = 0
    while True:
        line = stream.readline(max_line_bytes + 1)
        if not line:
            break
        size = len(line)
        total += len(line)
        if max_total_bytes is not None and total > max_total_bytes:
            raise ValueError('Expanded data exceeded configured maximum; inspection is incomplete')
        if len(line) > max_line_bytes and not line.endswith(b'\n'):
            while line and not line.endswith(b'\n'):
                line = stream.readline(max_line_bytes + 1)
                size += len(line)
                total += len(line)
                if max_total_bytes is not None and total > max_total_bytes:
                    raise ValueError('Expanded data exceeded configured maximum; inspection is incomplete')
            yield None, size
        else:
            yield line, size


def signature(cols):
    return json.dumps(cols, separators=(',', ':'))


def key_hash(values):
    return hashlib.sha256(json.dumps(values, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def natural_rules(table, columns):
    # Candidates only. Emails and names never authorize an automatic identity merge.
    if table not in {'auth.users', 'public.profiles', 'public.people',
                     'public.crew_directory', 'public.divers', 'public.vessels'}:
        return []
    candidates = [('email',), ('user_id',), ('cfm_employee_id',), ('airtable_record_id',),
                  ('imo',), ('imo_number',), ('official_number',), ('mmsi',)]
    if table == 'public.people':
        candidates.append(('canonical_email',))
    if table == 'public.crew_directory':
        candidates += [('krakenfleet_email',), ('work_email',), ('crew_id',)]
    return [list(x) for x in candidates if all(k in columns for k in x)]


def inspect_data(pg_restore, archive, tables, out, max_line_bytes, max_bytes):
    db = sqlite3.connect(out / 'relational-checks.sqlite')
    db.executescript('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;'
        'CREATE TABLE keys(t TEXT, k TEXT, v TEXT, PRIMARY KEY(t,k,v)) WITHOUT ROWID;'
        'CREATE TABLE refs(t TEXT, fk TEXT, target TEXT, k TEXT, v TEXT, n INTEGER, PRIMARY KEY(t,fk,v)) WITHOUT ROWID;'
        'CREATE TABLE candidates(t TEXT, k TEXT, v TEXT, n INTEGER, PRIMARY KEY(t,k,v)) WITHOUT ROWID;'
        'CREATE TABLE hashes(t TEXT, v TEXT, n INTEGER, PRIMARY KEY(t,v)) WITHOUT ROWID;')
    refs_needed = collections.defaultdict(list)
    for t in tables.values():
        for fk in t['foreign_keys']:
            if fk['target_columns'] not in refs_needed[fk['target']]:
                refs_needed[fk['target']].append(fk['target_columns'])
    stats = {}
    current = None
    total_bytes = 0
    last_log = time.monotonic()
    bucket_counts = collections.Counter()
    bucket_sizes = collections.Counter()
    storage_manifest = (out / 'storage-manifest.jsonl').open('w', encoding='utf-8')
    stderr = (out / 'pg-restore-data.stderr').open('wb')
    proc = subprocess.Popen([pg_restore, '--data-only', '--no-owner', '--no-privileges',
        '--file=-', str(archive)], stdout=subprocess.PIPE, stderr=stderr)
    try:
        for raw, byte_count in copy_records(proc.stdout, max_line_bytes, max_bytes):
            total_bytes += byte_count
            if total_bytes > max_bytes:
                raise ValueError('Expanded data exceeded configured maximum; inspection is incomplete')
            if time.monotonic() - last_log > 20:
                print(json.dumps({'progress_table': current, 'bytes_scanned': total_bytes,
                    'tables_seen': len(stats)}), flush=True)
                last_log = time.monotonic()
            if current:
                st = stats[current]
                if raw is not None and raw.rstrip(b'\r\n') == b'\\.':
                    current = None
                    db.commit()
                    continue
                st['rows'] += 1
                st['data_bytes'] += byte_count
                if raw is None:
                    st['oversize_rows_unchecked'] += 1
                    continue
                values = raw.rstrip(b'\r\n').decode('utf-8').split('\t')
                if len(values) != len(cols):
                    raise ValueError(f'COPY field count mismatch in {current}')
                # Only decode relational and mapping fields, never expand large JSON payloads.
                row = {col: decode_copy(values[i]) for i, col in enumerate(cols) if col in needed}
                for col in required:
                    if col in row and row[col] is None:
                        st['not_null_violations'][col] = st['not_null_violations'].get(col, 0) + 1
                for key in keys:
                    vals = [row.get(col) for col in key]
                    if None not in vals:
                        db.execute('INSERT OR IGNORE INTO keys VALUES(?,?,?)', (current, signature(key), key_hash(vals)))
                for fk in foreign_keys:
                    vals = [row.get(col) for col in fk['columns']]
                    if None not in vals:  # MATCH SIMPLE; MATCH FULL is reported separately.
                        db.execute('INSERT INTO refs VALUES(?,?,?,?,?,1) ON CONFLICT(t,fk,v) DO UPDATE SET n=n+1',
                            (current, fk['name'], fk['target'], signature(fk['target_columns']), key_hash(vals)))
                for key in naturals:
                    vals = [row.get(col) for col in key]
                    if all(v is not None and v.strip() for v in vals):
                        vals = [v.strip().casefold() if 'email' in col else v.strip() for col, v in zip(key, vals)]
                        db.execute('INSERT INTO candidates VALUES(?,?,?,1) ON CONFLICT(t,k,v) DO UPDATE SET n=n+1',
                            (current, signature(key), key_hash(vals)))
                db.execute('INSERT INTO hashes VALUES(?,?,1) ON CONFLICT(t,v) DO UPDATE SET n=n+1',
                    (current, hashlib.sha256(raw.rstrip(b'\r\n')).hexdigest()))
                if current == 'storage.objects':
                    bucket = row.get('bucket_id') or ''
                    bucket_counts[bucket] += 1
                    try:
                        metadata = json.loads(row.get('metadata') or '{}')
                        size = int(metadata.get('size', 0) or 0)
                    except (ValueError, TypeError):
                        size = 0
                    bucket_sizes[bucket] += size
                    storage_manifest.write(json.dumps({k: row.get(k) for k in
                        ['id', 'bucket_id', 'name', 'owner', 'owner_id', 'version', 'metadata', 'archived_at', 'is_delete_marker']}) + '\n')
            elif raw is not None and raw.startswith(b'COPY '):
                text = raw.decode('utf-8').strip()
                m = re.fullmatch(rf'COPY ({QUALIFIED}) \((.*?)\) FROM stdin;', text)
                if not m:
                    raise ValueError('Unsupported COPY statement')
                current = m[1].replace('"', '')
                cols = names(m[2])
                if current in stats:
                    raise ValueError(f'Multiple COPY blocks for {current}')
                model = tables.get(current, {'columns': {}, 'unique_keys': [], 'foreign_keys': []})
                stats[current] = {'rows': 0, 'data_bytes': 0, 'oversize_rows_unchecked': 0,
                                  'not_null_violations': {}, 'copy_columns': cols}
                required = [c for c in cols if model['columns'].get(c, {}).get('not_null')]
                keys = model['unique_keys'] + [k for k in refs_needed[current] if k not in model['unique_keys']]
                foreign_keys = model['foreign_keys']
                naturals = natural_rules(current, cols)
                needed = set(required + [c for key in keys + naturals for c in key] +
                    [c for fk in foreign_keys for c in fk['columns']])
                if current == 'storage.objects':
                    needed.update(cols)
        if current:
            raise ValueError('Incomplete COPY block')
        if proc.wait() != 0:
            raise RuntimeError('pg_restore failed; see private stderr file')
        db.commit()
        orphans = [dict(zip(['table', 'constraint', 'target', 'unmatched_rows'], row)) for row in db.execute(
            'SELECT r.t,r.fk,r.target,SUM(r.n) FROM refs r LEFT JOIN keys k '
            'ON r.target=k.t AND r.k=k.k AND r.v=k.v WHERE k.v IS NULL GROUP BY r.t,r.fk,r.target')]
        duplicates = [dict(zip(['table', 'key', 'groups', 'rows_in_groups'], row)) for row in db.execute(
            'SELECT t,k,COUNT(*),SUM(n) FROM candidates WHERE n>1 GROUP BY t,k')]
        exact = [dict(zip(['table', 'groups', 'redundant_rows'], row)) for row in db.execute(
            'SELECT t,COUNT(*),SUM(n-1) FROM hashes WHERE n>1 GROUP BY t')]
        primary_duplicates = []
        for table, model in tables.items():
            st = stats.get(table)
            key = model['primary_key']
            if not st or not key or any(st['not_null_violations'].get(c) for c in key):
                continue
            distinct = db.execute('SELECT COUNT(*) FROM keys WHERE t=? AND k=?', (table, signature(key))).fetchone()[0]
            redundant = st['rows'] - st['oversize_rows_unchecked'] - distinct
            if redundant:
                primary_duplicates.append({'table': table, 'key': key, 'redundant_rows': redundant})
        return {'tables': stats, 'bytes_scanned': total_bytes, 'foreign_key_unmatched': orphans,
            'primary_key_duplicate_rows': primary_duplicates,
            'duplicate_candidates': duplicates, 'exact_duplicate_rows': exact,
            'storage_buckets': [{'bucket': b, 'objects': n, 'metadata_bytes': bucket_sizes[b]}
                                for b, n in sorted(bucket_counts.items())]}
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        proc.stdout.close()
        stderr.close()
        storage_manifest.close()
        db.close()


def repo_columns(repo):
    text = (repo / 'src/integrations/supabase/types.ts').read_text(encoding='utf-8')
    tables = {}
    for m in re.finditer(r'^      (\w+): \{\n        Row: \{\n(.*?)^        \}', text, re.M | re.S):
        tables[m[1]] = dict(re.findall(r'^          (\w+): (.+)$', m[2], re.M))
    return tables


def write_mapping(tables, repo, out):
    dest = repo_columns(repo)
    with (out / 'field-mapping.csv').open('w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['source_table', 'source_column', 'source_type', 'destination_candidate', 'destination_type_from_repo', 'status'])
        for name, table in tables.items():
            schema, short = name.split('.', 1)
            for col, definition in table['columns'].items():
                target_col = 'imo_number' if name == 'public.vessels' and col == 'imo' else col
                exists = schema == 'public' and target_col in dest.get(short, {})
                status = 'review_semantics_and_live_schema' if exists else 'preserve_source_field_pending_target_design'
                if schema not in ('public', 'medical', 'spa_archive'):
                    status = 'managed_platform_schema_review_only'
                writer.writerow([name, col, definition['type'], f'public.{short}.{target_col}' if exists else '',
                                 dest.get(short, {}).get(target_col, '') if exists else '', status])
    return {'repository_tables': len(dest), 'same_named_public_tables': sorted(set(dest) &
        {n.split('.', 1)[1] for n in tables if n.startswith('public.')})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--pg-restore', required=True)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--max-row-mib', type=int, default=16)
    parser.add_argument('--max-expanded-gib', type=int, default=128)
    args = parser.parse_args()
    out = args.output.resolve()
    repo = args.repository.resolve()
    if out == repo or repo in out.parents:
        parser.error('Private output must be outside the repository')
    if args.max_row_mib < 1 or args.max_expanded_gib < 1:
        parser.error('Resource limits must be positive')
    out.mkdir(parents=True, exist_ok=False)
    archive = args.archive.resolve()
    meta = {'archive_sha256': digest_file(archive), 'archive_bytes': archive.stat().st_size,
        'source_only': True, 'destination_compared': False, 'deployable': False}
    meta['repository_commit'] = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as z:
            entries = [i for i in z.infolist() if not i.is_dir()]
            if len(entries) != 1 or entries[0].file_size > 4 * 1024 ** 3:
                raise ValueError('Expected one backup under 4 GiB; ZIP was not extracted')
            # Never use a path supplied by the archive.
            with z.open(entries[0]) as src, (out / 'source.backup').open('wb') as dst:
                for block in iter(lambda: src.read(1024 * 1024), b''):
                    dst.write(block)
        archive = out / 'source.backup'
    with archive.open('rb') as f:
        if f.read(5) != b'PGDMP':
            raise ValueError('Only PostgreSQL custom-format archives are supported')
    meta['backup_sha256'] = digest_file(archive)
    for filename, flags in [('source.toc', ['--list']), ('source-schema.sql', ['--schema-only', '--no-owner', '--no-privileges'])]:
        subprocess.run([args.pg_restore, *flags, '--file=' + str(out / filename), str(archive)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    tables = parse_schema((out / 'source-schema.sql').read_text(encoding='utf-8'))
    (out / 'schema-inventory.json').write_text(json.dumps(tables, indent=2), encoding='utf-8')
    meta.update(write_mapping(tables, repo, out))
    (out / 'metadata.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    report = inspect_data(args.pg_restore, archive, tables, out, args.max_row_mib * 1024 ** 2,
                          args.max_expanded_gib * 1024 ** 3)
    report['metadata'] = meta
    meta['declared_tables'] = len(tables)
    meta['declared_columns'] = sum(len(t['columns']) for t in tables.values())
    meta['extension_data_tables_without_ddl'] = sorted(set(report['tables']) - set(tables))
    report['limitations'] = ['No live destination data or schema was compared.',
        'Rows above the configured size limit are counted but not checked.',
        'Foreign-key checks compare COPY text representations; typed/collation checks require PostgreSQL.',
        'SQL checks, expression/partial unique indexes, triggers, RLS, auth login and file contents are not validated.',
        'Extension-owned tables without standalone DDL have no inferred constraints or column types.',
        'Candidate matches never authorize merges, replacements or deletions.']
    (out / 'metadata.json').write_text(json.dumps(meta, indent=2), encoding='utf-8')
    (out / 'source-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    with (out / 'table-inventory.csv').open('w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['table', 'rows', 'data_bytes', 'oversize_rows_unchecked', 'columns', 'foreign_keys'])
        for name in sorted(set(tables) | set(report['tables'])):
            model = tables.get(name, {'columns': {}, 'foreign_keys': []})
            st = report['tables'].get(name, {})
            w.writerow([name, st.get('rows', ''), st.get('data_bytes', ''), st.get('oversize_rows_unchecked', ''),
                        len(model['columns']) or len(st.get('copy_columns', [])), len(model['foreign_keys'])])
    print(json.dumps({'table_definitions': len(tables), 'copy_tables': len(report['tables']),
        'rows': sum(t['rows'] for t in report['tables'].values()), 'bytes_scanned': report['bytes_scanned'],
        'oversize_rows_unchecked': sum(t['oversize_rows_unchecked'] for t in report['tables'].values()),
        'report': str(out / 'source-report.json')}), flush=True)


if __name__ == '__main__':
    main()
