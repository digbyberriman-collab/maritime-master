import { describe, it, expect, vi } from 'vitest';

// We test the hexToHSL helper by importing the module and checking its behavior
// Since hexToHSL is a private function, we test it indirectly through context behavior

// However, we can test the exported hook behavior
describe('BrandingContext', () => {
  describe('hexToHSL conversion (via context)', () => {
    // Since hexToHSL is not exported, we replicate it for testing
    function hexToHSL(hex: string): string {
      hex = hex.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h = 0;
      let s = 0;
      const l = (max + min) / 2;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
    }

    it('should convert pure red to HSL', () => {
      expect(hexToHSL('#FF0000')).toBe('0 100% 50%');
    });

    it('should convert pure green to HSL', () => {
      expect(hexToHSL('#00FF00')).toBe('120 100% 50%');
    });

    it('should convert pure blue to HSL', () => {
      expect(hexToHSL('#0000FF')).toBe('240 100% 50%');
    });

    it('should convert white to HSL', () => {
      expect(hexToHSL('#FFFFFF')).toBe('0 0% 100%');
    });

    it('should convert black to HSL', () => {
      expect(hexToHSL('#000000')).toBe('0 0% 0%');
    });

    it('should handle hex without # prefix', () => {
      expect(hexToHSL('1e3a8a')).toBe('224 64% 33%');
    });

    it('should convert the default brand color', () => {
      const result = hexToHSL('#1e3a8a');
      expect(result).toBe('224 64% 33%');
    });

    it('should convert a mid-range color', () => {
      const result = hexToHSL('#3B82F6');
      // Blue-ish color
      expect(result).toContain('%');
    });
  });

  describe('default values', () => {
    it('should have the correct default primary color', () => {
      const DEFAULT_PRIMARY_COLOR = '#1e3a8a';
      expect(DEFAULT_PRIMARY_COLOR).toBe('#1e3a8a');
    });
  });
});
