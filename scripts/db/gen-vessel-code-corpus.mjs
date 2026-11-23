#!/usr/bin/env node
/**
 * Writes supabase/tests/fixtures/vessel-code-corpus.json from the frozen TS
 * derivation src/modules/vessels/lib/vesselCode.ts (DECISIONS D-03, D-25;
 * Phase 2 spec §A.1, §E). The SQL tests in supabase/tests/sql/p1_vessel_tenancy
 * assert that the SQL mirrors (vessel_code_letters, vessel_code_candidates,
 * vessel_code_stored, vessel_codes_assign, vessel_codes_for_company, the
 * set-code trigger and the backfill) give exactly these answers.
 *
 *   node scripts/db/gen-vessel-code-corpus.mjs           # (re)write the fixture
 *   node scripts/db/gen-vessel-code-corpus.mjs --check   # exit 1 when it is out of date
 *
 * Deterministic: a seeded PRNG, sorted keys, stable order. No personal data:
 * vessel-like words, letters and symbols only.
 *
 * Sections:
 * - `jsWhitespace`: the code points JS `\s` matches (the prefix rule and
 *   `trim()` use this set; Postgres `\s` and `btrim()` do not, so the SQL
 *   spells it out).
 * - `specialUpper`: every code point that survives NFD (and the U+0300–U+036F
 *   strip) unchanged, is not an ASCII letter, and whose JS `toUpperCase()`
 *   contains ASCII letters (ß → SS, ı → I, ﬁ → FI, ŉ → N, …): the table the
 *   SQL needs on top of an ASCII-only upper-case. `storedUpper` is the subset
 *   whose upper case is entirely A–Z (what `trim().toUpperCase()` can turn
 *   into a valid stored code).
 * - `singleCodePoints`: every code point U+0001–U+FFFF (surrogates excluded)
 *   whose `vesselCodeLetters()` is not the no-letters fallback, with its
 *   letters; every other BMP code point gives 'VSL'. `nonBmpWithLetters`
 *   counts the code points above U+FFFF that give letters (0 today).
 * - `names`: prefix forms (each separator, none, Unicode spaces), short and
 *   letterless names, every Latin-1 Supplement and Latin Extended-A/B letter
 *   as a one-letter name, every special mapping: letters + 12 candidates.
 * - `fullCandidates`: a few names with every candidate (limit 2000).
 * - `limits`: vesselCodeCandidates(name, limit) for odd limits.
 * - `stored`: storedVesselCode() cases.
 * - `fleets`: >= 200 seeded fleets (2–30 vessels) with colliding names,
 *   millisecond-equal created_at with different microseconds, equal
 *   timestamps, missing dates, duplicate ids and clashing stored codes, and
 *   the expected assignVesselCodes() map. `tableSafe` fleets (unique ids,
 *   dates set, stored codes null or canonical and distinct) can be inserted
 *   into public.vessels as they are; `triggerSafe` fleets also have no
 *   stored code, so inserting them one by one in collision order through
 *   the set-code trigger must give the same map.
 */
import { join } from "node:path";
import {
  REPO_ROOT,
  keyUuid,
  loadTs,
  seededRandom,
  writeFixture,
} from "./lib/load-ts.mjs";

const SOURCE = "src/modules/vessels/lib/vesselCode.ts";
const OUT = join(REPO_ROOT, "supabase/tests/fixtures/vessel-code-corpus.json");

const { modules, sourceSha256 } = await loadTs([SOURCE]);
const {
  vesselCodeLetters,
  vesselCodeCandidates,
  storedVesselCode,
  assignVesselCodes,
} = modules[SOURCE];

const hex = (cp) => cp.toString(16).toUpperCase().padStart(4, "0");
const isSurrogate = (cp) => cp >= 0xd800 && cp <= 0xdfff;
const ASCII_LETTER = /^[A-Za-z]$/;

// ---------------------------------------------------------------- tables
const jsWhitespace = [];
for (let cp = 0; cp <= 0xffff; cp += 1)
  if (!isSurrogate(cp) && /\s/.test(String.fromCharCode(cp)))
    jsWhitespace.push(hex(cp));

