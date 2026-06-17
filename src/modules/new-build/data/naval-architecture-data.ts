/**
 * Naval Architecture data extracted from Lateral Naval Architects calculations for Y727.
 */

export interface NavalArchDocument {
  id: string;
  oceanco_ref: string;
  title: string;
  report: string;
  issue: string;
  date: string;
  author: string;
  description: string;
}

export interface LoadingCondition {
  name: string;
  displacement: number;
  draught: number;
  trim_deg: number;
  trim_m: number;
  heel_deg: number;
  lcg: number;
  vcg_f: number;
  tcg: number;
  gmt_f: number;
  roll_period?: number;
}

export interface SpeedPowerPoint {
  speed: number;
  power: number;
  label?: string;
}

export interface RangePoint {
  speed: number;
  range: number;
  fuel_consumption: number;
}

export interface VolumeBreakdown {
  category: string;
  items: { name: string; volume: number; note?: string }[];
  total: number;
}

// ── Principal Particulars ──
export const principalParticulars = {
  loa: 132.35,
  lwl: 128.7,
  beam_moulded: 21.6,
  hull_depth: 6.725,
  frame_spacing: 0.65,
  slwl_draught: 6.1,
  displacement_slwl: 10419,
  displacement_half_load: 9554,
  complement: 75,
  crew: 67,
  guests: 8,
  gt_incl_overhangs: 12457,
  gt_excl_overhangs: 12332,
};

// ── Gross Tonnage ──
export const grossTonnage = {
  gt_incl_overhangs: 12457,
  gt_excl_overhangs: 12332,
  report: "835-73 Issue B",
  date: "09/04/2026",
  hull_volume: 25834,
  superstructure_volume: 14974,
  additional_volume: 2075,
  volumes: [
    { name: "Hull below FLWL", value: 9604 },
    { name: "Hull FLWL to MD", value: 9962 },
    { name: "Hull above MD", value: 1928 },
    { name: "Tier I Deckhouse", value: 4340 },
    { name: "Tier II", value: 6003 },
    { name: "Tier III", value: 5189 },
    { name: "Tier IV", value: 3359 },
    { name: "Tier V", value: 290 },
    { name: "Masts", value: 132 },
    { name: "Tier I Additional (enclosed)", value: 124 },
    { name: "Tier II Additional (enclosed)", value: 55 },
    { name: "Tier III Additional (basketball court)", value: 1250 },
    { name: "Tier IV Additional (winter garden)", value: 439 },
    { name: "Tier V Additional (windbreaks fwd)", value: 206 },
  ],
  references: [
    "Y727-020-001-11-01 [H] General Arrangement",
    "Y727-010-020-11-01 B Concept Arrangement Drawing",
    "Y727-027-000-10-01 H Monaco 3D Model",
    "Y727-010-027-10-01 A Hull Lines",
    "Y727-010-027-10-03 C Appendage Arrangement 3D",
    "Y727-027-100-10-01 B Moulded Deck Definition",
  ],
};

