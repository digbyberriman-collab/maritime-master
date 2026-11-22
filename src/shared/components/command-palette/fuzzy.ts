/**
 * Fuzzy matching for the command palette (gap/10 IA12, BUILD-PLAN S5).
 *
 * `fuzzyScore(query, text)` returns a score in [0, 1]: 0 means "no match"
 * (cmdk hides the item), higher ranks first. Matching ignores case and
 * diacritics ("Medecin" finds "Médecin"). The tiers, best first:
 *
 *   1.00        the text is the query
 *   0.90–0.99   the text starts with the query ("cre" → "Crew list")
 *   0.70–0.84   a word starts with the query ("list" → "Crew list")
 *   0.10–0.68   every character appears in order, scored by how many land
 *               on word starts or continue a run ("cl" → "Crew list",
 *               "hor" → "Hours of rest"); a run inside a word ("rew" in
 *               "Crew") scores 0.45–0.50 unless word starts do better
 *
 * A query with spaces must match every word ("list crew" → "Crew list").
 * Pure; unit-tested in src/test/palette/fuzzy.test.ts.
 */

/** Lower case, no diacritics, single spaces. */
export function normaliseSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[a-z0-9]/.test(ch);

/** A character starts a word: the first one, or one after a separator. */
const isWordStart = (text: string, index: number): boolean =>
  isWordChar(text[index]) && (index === 0 || !isWordChar(text[index - 1]));

function wordStartIndexOf(text: string, token: string): number {
  let from = text.indexOf(token);
  while (from !== -1) {
    if (isWordStart(text, from)) return from;
    from = text.indexOf(token, from + 1);
  }
  return -1;
}

/**
 * Best in-order match of every character of `token` in `text`, as an average
 * per-character score in (0, 1]: 1 at a word start, 0.8 when it continues a
 * run, 0.35 elsewhere. Dynamic programme over (token char, text position),
 * O(token × text). 0 when some character is missing.
 */
function subsequenceScore(token: string, text: string): number {
  const n = text.length;
  const m = token.length;
  if (m === 0) return 1;
  if (m > n) return 0;
  const NONE = -1;
  let prev = new Array<number>(n).fill(NONE);
  for (let i = 0; i < m; i += 1) {
    const cur = new Array<number>(n).fill(NONE);
    // Best score of the previous token char matched at any position < p - 1.
    let bestBefore = NONE;
    for (let p = 0; p < n; p += 1) {
      if (i > 0 && p >= 2 && prev[p - 2] > bestBefore) bestBefore = prev[p - 2];
      if (text[p] !== token[i]) continue;
      const wordStart = isWordStart(text, p);
      if (i === 0) {
        cur[p] = wordStart ? 1 : 0.35;
        continue;
      }
      const run = p >= 1 ? prev[p - 1] : NONE;
      const viaRun = run === NONE ? NONE : run + (wordStart ? 1 : 0.8);
      const viaGap = bestBefore === NONE ? NONE : bestBefore + (wordStart ? 1 : 0.35);
      cur[p] = Math.max(viaRun, viaGap);
    }
    prev = cur;
  }
  const best = Math.max(...prev);
  return best === NONE ? 0 : best / m;
}

/** Score one already-normalised token (no spaces) against normalised text. */
function tokenScore(token: string, text: string): number {
  if (!token) return 1;
  if (!text) return 0;
  const ratio = token.length / text.length;
  if (text === token) return 1;
  if (text.startsWith(token)) return 0.9 + 0.09 * ratio;
  const wordStart = wordStartIndexOf(text, token);
  if (wordStart !== -1) return 0.75 + 0.09 * ratio - Math.min(0.05, wordStart * 0.002);
  const sub = subsequenceScore(token, text);
  const scattered = sub === 0 ? 0 : 0.1 + 0.58 * sub;
  // A run inside a word ("rew" in "crew") is a weaker hit than one that lands on word starts.
  const inside = text.includes(token) ? 0.45 + 0.05 * ratio : 0;
  return Math.max(scattered, inside);
}

/**
 * How well `query` matches `text`, 0 (no match) to 1 (identical). Case and
 * diacritics are ignored; every word of a multi-word query must match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = normaliseSearchText(query);
  if (!q) return 1;
  const t = normaliseSearchText(text);
  if (!t) return 0;
  // The whole query first, so "crew li" ranks as a prefix of "Crew list".
  if (q.includes(' ')) {
    if (t === q) return 1;
    if (t.startsWith(q)) return 0.9 + 0.09 * (q.length / t.length);
    const at = wordStartIndexOf(t, q);
    if (at !== -1) return 0.75 + 0.09 * (q.length / t.length);
  }
  const tokens = q.split(' ');
  let total = 0;
  for (const token of tokens) {
    const s = tokenScore(token, t);
    if (s === 0) return 0;
    total += s;
  }
  // Several words that each match only loosely rank below one clean match.
  const mean = total / tokens.length;
  return tokens.length > 1 ? Math.min(mean, 0.89) : mean;
}

/** Weight of a match on a secondary keyword (trail, code, synonym) relative to the label. */
export const SECONDARY_KEYWORD_WEIGHT = 0.85;
/** Weight of a match that needs words from several keywords at once. */
export const COMBINED_KEYWORD_WEIGHT = 0.75;

/**
 * Score an item from its keywords: the first keyword is its label (full
 * weight), the others count a little less, and a query whose words are
 * spread over several keywords ("crew training": trail "Crew", label
 * "Training") still matches, below a direct hit.
 */
export function scoreKeywords(query: string, keywords: readonly string[]): number {
  if (!normaliseSearchText(query)) return 1;
  const [label = '', ...rest] = keywords;
  let best = fuzzyScore(query, label);
  for (const keyword of rest) {
    best = Math.max(best, fuzzyScore(query, keyword) * SECONDARY_KEYWORD_WEIGHT);
  }
  if (keywords.length > 1) {
    best = Math.max(best, fuzzyScore(query, keywords.join(' ')) * COMBINED_KEYWORD_WEIGHT);
  }
  return best;
}