const specialUpper = [];
const storedUpper = [];
for (let cp = 1; cp <= 0x10ffff; cp += 1) {
  if (isSurrogate(cp)) continue;
  const ch = String.fromCodePoint(cp);
  if (ASCII_LETTER.test(ch)) continue;
  const upper = ch.toUpperCase();
  if (/^[A-Z0-9]+$/.test(upper) && !/^[0-9]$/.test(ch))
    storedUpper.push({ cp: hex(cp), char: ch, upper });
  if (ch.normalize("NFD") !== ch || /[̀-ͯ]/.test(ch)) continue;
  const letters = upper.replace(/[^A-Z]/g, "");
  if (letters) specialUpper.push({ cp: hex(cp), char: ch, letters, upper });
}

const singleCodePoints = {};
let nonBmpWithLetters = 0;
for (let cp = 1; cp <= 0x10ffff; cp += 1) {
  if (isSurrogate(cp)) continue;
  const letters = vesselCodeLetters(String.fromCodePoint(cp));
  if (letters === "VSL") continue;
  if (cp > 0xffff) nonBmpWithLetters += 1;
  else singleCodePoints[hex(cp)] = letters;
}

// ---------------------------------------------------------------- names
const nameSet = new Map();
const addName = (name, tag) => {
  const key = name === null ? "\u0000null" : name;
  if (!nameSet.has(key)) nameSet.set(key, { name, tags: new Set() });
  nameSet.get(key).tags.add(tag);
};

const PREFIXES = ["M/Y", "S/Y", "R/V", "MY", "SY", "RV"];
const caseVariants = (p) => [
  ...new Set([p, p.toLowerCase(), p[0].toLowerCase() + p.slice(1)]),
];
const SEPARATORS = [
  " ",
  "\t",
  "\n",
  "\r",
  "\u000b",
  "\u000c",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  "　",
  "﻿",
  ".",
  ",",
  ":",
  ";",
  "-",
  ". ",
  " - ",
  ": ",
  "--",
  "",
];
const NOT_SEPARATORS = ["_", "/", "​", "\u0085", "᠎", "+", "‐", "­"];
for (const p of PREFIXES) {
  for (const variant of caseVariants(p)) {
    for (const sep of [...SEPARATORS, ...NOT_SEPARATORS])
      addName(`${variant}${sep}Draak`, "prefix");
    for (const sep of [" ", ".", "\u00a0", ""])
      addName(`${variant}${sep}Ëlan 2`, "prefix");
    for (const lead of ["  ", " ", "\t\n", "　", "​"])
      addName(`${lead}${variant} Draak`, "prefix-leading");
    addName(variant, "prefix-alone");
    addName(`${variant} `, "prefix-alone");
    addName(`${variant}.`, "prefix-alone");
  }
}
for (const n of [
  null,
  "",
  " ",
  "   ",
  " ",
  "\t",
  "A",
  "a",
  "AB",
  "ab",
  "Y",
  "YY",
  "YYY",
  "AY",
  "AEIOU",
  "AEIOUY",
  "ABCDEF",
  "Rhythm",
  "RHYTHM",
  "Hydra",
  "HYDRA",
  "Draak II",
  "M/Y DRAAK",
  "GAME CHANGER",
  "Game Changer",
  "LEVIATHAN",
  "123",
  "!!!",
  "---",
  "42 Knots",
  "7 Seas",
  "M/Y",
  "MY",
  "M/Y ",
  "MY.",
  "MYSTIC",
  "Mystic Sea",
  "SY-Sail",
  "SYZYGY",
  "RVX",
  "R/V Hope",
  "RV.Hope",
  "M/Y M/Y Draak",
  "MY MY",
  "S/Y S/Y",
  "MYMY Draak",
  "My Way",
  "M/Y Draak",
  "ß",
  "ẞ",
  "straße",
  "STRASSE",
  "Œuvre",
  "Ærø",
  "Łódź",
  "Ørsted",
  "İstanbul",
  "ıi",
  "ﬁnch",
  "ﬀ",
  "ﬃ",
  "ﬆar",
  "ŉ",
  "ŉa",
  "ǰ",
  "ẖ",
  "ẚ",
  "ẛ",
  "Ǆemal",
  "ǅ",
  "Ꜳ",
  "ｍ／ｙ Ｄｒａａｋ",
  "Ｄｒａａｋ",
  "Δράκος",
  "Дракон",
  "龍",
  "🐉 Draak",
  "Draak 🐉",
  "D́raak",
  "Déjà Vu",
  "ë",
  "A⃝",
  "K",
  "Å",
  "Kelvin",
  "​Draak",
  "​M/Y Draak",
  "Draak​",
  "Aè́̂",
  "Ǣ",
  "ǽ",
  "ȼ",
  "Ɐ",
  "ꝸ",
  "Ꞵ",
  "Ŀ",
  "ĳ",
  "Ĳssel",
  "ſea",
  "ſ",
  "Ǳ",
  "ǳ",
  "Ȣ",
  "Ŋ",
  "Þor",
  "Ðrake",
  "µ",
  "ª",
  "º",
  "¹²³",
  "½",
  "ⅷ",
  "Ⅷ",
]) {
  addName(n, "special");
}
// Every Latin-1 Supplement and Latin Extended-A/B letter as a one-letter name.
for (let cp = 0x00c0; cp <= 0x024f; cp += 1) {
  const ch = String.fromCodePoint(cp);
  if (/\p{L}/u.test(ch)) addName(ch, "latin-letter");
}
// Every special upper-case expansion alone and inside a word.
for (const { char } of specialUpper) {
  addName(char, "special-upper");
  addName(`M/Y ${char}ea`, "special-upper");
  addName(`A${char}${char}Z`, "special-upper");
}

