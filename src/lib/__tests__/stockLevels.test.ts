import { describe, it, expect } from 'vitest';
import { getStockStatus, getStockPercent } from '../maintenanceConstants';

describe('getStockStatus', () => {
  it('reports comfortable stock as ok', () => {
    expect(getStockStatus(10, 4)).toBe('ok');
  });

  it('reports an empty shelf as out', () => {
    expect(getStockStatus(0, 4)).toBe('out');
  });

  it('reports stock below the reorder point as low', () => {
    expect(getStockStatus(2, 4)).toBe('low');
  });

  it('treats reaching the reorder point as low, not ok', () => {
    // The reorder point is the level at which ordering starts, so landing on it
    // is already a reorder signal.
    expect(getStockStatus(4, 4)).toBe('low');
    expect(getStockStatus(5, 4)).toBe('ok');
  });

  it('prefers out over low when both could apply', () => {
    expect(getStockStatus(0, 10)).toBe('out');
  });

  describe('with no reorder point set', () => {
    it('reports any stock as ok', () => {
      expect(getStockStatus(1, 0)).toBe('ok');
      expect(getStockStatus(500, 0)).toBe('ok');
    });

    it('still reports an empty shelf as out', () => {
      expect(getStockStatus(0, 0)).toBe('out');
    });
  });

  it('treats a negative quantity as out rather than in stock', () => {
    // Bad data should not read as healthy stock.
    expect(getStockStatus(-3, 4)).toBe('out');
  });

  it('ignores a negative reorder point', () => {
    expect(getStockStatus(5, -1)).toBe('ok');
  });
});

describe('getStockPercent', () => {
  it('scales stock against the reorder point', () => {
    expect(getStockPercent(2, 4)).toBe(50);
    expect(getStockPercent(1, 4)).toBe(25);
  });

  it('is zero for an empty shelf', () => {
    expect(getStockPercent(0, 4)).toBe(0);
  });

  it('caps at one hundred when stock exceeds the reorder point', () => {
    expect(getStockPercent(40, 4)).toBe(100);
  });

  it('is exactly one hundred at the reorder point', () => {
    expect(getStockPercent(4, 4)).toBe(100);
  });

  it('never divides by zero when no reorder point is set', () => {
    // A bare division would give NaN here and render an empty progress bar.
    expect(getStockPercent(5, 0)).toBe(100);
    expect(getStockPercent(0, 0)).toBe(0);
  });

  it('always returns a finite number between zero and one hundred', () => {
    const cases: Array<[number, number]> = [
      [0, 0],
      [0, 5],
      [5, 0],
      [3, 7],
      [100, 1],
      [-2, 5],
      [5, -2],
    ];

    for (const [quantity, minimum] of cases) {
      const percent = getStockPercent(quantity, minimum);
      expect(Number.isFinite(percent), `${quantity}/${minimum} is not finite`).toBe(true);
      expect(percent).toBeLessThanOrEqual(100);
    }
  });
});

describe('status and percentage agree', () => {
  it('shows a full bar only for parts that are ok', () => {
    const cases: Array<[number, number]> = [
      [10, 4],
      [4, 4],
      [2, 4],
      [0, 4],
      [1, 0],
      [0, 0],
    ];

    for (const [quantity, minimum] of cases) {
      const status = getStockStatus(quantity, minimum);
      const percent = getStockPercent(quantity, minimum);

      if (status === 'out') {
        expect(percent, `${quantity}/${minimum} is out but shows stock`).toBe(0);
      }
      if (percent === 0) {
        expect(status, `${quantity}/${minimum} shows nothing but is not out`).toBe('out');
      }
    }
  });
});
