// AIS Provider Types

export interface AISPosition {
  mmsi: string;
  latitude: number;
  longitude: number;
  sog: number; // Speed over ground (knots)
  cog: number; // Course over ground (degrees)
  heading?: number;
  navStatus: string;
  timestampUtc: Date;
}

export interface AISProvider {
  name: string;
  fetchPositions(mmsiList: string[]): Promise<AISPosition[]>;
  fetchPosition(mmsi: string): Promise<AISPosition | null>;
  healthCheck(): Promise<boolean>;
}

export interface CachedPosition {
  position: AISPosition;
  cachedAt: Date;
}

export interface AISProviderConfig {
  provider: 'marinetraffic' | 'vesselfinder' | 'aisstream';
  apiKey: string;
  baseUrl?: string;
  cacheTtlMinutes?: number;
}

export interface AISRefreshRequest {
  vesselIds?: string[];
  mmsiList?: string[];
  forceRefresh?: boolean;
}

export interface AISRefreshResponse {
  success: boolean;
  positionsUpdated: number;
  errors?: string[];
}

// Navigation status codes (IMO standard)
export const NAV_STATUS_CODES: Record<number, string> = {
  0: 'Under way using engine',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by her draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Engaged in fishing',
  8: 'Under way sailing',
  9: 'Reserved for future use',
  10: 'Reserved for future use',
  11: 'Power-driven vessel towing astern',
  12: 'Power-driven vessel pushing ahead',
  13: 'Reserved for future use',
  14: 'AIS-SART (active)',
  15: 'Undefined',
};

export function getNavStatusText(code: number): string {
  return NAV_STATUS_CODES[code] || 'Unknown';
}
