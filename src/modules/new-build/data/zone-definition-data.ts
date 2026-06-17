/**
 * Zone Definition Plan data for Y727
 * Source: Y727-300-003-11-01 Rev F — Zone Definition Plan
 */

export interface ZoneDefinition {
  id: string;
  name: string;
  fullName: string;
  color: string;        // tailwind-friendly bg class
  colorHex: string;     // hex for custom rendering
  type: "hull" | "superstructure";
  extent_mm?: number;   // longitudinal extent in mm
  description: string;
}

export interface DeckDefinition {
  number: number;       // 0–7
  code: string;         // "00" – "07"
  name: string;
  fullName: string;     // e.g. "00 — Tank Top Deck"
}

export interface SubzoneMapping {
  code: string;         // e.g. "A0", "D3", "E7"
  zoneId: string;       // references ZoneDefinition.id
  deckNumber: number;
}

// ── Zones ──

export const zoneDefinitions: ZoneDefinition[] = [
  {
    id: "A",
    name: "Zone A",
    fullName: "Mid Ship Forward",
    color: "bg-green-500",
    colorHex: "#22c55e",
    type: "hull",
    extent_mm: 16250,
    description: "Mid ship forward hull section. Basic Engineering delivery zone.",
  },
  {
    id: "B",
    name: "Zone B",
    fullName: "Mid Ship Aft",
    color: "bg-blue-500",
    colorHex: "#3b82f6",
    type: "hull",
    extent_mm: 29250,
    description: "Mid ship aft hull section. Basic Engineering delivery zone.",
  },
  {
    id: "C",
    name: "Zone C",
    fullName: "Fore Ship",
    color: "bg-red-500",
    colorHex: "#ef4444",
    type: "hull",
    extent_mm: 49927,
    description: "Fore ship hull section extending to the bow.",
  },
  {
    id: "D",
    name: "Zone D",
    fullName: "Aft Ship",
    color: "bg-yellow-400",
    colorHex: "#facc15",
    type: "hull",
    extent_mm: 35706,
    description: "Aft ship hull section extending to the stern, including engine room area.",
  },
  {
    id: "E",
    name: "Zone E",
    fullName: "SSTR Fore",
    color: "bg-orange-400",
    colorHex: "#fb923c",
    type: "superstructure",
    description: "Superstructure forward section. Appears on decks 04–07.",
  },
  {
    id: "F",
    name: "Zone F",
    fullName: "SSTR Mid",
    color: "bg-emerald-400",
    colorHex: "#34d399",
    type: "superstructure",
    description: "Superstructure midships section. Appears on decks 04–06.",
  },
  {
    id: "G",
    name: "Zone G",
    fullName: "SSTR Aft",
    color: "bg-cyan-400",
    colorHex: "#22d3ee",
    type: "superstructure",
    description: "Superstructure aft section. Appears on decks 04–06.",
  },
  {
    id: "HJ",
    name: "Zone H&J",
    fullName: "SSTR + Funnel / Mast",
    color: "bg-purple-400",
    colorHex: "#c084fc",
    type: "superstructure",
    description: "Funnel and mast structures. Zone J appears on deck 07 (Crow's Nest).",
  },
];

// ── Decks ──

export const deckDefinitions: DeckDefinition[] = [
  { number: 0, code: "00", name: "Tank Top Deck", fullName: "00 — Tank Top Deck" },
  { number: 1, code: "01", name: "Tank Deck", fullName: "01 — Tank Deck" },
  { number: 2, code: "02", name: "Lower Deck", fullName: "02 — Lower Deck" },
  { number: 3, code: "03", name: "Main Deck", fullName: "03 — Main Deck" },
  { number: 4, code: "04", name: "Upper Deck", fullName: "04 — Upper Deck" },
  { number: 5, code: "05", name: "Officers Deck", fullName: "05 — Officers Deck" },
  { number: 6, code: "06", name: "Bridge Deck", fullName: "06 — Bridge Deck" },
  { number: 7, code: "07", name: "Crow's Nest", fullName: "07 — Crow's Nest" },
];

