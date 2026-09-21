/**
 * Vessel slugs used in `/vessel/:vesselSlug/...` routes.
 *
 * These used to be hard-coded in `src/data/seedData.ts` alongside real crew
 * names. They are derived from the vessel's own name instead, so the routes
 * follow the `vessels` table rather than a fixture: the prefix a yacht name
 * carries ("M/Y", "R/V", "S/Y") is dropped and the rest is lower-cased and
 * hyphenated. "M/Y GAME CHANGER" becomes "game-changer".
 */
const PREFIX = /^[a-z]\/[a-z]\s+/i;

export function vesselSlug(name: string): string {
  return name
    .replace(PREFIX, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Finds the vessel whose name slugifies to `slug`, or undefined. */
export function findVesselBySlug<T extends { name: string }>(vessels: T[], slug: string): T | undefined {
  const wanted = slug.trim().toLowerCase();
  return vessels.find((v) => vesselSlug(v.name) === wanted);
}
