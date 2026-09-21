import { describe, expect, it } from 'vitest';
import { findVesselBySlug, vesselSlug } from '@/modules/vessels/lib/vesselSlug';

describe('vesselSlug', () => {
  it('drops the yacht prefix and hyphenates the rest', () => {
    expect(vesselSlug('M/Y DRAAK')).toBe('draak');
    expect(vesselSlug('M/Y GAME CHANGER')).toBe('game-changer');
    expect(vesselSlug('R/V DAGON')).toBe('dagon');
    expect(vesselSlug('S/Y Sea Breeze')).toBe('sea-breeze');
  });

  it('handles names without a prefix and stray punctuation', () => {
    expect(vesselSlug('Fleet-Wide')).toBe('fleet-wide');
    expect(vesselSlug('  Inkfish  ')).toBe('inkfish');
    expect(vesselSlug('M/Y  Lady   Anne!')).toBe('lady-anne');
  });

  it('finds a vessel by its slug, case-insensitively', () => {
    const vessels = [{ name: 'M/Y LEVIATHAN' }, { name: 'R/V HYDRA' }];
    expect(findVesselBySlug(vessels, 'leviathan')?.name).toBe('M/Y LEVIATHAN');
    expect(findVesselBySlug(vessels, 'HYDRA')?.name).toBe('R/V HYDRA');
    expect(findVesselBySlug(vessels, 'nonesuch')).toBeUndefined();
  });
});
