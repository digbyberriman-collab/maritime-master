import importlib.util
from io import BytesIO
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('preflight', Path(__file__).with_name('preflight.py'))
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class PreflightTests(unittest.TestCase):
    def test_stream_audit_detects_missing_reference_and_duplicate_primary_key(self):
        schema = '''CREATE TABLE public.parent (
    id text NOT NULL,
    note text
);
CREATE TABLE public.child (
    id text NOT NULL,
    parent_id text
);
ALTER TABLE ONLY public.parent
    ADD CONSTRAINT parent_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_parent FOREIGN KEY (parent_id) REFERENCES public.parent(id);
'''
        data = (b'COPY public.parent (id, note) FROM stdin;\n'
                b'p1\tfirst\np1\tsecond\n\\.\n'
                b'COPY public.child (id, parent_id) FROM stdin;\n'
                b'c1\tp1\nc2\tmissing\nc3\t\\N\n\\.\n')
        class Process:
            stdout = BytesIO(data)
            def wait(self):
                return 0
            def poll(self):
                return 0
        with tempfile.TemporaryDirectory() as tmp, patch.object(preflight.subprocess, 'Popen', return_value=Process()) as popen:
            result = preflight.inspect_data('pg_restore', Path('fixture.backup'),
                preflight.parse_schema(schema), Path(tmp), 1024, 10240)
            self.assertEqual(result['tables']['public.child']['rows'], 3)
            self.assertEqual(result['foreign_key_unmatched'][0]['unmatched_rows'], 1)
            self.assertEqual(result['primary_key_duplicate_rows'][0]['redundant_rows'], 1)
            self.assertEqual(result['exact_duplicate_rows'], [])
            command = popen.call_args.args[0]
            self.assertIn('--file=-', command)
            self.assertNotIn('--dbname', command)

    def test_incomplete_copy_block_fails_closed(self):
        class Process:
            stdout = BytesIO(b'COPY public.t (id) FROM stdin;\n1\n')
            def wait(self):
                return 0
            def poll(self):
                return 0
        with tempfile.TemporaryDirectory() as tmp, patch.object(preflight.subprocess, 'Popen', return_value=Process()):
            with self.assertRaisesRegex(ValueError, 'Incomplete COPY'):
                preflight.inspect_data('pg_restore', Path('fixture.backup'), {}, Path(tmp), 1024, 10240)

    def test_copy_escapes_do_not_change_field_boundaries(self):
        self.assertEqual(preflight.decode_copy(r'first\tlast\nnext\\end'), 'first\tlast\nnext\\end')
        self.assertIsNone(preflight.decode_copy(r'\N'))
        self.assertEqual(preflight.decode_copy(r'\\N'), r'\N')
        self.assertEqual(preflight.decode_copy(r'\101\x42'), 'AB')

    def test_oversize_row_is_drained_as_one_row(self):
        source = BytesIO(b'one\n' + b'x' * 100 + b'\n' + b'last\n')
        self.assertEqual(list(preflight.copy_records(source, 8)), [(b'one\n', 4), (None, 101), (b'last\n', 5)])

    def test_expansion_limit_applies_inside_a_single_giant_row(self):
        with self.assertRaises(ValueError):
            list(preflight.copy_records(BytesIO(b'x' * 1000), 8, 32))

    def test_partition_parent_does_not_swallow_first_child(self):
        sql = '''CREATE TABLE realtime.parent (
    id uuid NOT NULL
)
PARTITION BY RANGE (id);
CREATE TABLE realtime.child (
    id uuid NOT NULL
);
'''
        self.assertEqual(set(preflight.parse_schema(sql)), {'realtime.parent', 'realtime.child'})

    def test_schema_relations_preserve_composite_keys(self):
        sql = '''CREATE TABLE public.parent (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL
);
CREATE TABLE public.child (
    id uuid NOT NULL,
    parent_id uuid,
    tenant_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE ONLY public.parent
    ADD CONSTRAINT parent_pkey PRIMARY KEY (id, tenant_id);
ALTER TABLE ONLY public.child
    ADD CONSTRAINT child_parent FOREIGN KEY (parent_id, tenant_id) REFERENCES public.parent(id, tenant_id) ON DELETE CASCADE;
'''
        tables = preflight.parse_schema(sql)
        self.assertEqual(tables['public.parent']['primary_key'], ['id', 'tenant_id'])
        fk = tables['public.child']['foreign_keys'][0]
        self.assertEqual(fk['columns'], ['parent_id', 'tenant_id'])
        self.assertEqual(fk['target_columns'], ['id', 'tenant_id'])
        self.assertEqual(tables['public.child']['columns']['payload']['type'], 'jsonb')

    def test_blank_and_null_keys_are_distinct_and_delimiter_safe(self):
        self.assertNotEqual(preflight.key_hash(['a,b', 'c']), preflight.key_hash(['a', 'b,c']))
        self.assertNotEqual(preflight.key_hash([None]), preflight.key_hash(['']))

    def test_names_do_not_create_identity_merge_candidates(self):
        self.assertEqual(preflight.natural_rules('public.divers', ['name']), [])
        self.assertIn(['user_id'], preflight.natural_rules('public.divers', ['name', 'user_id']))
        self.assertEqual(preflight.natural_rules('auth.sessions', ['id', 'user_id']), [])


if __name__ == '__main__':
    unittest.main()