// ── Subzone mappings (zone + deck intersections) ──

export const subzoneMappings: SubzoneMapping[] = [
  // Deck 00 — Tank Top Deck (hull zones only)
  { code: "D0", zoneId: "D", deckNumber: 0 },
  { code: "B0", zoneId: "B", deckNumber: 0 },
  { code: "A0", zoneId: "A", deckNumber: 0 },
  { code: "C0", zoneId: "C", deckNumber: 0 },

  // Deck 01 — Tank Deck
  { code: "D1", zoneId: "D", deckNumber: 1 },
  { code: "B1", zoneId: "B", deckNumber: 1 },
  { code: "A1", zoneId: "A", deckNumber: 1 },
  { code: "C1", zoneId: "C", deckNumber: 1 },

  // Deck 02 — Lower Deck
  { code: "D2", zoneId: "D", deckNumber: 2 },
  { code: "B2", zoneId: "B", deckNumber: 2 },
  { code: "A2", zoneId: "A", deckNumber: 2 },
  { code: "C2", zoneId: "C", deckNumber: 2 },

  // Deck 03 — Main Deck
  { code: "D3", zoneId: "D", deckNumber: 3 },
  { code: "B2", zoneId: "B", deckNumber: 3 },  // B2 extends to Main Deck
  { code: "B3", zoneId: "B", deckNumber: 3 },
  { code: "A3", zoneId: "A", deckNumber: 3 },
  { code: "C3", zoneId: "C", deckNumber: 3 },

  // Deck 04 — Upper Deck (superstructure begins)
  { code: "G4", zoneId: "G", deckNumber: 4 },
  { code: "F4", zoneId: "F", deckNumber: 4 },
  { code: "E4", zoneId: "E", deckNumber: 4 },

  // Deck 05 — Officers Deck
  { code: "G4", zoneId: "G", deckNumber: 5 },  // G4 extends to Officers Deck
  { code: "G5", zoneId: "G", deckNumber: 5 },
  { code: "F5", zoneId: "F", deckNumber: 5 },
  { code: "E5", zoneId: "E", deckNumber: 5 },
  { code: "E4", zoneId: "E", deckNumber: 5 },  // E4 extends to Officers Deck

  // Deck 06 — Bridge Deck
  { code: "G6", zoneId: "G", deckNumber: 6 },
  { code: "F6", zoneId: "F", deckNumber: 6 },
  { code: "E6", zoneId: "E", deckNumber: 6 },

  // Deck 07 — Crow's Nest
  { code: "E7", zoneId: "E", deckNumber: 7 },
  { code: "J7", zoneId: "HJ", deckNumber: 7 },
];

/**
 * For the zone-deck grid: which zone IDs appear on each deck.
 * Returns unique zone IDs per deck for the matrix view.
 */
export function getZonesForDeck(deckNumber: number): string[] {
  const zoneIds = new Set(
    subzoneMappings
      .filter((s) => s.deckNumber === deckNumber)
      .map((s) => s.zoneId)
  );
  return Array.from(zoneIds);
}

/**
 * Get the subzone codes for a given deck.
 */
export function getSubzonesForDeck(deckNumber: number): SubzoneMapping[] {
  return subzoneMappings.filter((s) => s.deckNumber === deckNumber);
}

/**
 * Get zone definition by ID.
 */
export function getZone(id: string): ZoneDefinition | undefined {
  return zoneDefinitions.find((z) => z.id === id);
}

/** Document reference for the source drawing */
export const zoneDefinitionDocument = {
  number: "Y727-300-003-11",
  sheet: "01",
  revision: "F",
  title: "Zone Definition Plan",
  fullNumber: "Y727-300-003-11-01",
  fileName: "Y727-300-003-11-01-F-Zone_Definition_Plan.pdf",
};