const names = [...nameSet.values()].map(({ name, tags }) => ({
  name,
  tags: [...tags].sort(),
  letters: vesselCodeLetters(name),
  candidates: vesselCodeCandidates(name),
}));

const fullCandidates = [
  "A",
  "Y",
  "Rhythm",
  "M/Y Draak",
  "HYDRA",
  "AEIOU",
  "",
  "ß",
  "ZZ",
].map((name) => ({
  name,
  candidates: vesselCodeCandidates(name, 2000),
}));

const limits = [];
for (const name of ["Draak", "A", "HYDRA"]) {
  for (const limit of [-5, 0, 1, 2, 3, 12, 13, 1308, 5000])
    limits.push({ name, limit, candidates: vesselCodeCandidates(name, limit) });
}

const storedInputs = [
  null,
  "",
  " ",
  "DRA",
  "dra",
  " dra ",
  " dra　",
  "DR1",
  "dr1",
  "D1A",
  "1AB",
  "DR",
  "DRAA",
  "D-1",
  "D_1",
  "ßa",
  "aß",
  "ßß",
  "ﬁx",
  "ﬀa",
  "ıab",
  "ſab",
  "ŉab",
  "ẚbc",
  "éab",
  "ÉAB",
  "Ꜳb",
  "ab​",
  "﻿abc",
  "ABC\n",
  "ＡＢＣ",
  "ab0",
  "A00",
  "Z99",
  "ZZZ",
  "zzz",
  "ǈab",
  "Ǉab",
];
const stored = storedInputs.map((code) => ({
  code,
  stored: storedVesselCode({ code }),
}));

// ---------------------------------------------------------------- fleets
const rnd = seededRandom(20261123);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const intBetween = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const POOL = [
  "DRAAK",
  "Draak II",
  "M/Y Draak",
  "DRAGON",
  "Drake",
  "DRAAKJE",
  "Dr. No",
  "Dra",
  "DR",
  "D",
  "Hydra",
  "HYDRA",
  "Hydrangea",
  "Hyde",
  "HYD",
  "Haydn",
  "Game Changer",
  "Gamma",
  "Gambit",
  "GAM",
  "Gamay",
  "Aurora",
  "Aura",
  "Aurelia",
  "AU",
  "Sea Breeze",
  "Seabird",
  "SEAHAWK",
  "Sea",
  "S/Y Sea",
  "Y",
  "YY",
  "Yacht",
  "Ocean",
  "Oceana",
  "Océane",
  "Ærø",
  "Æon",
  "ß",
  "Straße",
  "ﬁnch",
  "",
  null,
  "123",
  "!!!",
  "Rhythm",
  "RHYTHMS",
  "Leviathan",
  "Levant",
  "Lev",
  "Inkfish",
  "Rocinante",
  "Fleet-Wide",
  "Fleet",
  "Flee",
  "A",
  "AB",
  "ABBA",
  "Abba",
  "BABE",
  "Babe",
  "Ebb",
];
const STORED_POOL = [
  "DRA",
  "dra",
  " hyd ",
  "GAM",
  "GAM",
  "AXX",
  "AX1",
  "ABC",
  "ßa",
  "ﬁx",
  "DR",
  "D-1",
  "1AB",
  "ZZZ9",
  " ",
  "",
  "Ab0",
  "é12",
  "ŉAB",
  "SEA",
  "AUR",
  "LEV",
  "DR1",
  "HYD",
  "HDR",
  "AAA",
  "RHY",
  "RHT",
];

