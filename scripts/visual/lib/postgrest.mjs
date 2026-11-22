/**
 * A small in-memory PostgREST look-alike for the visual harness.
 *
 * It answers the requests supabase-js (postgrest-js) sends from the app:
 * column projection, embedded resources, the common filter operators,
 * `or` / `and` groups, ordering, limit/offset, exact counts, HEAD requests,
 * `.single()` (406 PGRST116 when the row count is not 1) and simple writes.
 *
 * It is deliberately forgiving: an operator it does not understand keeps the
 * row (the screenshot shows more, not less), and a filter on an embedded
 * table is ignored. It is a rendering aid, not a database.
 *
 * Pure module: no Playwright, no file system. Tested in
 * scripts/visual/test/postgrest.test.mjs.
 */

const RESERVED_PARAMS = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);

/** @param {unknown} value */
const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** vessels → vessel, companies → company, statuses → status, crew → crew. */
export function singular(name) {
  if (/ies$/.test(name)) return name.replace(/ies$/, 'y');
  if (/(ss|us|x|ch|sh)es$/.test(name)) return name.replace(/es$/, '');
  if (/s$/.test(name) && !/ss$/.test(name)) return name.replace(/s$/, '');
  return name;
}

/** Split on `sep` at depth 0 (outside parentheses, braces and double quotes). */
export function splitTopLevel(input, sep = ',') {
  const out = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== '\\') quoted = !quoted;
    if (!quoted) {
      if (ch === '(' || ch === '{' || ch === '[') depth += 1;
      if (ch === ')' || ch === '}' || ch === ']') depth -= 1;
      if (ch === sep && depth === 0) {
        out.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current !== '' || out.length > 0) out.push(current);
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

// ---------------------------------------------------------------------------
// select=
// ---------------------------------------------------------------------------

/**
 * @typedef {{ kind: 'star' }
 *   | { kind: 'column', alias: string, column: string }
 *   | { kind: 'embed', alias: string, name: string, hint: string | null, inner: boolean, spread: boolean, select: SelectItem[] }} SelectItem
 */

/** Parse a PostgREST `select` string into items. */
export function parseSelect(select) {
  const source = (select ?? '*').replace(/\s+/g, '');
  if (source === '') return [{ kind: 'star' }];
  return splitTopLevel(source).map(parseSelectItem);
}

function parseSelectItem(raw) {
  if (raw === '*') return { kind: 'star' };
  const open = raw.indexOf('(');
  if (open !== -1 && raw.endsWith(')')) {
    let head = raw.slice(0, open);
    const inner = raw.slice(open + 1, -1);
    const spread = head.startsWith('...');
    if (spread) head = head.slice(3);
    let alias = null;
    const colon = head.indexOf(':');
    if (colon !== -1) {
      alias = head.slice(0, colon);
      head = head.slice(colon + 1);
    }
    const [name, ...hints] = head.split('!');
    const isInner = hints.includes('inner');
    const hint = hints.find((h) => h !== 'inner' && h !== 'left') ?? null;
    return {
      kind: 'embed',
      alias: alias ?? name,
      name,
      hint,
      inner: isInner,
      spread,
      select: inner === '' ? [{ kind: 'star' }] : parseSelect(inner),
    };
  }
  let head = raw;
  let alias = null;
  const colon = head.indexOf(':');
  // `col::text` is a cast, `alias:col` an alias.
  if (colon !== -1 && head[colon + 1] !== ':') {
    alias = head.slice(0, colon);
    head = head.slice(colon + 1);
  }
  const cast = head.indexOf('::');
  if (cast !== -1) head = head.slice(0, cast);
  // JSON paths: `meta->>key` → alias defaults to the last key.
  const jsonPath = head.split(/->>?/);
  const column = jsonPath[0];
  const defaultAlias = jsonPath.length > 1 ? jsonPath[jsonPath.length - 1] : column;
  return { kind: 'column', alias: alias ?? defaultAlias, column, path: jsonPath.slice(1) };
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Parse `(a,b,"c,d")` into ['a','b','c,d']. */
export function parseList(value) {
  const body = value.replace(/^\(/, '').replace(/\)$/, '');
  return splitTopLevel(body).map((v) => v.replace(/^"(.*)"$/, '$1'));
}

const isNumeric = (v) => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)));

