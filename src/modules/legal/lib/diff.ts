/**
 * Line diff for document versions. Common prefix / suffix are stripped
 * first, then a longest-common-subsequence table is built for the middle.
 * Inputs beyond MAX_CELLS fall back to a plain remove-all / add-all diff.
 */

export type DiffOp = 'equal' | 'add' | 'remove';

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the old text (equal / remove). */
  oldLine?: number;
  /** 1-based line number in the new text (equal / add). */
  newLine?: number;
}

const MAX_CELLS = 4_000_000;

const splitLines = (text: string): string[] => (text === '' ? [] : text.replace(/\r\n?/g, '\n').split('\n'));

export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const out: DiffLine[] = [];

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    out.push({ op: 'equal', text: a[start], oldLine: start + 1, newLine: start + 1 });
    start += 1;
  }

  let endA = a.length;
  let endB = b.length;
  const tail: DiffLine[] = [];
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    tail.unshift({ op: 'equal', text: a[endA - 1], oldLine: endA, newLine: endB });
    endA -= 1;
    endB -= 1;
  }

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > MAX_CELLS) {
    midA.forEach((text, i) => out.push({ op: 'remove', text, oldLine: start + i + 1 }));
    midB.forEach((text, i) => out.push({ op: 'add', text, newLine: start + i + 1 }));
    return [...out, ...tail];
  }

  // LCS length table.
  const n = midA.length;
  const m = midB.length;
  const table: Uint32Array[] = [];
  for (let i = 0; i <= n; i += 1) table.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i][j] = midA[i] === midB[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ op: 'equal', text: midA[i], oldLine: start + i + 1, newLine: start + j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ op: 'remove', text: midA[i], oldLine: start + i + 1 });
      i += 1;
    } else {
      out.push({ op: 'add', text: midB[j], newLine: start + j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ op: 'remove', text: midA[i], oldLine: start + i + 1 });
    i += 1;
  }
  while (j < m) {
    out.push({ op: 'add', text: midB[j], newLine: start + j + 1 });
    j += 1;
  }

  return [...out, ...tail];
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export const diffStats = (lines: DiffLine[]): DiffStats =>
  lines.reduce(
    (acc, l) => {
      if (l.op === 'add') acc.added += 1;
      else if (l.op === 'remove') acc.removed += 1;
      else acc.unchanged += 1;
      return acc;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );

/**
 * Collapses long unchanged runs so a diff view shows changes with
 * `context` lines around them. Collapsed runs become a single marker.
 */
export type DiffRow = DiffLine | { op: 'skip'; count: number };

export function withContext(lines: DiffLine[], context = 3): DiffRow[] {
  if (!lines.some((l) => l.op !== 'equal')) return lines;
  const keep = new Array<boolean>(lines.length).fill(false);
  lines.forEach((l, idx) => {
    if (l.op === 'equal') return;
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k += 1) keep[k] = true;
  });
  const rows: DiffRow[] = [];
  let skipped = 0;
  lines.forEach((l, idx) => {
    if (keep[idx]) {
      if (skipped) {
        rows.push({ op: 'skip', count: skipped });
        skipped = 0;
      }
      rows.push(l);
    } else {
      skipped += 1;
    }
  });
  if (skipped) rows.push({ op: 'skip', count: skipped });
  return rows;
}