const tinyName = () => {
  const alphabet = pick([
    ["A", "B", "E"],
    ["A", "Y"],
    ["R", "H", "Y"],
    ["Ä", "B"],
  ]);
  return Array.from({ length: intBetween(1, 4) }, () => pick(alphabet)).join(
    "",
  );
};

const BASE = Date.UTC(2026, 0, 1, 0, 0, 0);
const iso = (ms, micros) => {
  const d = new Date(ms).toISOString(); // 2026-01-01T00:00:00.123Z
  return `${d.slice(0, 23)}${String(micros).padStart(3, "0")}Z`;
};

const fleets = [];
const FLEET_COUNT = 220;
for (let f = 0; f < FLEET_COUNT; f += 1) {
  const style =
    f === 0
      ? "all-a"
      : f === 1
        ? "all-rhythm"
        : f === 2
          ? "all-blank"
          : f % 5 === 0
            ? "tiny"
            : "pool";
  const size = f < 3 ? 30 : intBetween(2, 30);
  const vessels = [];
  let lastMs = BASE + intBetween(0, 86_400_000);
  for (let i = 0; i < size; i += 1) {
    let name;
    if (style === "all-a") name = "A";
    else if (style === "all-rhythm") name = "Rhythm";
    else if (style === "all-blank") name = pick(["", null, "123", "   "]);
    else if (style === "tiny") name = tinyName();
    else name = rnd() < 0.15 ? tinyName() : pick(POOL);

    const r = rnd();
    let createdAt;
    if (r < 0.05) createdAt = null;
    else if (r < 0.2 && vessels.length)
      createdAt = vessels[vessels.length - 1].created_at; // exactly equal: id decides
    else if (r < 0.45 && vessels.length)
      createdAt = iso(lastMs, intBetween(0, 999)); // same millisecond, other microseconds
    else {
      lastMs += intBetween(-3_600_000, 86_400_000);
      createdAt = iso(lastMs, intBetween(0, 999));
    }

    let id = keyUuid(`fleet:${f}:vessel:${i}`);
    if (vessels.length && rnd() < 0.02) id = pick(vessels).id; // duplicate id: the first one wins

    const code = rnd() < 0.2 ? pick(STORED_POOL) : null;
    vessels.push({ id, name, created_at: createdAt, code });
  }
  const assigned = assignVesselCodes(vessels);
  const expected = Object.fromEntries(
    [...assigned.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );

  const ids = vessels.map((v) => v.id);
  const uniqueIds = new Set(ids).size === ids.length;
  const datesSet = vessels.every((v) => v.created_at !== null);
  const storedCodes = vessels.map((v) => v.code).filter((c) => c !== null);
  const canonical = storedCodes.every((c) => /^[A-Z][A-Z0-9]{2}$/.test(c));
  const distinct = new Set(storedCodes).size === storedCodes.length;
  const tableSafe = uniqueIds && datesSet && canonical && distinct;
  const triggerSafe = tableSafe && storedCodes.length === 0;
  fleets.push({
    key: `fleet-${String(f).padStart(3, "0")}`,
    style,
    tableSafe,
    triggerSafe,
    vessels,
    expected,
  });
}

writeFixture(
  OUT,
  {
    version: 1,
    generator: "scripts/db/gen-vessel-code-corpus.mjs",
    sourceSha256,
    description:
      "Vessel-code corpus generated from src/modules/vessels/lib/vesselCode.ts (D-03, D-25). The SQL mirrors in 20261123000100_platform_vessel_tenancy.sql must give these answers exactly (supabase/tests/sql/p1_vessel_tenancy). Code points are upper-case hex without U+. Regenerate with node scripts/db/gen-vessel-code-corpus.mjs; never edit by hand.",
    jsWhitespace,
    specialUpper,
    storedUpper,
    singleCodePoints,
    nonBmpWithLetters,
    names,
    fullCandidates,
    limits,
    stored,
    fleets,
    counts: {
      names: names.length,
      singleCodePoints: Object.keys(singleCodePoints).length,
      fleets: fleets.length,
      fleetVessels: fleets.reduce((n, f) => n + f.vessels.length, 0),
      tableSafeFleets: fleets.filter((f) => f.tableSafe).length,
      triggerSafeFleets: fleets.filter((f) => f.triggerSafe).length,
    },
  },
  { compactDepth: 2 },
);