// ── Speed & Range ──
export const speedRange = {
  top_speed_kn: 18.53,
  contract_top_speed_kn: 17.5,
  range_at_13kn_500t: 7512,
  range_at_13kn_max_fuel: 10235,
  spec_range_nm: 6000,
  contract_fuel_t: 500,
  max_fuel_capacity_t: 681.3,
  fuel_for_6000nm_m3: 475.4,
  guest_cruise_speed: 17.34,
  crew_cruise_speed: 17.46,
  pods: "2 × ABB DO1250P @ 4200kW MCR each",
  generators: "3 × MAN 16V175D-MEV, 170kW/cyl @ 1800rpm",
  hotel_load_whr_kw: 1233,
  report: "835-77 Issue B",
  date: "19/03/2026",
  speed_power: [
    { speed: 10, power: 1100 },
    { speed: 11, power: 1500 },
    { speed: 12, power: 1900 },
    { speed: 13, power: 2400 },
    { speed: 14, power: 3100 },
    { speed: 15, power: 3900 },
    { speed: 16, power: 4900 },
    { speed: 17, power: 6000 },
    { speed: 17.34, power: 6430, label: "Guest Cruise @ 77% MCR" },
    { speed: 17.46, power: 6599, label: "Crew Cruise @ 79% MCR" },
    { speed: 18.28, power: 7890, label: "Guest Cruise @ 94% MCR" },
    { speed: 18.53, power: 8400, label: "Top Speed @ 100% MCR" },
  ] as SpeedPowerPoint[],
  range_500t: [
    { speed: 10, range: 9100, fuel_consumption: 600 },
    { speed: 11, range: 8700, fuel_consumption: 750 },
    { speed: 12, range: 8200, fuel_consumption: 950 },
    { speed: 13, range: 7512, fuel_consumption: 1200 },
    { speed: 14, range: 6800, fuel_consumption: 1450 },
    { speed: 15, range: 6000, fuel_consumption: 1750 },
    { speed: 16, range: 5500, fuel_consumption: 2050 },
    { speed: 17, range: 5000, fuel_consumption: 2350 },
    { speed: 18, range: 4200, fuel_consumption: 2600 },
  ] as RangePoint[],
  range_max: [
    { speed: 10, range: 12400, fuel_consumption: 600 },
    { speed: 11, range: 11800, fuel_consumption: 900 },
    { speed: 12, range: 11100, fuel_consumption: 1250 },
    { speed: 13, range: 10235, fuel_consumption: 1450 },
    { speed: 14, range: 9300, fuel_consumption: 1750 },
    { speed: 15, range: 8300, fuel_consumption: 2050 },
    { speed: 16, range: 7300, fuel_consumption: 2350 },
    { speed: 17, range: 6600, fuel_consumption: 2600 },
    { speed: 18, range: 5800, fuel_consumption: 2800 },
  ] as RangePoint[],
};

// ── Equipment Number ──
export const equipmentNumber = {
  en: 1592,
  en_band: "D†",
  classification: "LR Ship Rules",
  report: "581-52 Issue B",
  date: "19/03/2026",
  profile_area: 2026,
  profile_area_margin: "2%",
  deck_heights: [
    { label: "SLWL to Lower Deck", height: 0.625 },
    { label: "Lower Deck to Main Deck", height: 3.34 },
    { label: "Main Deck to Upper Deck", height: 3.34 },
    { label: "Upper Deck to Officers Deck", height: 3.495 },
    { label: "Officers Deck to Bridge Deck", height: 3.43 },
    { label: "Bridge Deck to Crows Nest", height: 3.41 },
    { label: "Crows Nest to House Top", height: 3.47 },
  ],
  total_height: 21.11,
  anchors: { number: 2, mass_kg: 4890, chain_length_m: 550 },
  mooring_lines: { number: 5, length_m: 190, breaking_load_kn: 362 },
  towline: { length_m: 220, breaking_load_kn: 941 },
};

// ── Loading Conditions ──
export const loadingConditions: LoadingCondition[] = [
  { name: "Stat. FL Departure", displacement: 10287, draught: 6.1, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 55.535, vcg_f: 8.983, tcg: -0.004, gmt_f: 1.944, roll_period: 12.414 },
  { name: "Spec. Full Load", displacement: 9851, draught: 5.911, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 55.9, vcg_f: 9.31, tcg: -0.003, gmt_f: 1.816, roll_period: 12.929 },
  { name: "Spec. Half Load", displacement: 9559, draught: 5.784, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 56.166, vcg_f: 9.474, tcg: -0.003, gmt_f: 1.799, roll_period: 13.048 },
  { name: "Spec. Half Load + WB", displacement: 9851, draught: 5.911, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 55.899, vcg_f: 9.244, tcg: -0.004, gmt_f: 1.882, roll_period: 12.699 },
  { name: "Stat. Arrival", displacement: 9410, draught: 5.719, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 56.309, vcg_f: 9.569, tcg: -0.002, gmt_f: 1.783, roll_period: 13.138 },
  { name: "Stat. Arrival + WB", displacement: 9851, draught: 5.911, trim_deg: 0, trim_m: 0, heel_deg: 0, lcg: 55.899, vcg_f: 9.206, tcg: -0.003, gmt_f: 1.919, roll_period: 12.575 },
  { name: "Lightship", displacement: 8635, draught: 5.381, trim_deg: 0.06, trim_m: 0.13, heel_deg: -0.056, lcg: 56.869, vcg_f: 9.875, tcg: -0.003, gmt_f: 1.936 },
];

