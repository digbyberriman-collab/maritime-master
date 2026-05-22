// Bucket vessel flag_state into a coarse region for the Fleet Dashboard mini-maps.
export type FleetRegion = {
  key: string;
  label: string;
  center: [number, number];
  zoom: number;
  flags: string[]; // ISO-2 / common names
};

export const FLEET_REGIONS: FleetRegion[] = [
  {
    key: 'med',
    label: 'Mediterranean',
    center: [41.5, 9.0],
    zoom: 4,
    flags: ['IT', 'FR', 'ES', 'MC', 'GR', 'MT', 'CY', 'TR', 'HR', 'GB', 'PT', 'GI'],
  },
  {
    key: 'us-east',
    label: 'US East Coast / Caribbean',
    center: [26.5, -78.0],
    zoom: 4,
    flags: ['US', 'BS', 'KY', 'BM', 'AG', 'JM', 'VG', 'DM', 'TC'],
  },
  {
    key: 'worldwide',
    label: 'Worldwide',
    center: [10, 30],
    zoom: 2,
    flags: [],
  },
];

// Normalize a free-text flag_state value to a region key.
export function regionForFlag(flag: string | null | undefined): string {
  if (!flag) return 'worldwide';
  const f = flag.trim().toUpperCase();
  for (const r of FLEET_REGIONS) {
    if (r.flags.includes(f)) return r.key;
    // try matching full country names embedded in the flag string
    if (
      r.flags.some((code) => {
        const names: Record<string, string[]> = {
          IT: ['ITALY'],
          FR: ['FRANCE'],
          ES: ['SPAIN'],
          MC: ['MONACO'],
          GR: ['GREECE'],
          MT: ['MALTA'],
          CY: ['CYPRUS'],
          TR: ['TURKEY', 'TURKIYE'],
          HR: ['CROATIA'],
          GB: ['UNITED KINGDOM', 'UK', 'BRITAIN'],
          PT: ['PORTUGAL', 'MADEIRA'],
          GI: ['GIBRALTAR'],
          US: ['UNITED STATES', 'USA', 'AMERICA'],
          BS: ['BAHAMAS'],
          KY: ['CAYMAN'],
          BM: ['BERMUDA'],
          AG: ['ANTIGUA'],
          JM: ['JAMAICA'],
          VG: ['BRITISH VIRGIN', 'BVI'],
          DM: ['DOMINICA'],
          TC: ['TURKS AND CAICOS'],
        };
        return names[code]?.some((n) => f.includes(n));
      })
    ) {
      return r.key;
    }
  }
  return 'worldwide';
}

// Deterministic pseudo-coordinates from vessel id, biased toward the region center.
function hash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function vesselCoord(id: string, region: FleetRegion): [number, number] {
  const h = hash(id);
  const dlat = ((h % 1000) / 1000 - 0.5) * 6; // +/- 3 deg
  const dlng = (((h / 1000) % 1000) / 1000 - 0.5) * 8; // +/- 4 deg
  return [region.center[0] + dlat, region.center[1] + dlng];
}