function compare(a, b) {
  if (isNumeric(a) && isNumeric(b)) return Number(a) - Number(b);
  const sa = String(a);
  const sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function valuesEqual(actual, expected) {
  if (actual === null || actual === undefined) return false;
  if (typeof actual === 'boolean') return String(actual) === expected;
  if (typeof actual === 'number') return isNumeric(expected) && Number(expected) === actual;
  if (typeof actual === 'object') return JSON.stringify(actual) === expected;
  return String(actual) === expected;
}

const likeToRegExp = (pattern, flags) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.')}$`, flags);

/** Parse a `{a,b}` array literal or a JSON value used by cs / cd / ov. */
function parseContainer(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{') && !trimmed.includes(':')) {
    return parseList(trimmed.replace(/^\{/, '(').replace(/\}$/, ')'));
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return parseList(trimmed);
  }
}

function contains(actual, expected) {
  if (Array.isArray(actual)) {
    const list = Array.isArray(expected) ? expected : [expected];
    return list.every((e) => actual.some((a) => valuesEqual(a, String(e)) || a === e));
  }
  if (actual && typeof actual === 'object' && expected && typeof expected === 'object') {
    return Object.entries(expected).every(([k, v]) => JSON.stringify(actual[k]) === JSON.stringify(v));
  }
  if (typeof actual === 'string') return String(actual).includes(String(expected));
  return false;
}

/**
 * Evaluate one operator. Returns `true`/`false`, or `null` when the operator
 * is unknown (callers keep the row).
 */
export function evaluateOperator(actual, op, value) {
  switch (op) {
    case 'eq':
      return valuesEqual(actual, value);
    case 'neq':
      // SQL: NULL <> x is NULL (row excluded), as in PostgREST.
      return actual !== null && actual !== undefined && !valuesEqual(actual, value);
    case 'gt':
      return actual !== null && actual !== undefined && compare(actual, value) > 0;
    case 'gte':
      return actual !== null && actual !== undefined && compare(actual, value) >= 0;
    case 'lt':
      return actual !== null && actual !== undefined && compare(actual, value) < 0;
    case 'lte':
      return actual !== null && actual !== undefined && compare(actual, value) <= 0;
    case 'like':
      return actual !== null && actual !== undefined && likeToRegExp(value, '').test(String(actual));
    case 'ilike':
      return actual !== null && actual !== undefined && likeToRegExp(value, 'i').test(String(actual));
    case 'match':
      return actual !== null && actual !== undefined && new RegExp(value).test(String(actual));
    case 'imatch':
      return actual !== null && actual !== undefined && new RegExp(value, 'i').test(String(actual));
    case 'is': {
      const v = value.toLowerCase();
      if (v === 'null') return actual === null || actual === undefined;
      if (v === 'true') return actual === true;
      if (v === 'false') return actual === false;
      if (v === 'unknown') return actual === null || actual === undefined;
      return null;
    }
    case 'isdistinct':
      return !valuesEqual(actual, value);
    case 'in':
      return parseList(value).some((v) => valuesEqual(actual, v));
    case 'cs':
      return contains(actual, parseContainer(value));
    case 'cd': {
      const container = parseContainer(value);
      if (Array.isArray(actual) && Array.isArray(container)) return actual.every((a) => container.some((c) => valuesEqual(a, String(c))));
      return null;
    }
    case 'ov': {
      const container = parseContainer(value);
      if (Array.isArray(actual) && Array.isArray(container)) return actual.some((a) => container.some((c) => valuesEqual(a, String(c))));
      return null;
    }
    case 'fts':
    case 'plfts':
    case 'phfts':
    case 'wfts': {
      if (actual === null || actual === undefined) return false;
      const words = value.replace(/^\w+\(\w+\)\./, '').split(/[\s&|!:']+/).filter(Boolean);
      const haystack = String(actual).toLowerCase();
      return words.every((w) => haystack.includes(w.toLowerCase()));
    }
    default:
      return null;
  }
}

/**
 * @typedef {{ type: 'cond', column: string, negate: boolean, op: string, value: string }
 *   | { type: 'group', kind: 'or' | 'and', negate: boolean, items: Filter[] }} Filter
 */

/** Parse `op.value` / `not.op.value`, with an optional `(any)`/`(all)` modifier. */
function parseOpValue(column, raw) {
  let rest = raw;
  let negate = false;
  if (rest.startsWith('not.')) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf('.');
  if (dot === -1) return { type: 'cond', column, negate, op: rest, value: '' };
  let op = rest.slice(0, dot);
  const value = rest.slice(dot + 1);
  op = op.replace(/\((any|all)\)$/, '');
  return { type: 'cond', column, negate, op, value };
}

/** Parse the body of `or=(...)` / `and=(...)`. */
export function parseLogicTree(kind, body, negate = false) {
  const inner = body.replace(/^\(/, '').replace(/\)$/, '');
  const items = splitTopLevel(inner).map((part) => {
    const m = /^(not\.)?(or|and)\((.*)\)$/.exec(part);
    if (m) return parseLogicTree(/** @type {'or'|'and'} */ (m[2]), `(${m[3]})`, Boolean(m[1]));
    const dot = part.indexOf('.');
    return parseOpValue(part.slice(0, dot), part.slice(dot + 1));
  });
  return { type: 'group', kind, negate, items };
}

/** Read filters from the query string. Embedded-table filters (`a.b=...`) are skipped. */
export function parseFilters(searchParams) {
  /** @type {Filter[]} */
  const filters = [];
  for (const [key, value] of searchParams.entries()) {
    if (RESERVED_PARAMS.has(key)) continue;
    const logic = /^(not\.)?(or|and)$/.exec(key);
    if (logic) {
      filters.push(parseLogicTree(/** @type {'or'|'and'} */ (logic[2]), value, Boolean(logic[1])));
      continue;
    }
    if (key.includes('.')) continue; // filter or modifier on an embedded resource
    filters.push(parseOpValue(key, value));
  }
  return filters;
}

const readColumn = (row, column) => {
  const path = column.split(/->>?/);
  let value = row?.[path[0]];
  for (const key of path.slice(1)) value = value && typeof value === 'object' ? value[key] : undefined;
  return value;
};

/** @returns {boolean} */
export function matchesFilter(row, filter) {
  if (filter.type === 'group') {
    const results = filter.items.map((item) => matchesFilter(row, item));
    const result = filter.kind === 'or' ? results.some(Boolean) : results.every(Boolean);
    return filter.negate ? !result : result;
  }
  const outcome = evaluateOperator(readColumn(row, filter.column), filter.op, filter.value);
  if (outcome === null) return true; // unknown operator: keep the row
  return filter.negate ? !outcome : outcome;
}

// ---------------------------------------------------------------------------
// order=, limit/offset, Range
// ---------------------------------------------------------------------------

export function parseOrder(order) {
  if (!order) return [];
  return splitTopLevel(order)
    .filter((part) => !part.includes('('))
    .map((part) => {
      const [column, ...mods] = part.split('.');
      return {
        column,
        descending: mods.includes('desc'),
        nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : null,
      };
    });
}

export function sortRows(rows, orders) {
  if (orders.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { column, descending, nullsFirst } of orders) {
      const va = readColumn(a, column);
      const vb = readColumn(b, column);
      const aNull = va === null || va === undefined;
      const bNull = vb === null || vb === undefined;
      if (aNull || bNull) {
        if (aNull && bNull) continue;
        // PostgreSQL default: NULLS LAST for ASC, NULLS FIRST for DESC.
        const nullsFirstEffective = nullsFirst ?? descending;
        return aNull === nullsFirstEffective ? -1 : 1;
      }
      const c = compare(va, vb);
      if (c !== 0) return descending ? -c : c;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Projection and embedding
// ---------------------------------------------------------------------------

/**
 * Resolve an embedded resource for one parent row. Relationship guessing,
 * in order: an explicit FK hint (`table!col` or `table!parent_col_fkey`), a
 * `<singular(name)>_id` / `<alias>_id` column on the parent (many-to-one,
 * matched on the target's `id`, or `user_id` for profiles), else a
 * `<singular(parent)>_id` column on the target (one-to-many).
 */
export function resolveEmbed(db, parentTable, row, item) {
  // `alias:fk_column(cols)` embeds through a column of the parent row
  // (e.g. `vessels:vessel_id(id, name)`): the target is the alias, or the
  // column name without `_id`, pluralised.
  if (!item.viaColumn && !db.tables[item.name] && Object.prototype.hasOwnProperty.call(row, item.name)) {
    const stem = item.name.replace(/_id$/, '');
    const tableName = [item.alias, `${stem}s`, stem.replace(/y$/, 'ies'), stem].find((t) => db.tables[t]) ?? item.alias;
    return resolveEmbed(db, parentTable, row, { ...item, name: tableName, hint: item.name, viaColumn: true });
  }
  const targetRows = db.tables[item.name];
  const fkCandidates = [];
  if (item.hint) {
    if (Object.prototype.hasOwnProperty.call(row, item.hint)) fkCandidates.push(item.hint);
    const m = new RegExp(`^${parentTable}_(.+)_fkey$`).exec(item.hint);
    if (m) fkCandidates.push(m[1]);
  }
  fkCandidates.push(`${singular(item.name)}_id`);
  if (item.alias !== item.name) fkCandidates.push(`${item.alias}_id`, item.alias);

  for (const fk of fkCandidates) {
    if (!Object.prototype.hasOwnProperty.call(row, fk)) continue;
    const value = row[fk];
    if (value === null || value === undefined || typeof value === 'object') return null;
    if (!targetRows) return null;
    const match = targetRows.find((t) => t.id === value) ?? targetRows.find((t) => t.user_id === value) ?? null;
    return match ? projectRow(db, item.name, match, item.select) : null;
  }

  if (!targetRows) return [];
  const backFks = [`${singular(parentTable)}_id`];
  if (parentTable === 'profiles' && row.user_id) backFks.push('user_id');
  const children = targetRows.filter((t) =>
    backFks.some((fk) => t[fk] !== undefined && t[fk] !== null && (t[fk] === row.id || (fk === 'user_id' && t[fk] === row.user_id))),
  );
  const isCount = item.select.length === 1 && item.select[0].kind === 'column' && item.select[0].column === 'count';
  if (isCount) return [{ count: children.length }];
  return children.map((child) => projectRow(db, item.name, child, item.select));
}

/** Apply a parsed select list to one row (recursively for embeds). */
export function projectRow(db, table, row, select) {
  const out = {};
  const hasStar = select.some((s) => s.kind === 'star');
  if (hasStar) Object.assign(out, clone(row));
  for (const item of select) {
    if (item.kind === 'column') {
      if (item.column === 'count' && !Object.prototype.hasOwnProperty.call(row, 'count')) continue;
      const value = item.path && item.path.length ? readColumn(row, [item.column, ...item.path].join('->')) : row[item.column];
      // PostgREST returns every selected column; a column the fixture lacks is NULL.
      out[item.alias] = value === undefined ? null : clone(value);
    } else if (item.kind === 'embed') {
      // A fixture row may carry the embedded value already: use it as is.
      const preset = row[item.alias] ?? row[item.name];
      const value = preset !== undefined && preset !== null && typeof preset === 'object'
        ? clone(preset)
        : resolveEmbed(db, table, row, item);
      if (item.spread) {
        const source = Array.isArray(value) ? value[0] : value;
        if (source && typeof source === 'object') Object.assign(out, source);
      } else {
        out[item.alias] = value;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

/**
 * @typedef {{ tables: Record<string, Record<string, unknown>[]>, rpc: Record<string, unknown>, missingTables?: Set<string>, now?: () => Date, newId?: () => string }} Db
 * @typedef {{ method: string, url: URL, headers: Record<string, string>, body: unknown }} RestRequest
 * @typedef {{ status: number, headers: Record<string, string>, body: string, meta: { table?: string, rpc?: string, fixture: boolean, rows?: number } }} RestResponse
 */

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

const wantsObject = (headers) => (headers.accept ?? '').includes('application/vnd.pgrst.object+json');

const preferValue = (headers, key) => {
  const prefer = headers.prefer ?? '';
  const m = new RegExp(`${key}=([a-z-]+)`).exec(prefer);
  return m ? m[1] : null;
};

function notSingle(count, meta) {
  return {
    status: 406,
    headers: JSON_HEADERS,
    body: JSON.stringify({
      code: 'PGRST116',
      details: `The result contains ${count} rows`,
      hint: null,
      message: 'JSON object requested, multiple (or no) rows returned',
    }),
    meta,
  };
}

function contentRange(offset, returned, total) {
  if (returned === 0) return `*/${total ?? '*'}`;
  return `${offset}-${offset + returned - 1}/${total ?? '*'}`;
}

function parseRangeHeader(headers) {
  const m = /^(\d+)-(\d+)?$/.exec(headers.range ?? '');
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] === undefined ? null : Number(m[2]);
  return { offset: from, limit: to === null ? null : to - from + 1 };
}

/** Answer a `/rest/v1/<table>` request. */
export function handleTable(db, table, request) {
  const { method, url, headers } = request;
  const meta = { table, fixture: Object.prototype.hasOwnProperty.call(db.tables, table) };

  if (db.missingTables?.has(table)) {
    return {
      status: 404,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        code: 'PGRST205',
        details: null,
        hint: null,
        message: `Could not find the table 'public.${table}' in the schema cache`,
      }),
      meta,
    };
  }

  const rows = db.tables[table] ?? [];
  const filters = parseFilters(url.searchParams);
  const select = parseSelect(url.searchParams.get('select'));
  const matching = rows.filter((row) => filters.every((f) => matchesFilter(row, f)));
  const returnRepresentation = preferValue(headers, 'return') === 'representation';

  if (method === 'GET' || method === 'HEAD') {
    const embedsInner = select.filter((s) => s.kind === 'embed' && s.inner);
    let projected = sortRows(matching, parseOrder(url.searchParams.get('order'))).map((row) => projectRow(db, table, row, select));
    if (embedsInner.length) {
      projected = projected.filter((row) => embedsInner.every((e) => {
        const v = row[e.alias];
        return Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined;
      }));
    }
    const total = projected.length;
    const range = parseRangeHeader(headers);
    const offset = Number(url.searchParams.get('offset') ?? range?.offset ?? 0) || 0;
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam !== null ? Number(limitParam) : range?.limit ?? null;
    const page = projected.slice(offset, limit === null ? undefined : offset + limit);
    const countMode = preferValue(headers, 'count');
    const responseHeaders = { ...JSON_HEADERS, 'content-range': contentRange(offset, page.length, countMode ? total : null) };
    meta.rows = page.length;
    if (method === 'HEAD') return { status: 200, headers: responseHeaders, body: '', meta };
    if (wantsObject(headers)) {
      if (page.length !== 1) return notSingle(page.length, meta);
      return { status: 200, headers: responseHeaders, body: JSON.stringify(page[0]), meta };
    }
    return { status: 200, headers: responseHeaders, body: JSON.stringify(page), meta };
  }

  const now = (db.now ?? (() => new Date()))().toISOString();
  const newId = db.newId ?? (() => globalThis.crypto.randomUUID());
  let affected = [];

  if (method === 'POST') {
    const payload = Array.isArray(request.body) ? request.body : request.body ? [request.body] : [];
    const upsert = /resolution=merge-duplicates/.test(headers.prefer ?? '');
    const ignoreDuplicates = /resolution=ignore-duplicates/.test(headers.prefer ?? '');
    const conflictCols = (url.searchParams.get('on_conflict') ?? 'id').split(',').map((c) => c.trim()).filter(Boolean);
    if (!db.tables[table]) db.tables[table] = [];
    for (const input of payload) {
      const existing = (upsert || ignoreDuplicates)
        ? db.tables[table].find((r) => conflictCols.every((c) => input[c] !== undefined && r[c] === input[c]))
        : undefined;
      if (existing) {
        if (upsert) Object.assign(existing, clone(input), { updated_at: now });
        affected.push(existing);
        continue;
      }
      const row = { id: newId(), created_at: now, updated_at: now, ...clone(input) };
      db.tables[table].push(row);
      affected.push(row);
    }
  } else if (method === 'PATCH') {
    for (const row of matching) Object.assign(row, clone(request.body ?? {}));
    affected = matching;
  } else if (method === 'DELETE') {
    const keep = new Set(matching);
    db.tables[table] = rows.filter((r) => !keep.has(r));
    affected = matching;
  } else {
    return { status: 405, headers: JSON_HEADERS, body: JSON.stringify({ message: `Method ${method} not allowed` }), meta };
  }

  meta.rows = affected.length;
  const status = method === 'POST' ? 201 : returnRepresentation ? 200 : 204;
  if (!returnRepresentation) return { status, headers: { 'content-range': `*/${affected.length}` }, body: '', meta };
  const projected = affected.map((row) => projectRow(db, table, row, select));
  if (wantsObject(headers)) {
    if (projected.length !== 1) return notSingle(projected.length, meta);
    return { status, headers: JSON_HEADERS, body: JSON.stringify(projected[0]), meta };
  }
  return { status, headers: JSON_HEADERS, body: JSON.stringify(projected), meta };
}

/** Answer a `/rest/v1/rpc/<fn>` request: the fixture, else `null`. */
export function handleRpc(db, fn, request) {
  const fixture = Object.prototype.hasOwnProperty.call(db.rpc, fn);
  const meta = { rpc: fn, fixture };
  let value = fixture ? clone(db.rpc[fn]) : null;
  if (wantsObject(request.headers) && Array.isArray(value)) {
    if (value.length !== 1) return notSingle(value.length, meta);
    value = value[0];
  }
  if (request.method === 'HEAD') return { status: 200, headers: JSON_HEADERS, body: '', meta };
  return { status: 200, headers: JSON_HEADERS, body: JSON.stringify(value), meta };
}

/** Route a request whose path starts with `/rest/v1/`. */
export function handleRest(db, request) {
  const path = request.url.pathname.replace(/^\/rest\/v1\/?/, '');
  const rpc = /^rpc\/([^/]+)$/.exec(path);
  if (rpc) return handleRpc(db, decodeURIComponent(rpc[1]), request);
  if (path === '') {
    return { status: 200, headers: JSON_HEADERS, body: JSON.stringify({ swagger: '2.0', paths: {} }), meta: { fixture: false } };
  }
  return handleTable(db, decodeURIComponent(path.split('/')[0]), request);
}
