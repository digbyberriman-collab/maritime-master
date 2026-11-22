/**
 * The legal signature pad is a Daylight paper surface in every theme (gap/10
 * DS23), like the ISM pad: the ink is the canvas's computed text colour, so a
 * `.light` ancestor makes it dark ink on white, and the stored PNG reads on a
 * white PDF page and in either theme. jsdom does not resolve CSS variables,
 * so the structure is asserted rather than the colour.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const inkMock = vi.hoisted(() => ({ recolour: vi.fn() }));
vi.mock('@/modules/legal/lib/signatureInk', () => ({ recolourSignatureInk: inkMock.recolour }));

import { SignatureField } from '@/modules/legal/components/forms/SignatureField';

const STORED = 'data:image/png;base64,V0hJVEU=';

describe('legal SignatureField', () => {
  let getContext: ReturnType<typeof vi.spyOn>;
  const ctx = { clearRect: vi.fn(), drawImage: vi.fn() };

  beforeEach(() => {
    document.documentElement.className = 'dark';
    inkMock.recolour.mockReset().mockResolvedValue('data:image/png;base64,SU5LRUQ=');
    // jsdom has no canvas implementation.
    getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    getContext.mockRestore();
    document.documentElement.className = '';
  });

  it('draws on a .light paper surface while the app is dark', () => {
    render(<SignatureField id="sig" value={null} onChange={() => undefined} />);
    const pad = screen.getByRole('img', { name: 'Signature pad' });
    expect(document.documentElement).toHaveClass('dark');
    const paper = pad.parentElement?.closest('.light');
    expect(paper, 'the canvas has a .light ancestor inside the dark page').not.toBeNull();
    expect(paper).not.toBe(document.documentElement);
    expect(paper).toHaveClass('bg-card');
    // The ink is the canvas's own text colour: Daylight foreground under `.light`.
    expect(pad).toHaveClass('text-foreground');
    expect(pad).toHaveClass('bg-card');
  });

  it('reopens a stored signature on paper, re-inked in the pad colour for display only', async () => {
    const onChange = vi.fn();
    render(<SignatureField id="sig" value={{ name: 'Test Officer', acknowledged: true, signedAt: '2026-01-05T10:00:00Z', image: STORED }} onChange={onChange} readOnly />);
    const pad = screen.getByRole('img', { name: 'Signature pad' });
    expect(pad.parentElement?.closest('.light')).not.toBeNull();
    await vi.waitFor(() => expect(inkMock.recolour).toHaveBeenCalledTimes(1));
    expect(inkMock.recolour.mock.calls[0][0]).toBe(STORED);
    expect(typeof inkMock.recolour.mock.calls[0][1]).toBe('string');
    // Display only: the stored value is not rewritten.
    expect(onChange).not.toHaveBeenCalled();
  });
});