// ── Lightship Weight ──
export const lightshipWeight = {
  unmargined_t: 7819.9,
  margin_pct: 10.4,
  margined_t: 8634.8,
  lcg: 56.869,
  tcg: -0.003,
  report: "833-58 Issue B",
  date: "23/02/2026",
};

// ── Hull Weight ──
export const hullWeight = {
  class_2: {
    unmargined_t: 3302.5,
    margin_pct: 7,
    margined_t: 3533.7,
    density_kg_m3: 127,
    lcg: 53.117,
    vcg: 6.534,
    tcg: -0.046,
  },
  breakdown: [
    { section: "Hull Below Main Deck", unmargined: 2579.8, margined: 2760.4, density: 131 },
    { section: "Hull Above Main Deck", unmargined: 149.6, margined: 160.0, density: 77 },
    { section: "Tier I Aft", unmargined: 222.5, margined: 238.1, density: 127 },
    { section: "Tier I Mid", unmargined: 184.0, margined: 196.9, density: 129 },
    { section: "Tier I Fwd", unmargined: 166.6, margined: 178.3, density: 145 },
  ],
  report: "833-61 Issue A",
  date: "17/03/2026",
};

// ── Freeboard ──
export const freeboard = {
  required_mm: 356,
  actual_mm: 625,
  loadline_length: 123.542,
  freeboard_depth: 6.725,
  report: "835-78 Issue B",
  date: "16/02/2026",
};

// ── Documents list ──
export const navalArchDocuments: NavalArchDocument[] = [
  { id: "1", oceanco_ref: "Y727-010-021-19-01", title: "Gross Tonnage Calculation", report: "835-73 Issue B", issue: "B", date: "09/04/2026", author: "Lateral Naval Architects", description: "Preliminary GT calculation based on Designer Model Rev H. GT incl. overhangs = 12,457." },
  { id: "2", oceanco_ref: "Y727-010-023-19-01", title: "Speed & Range Calculation", report: "835-77 Issue B", issue: "B", date: "19/03/2026", author: "Lateral Naval Architects", description: "Power prediction based on MARIN self-propulsion tests. Top speed 18.53kn, range 7,512nm @ 13kn." },
  { id: "3", oceanco_ref: "Y727-010-320-19-01", title: "Equipment Number Calculation", report: "581-52 Issue B", issue: "B", date: "19/03/2026", author: "Lateral Naval Architects", description: "Equipment Numeral per LR Ship Rules. EN = 1592, Band D†." },
  { id: "4", oceanco_ref: "Y727-010-024-19-01", title: "Loading Conditions", report: "833-59 Issue A", issue: "A", date: "27/03/2026", author: "Lateral Naval Architects", description: "Design loading conditions including statutory departure/arrival, spec full/half load, and lightship." },
  { id: "5", oceanco_ref: "Y727-010-029-19-02", title: "Hull Weight Calculation", report: "833-61 Issue A", issue: "A", date: "17/03/2026", author: "Lateral Naval Architects", description: "Class II NAPA steel structure weight. Margined total = 3,533.7t." },
  { id: "6", oceanco_ref: "Y727-010-022-19-01", title: "Freeboard Calculation", report: "835-78 Issue B", issue: "B", date: "16/02/2026", author: "Lateral Naval Architects", description: "Freeboard per ICLL 1966/88. Required = 356mm, actual = 625mm." },
  { id: "7", oceanco_ref: "Y727-010-029-19-01", title: "Lightship Weight Calculation", report: "833-58 Issue B", issue: "B", date: "23/02/2026", author: "Lateral Naval Architects", description: "Preliminary lightship weight. Margined total = 8,634.8t (10.4% margin)." },
  { id: "8", oceanco_ref: "Y727-010-022-11-01", title: "Freeboard Plan", report: "Drawing", issue: "B", date: "16/02/2026", author: "Lateral Naval Architects", description: "Longitudinal freeboard plan showing sheer line, superstructure extents, and position 1/2 definitions." },
];
