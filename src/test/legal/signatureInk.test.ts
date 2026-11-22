/**
 * Signature ink (gap/10 DS23: paper stays light). The recolour helper refills
 * a stored signature's ink in one colour (`source-in` keeps the alpha), and
 * the submission PDF re-inks every drawn signature before placing it, falling
 * back to the original image if that fails.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  addImage: vi.fn(),
  save: vi.fn(),
  setTextColor: vi.fn(),
  recolour: vi.fn(),
}));

vi.mock('@/lib/pdf', () => ({
  createPDFTemplate: () => ({
    internal: { pageSize: { getWidth: () => 210 } },
    setFontSize: () => undefined,
    setFont: () => undefined,
    setTextColor: pdfMocks.setTextColor,
    splitTextToSize: (text: string) => [text],
    text: () => undefined,
    addImage: pdfMocks.addImage,
    save: pdfMocks.save,
  }),
  getContentStartY: () => 30,
  getContentEndY: () => 280,
  addPageWithFooter: () => undefined,
}));

vi.mock('@/modules/legal/lib/signatureInk', () => ({ recolourSignatureInk: pdfMocks.recolour }));

import type { SignatureInkDeps } from '@/modules/legal/lib/signatureInk';
import { PDF_INK, exportSubmissionPdf } from '@/modules/legal/lib/pdf';
import type { FormSchema } from '@/modules/legal/lib/forms';

const { recolourSignatureInk } = await vi.importActual<typeof import('@/modules/legal/lib/signatureInk')>(
  '@/modules/legal/lib/signatureInk',
);

const WHITE_INK = 'data:image/png;base64,V0hJVEU=';

interface Ctx2d {
  drawImage: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  globalCompositeOperation: string;
  fillStyle: string;
}

/** An image that "decodes" on the next microtask, or fails to. */
function fakeImageFactory({ fail = false, width = 600, height = 180 } = {}) {
  const created: { src: string }[] = [];
  const createImage = () => {
    const image = {
      onload: null as null | (() => void),
      onerror: null as null | (() => void),
      naturalWidth: width,
      naturalHeight: height,
      width,
      height,
      set src(value: string) {
        created.push({ src: value });
        queueMicrotask(() => (fail ? image.onerror?.() : image.onload?.()));
      },
    };
    return image as unknown as HTMLImageElement;
  };
  return { createImage, created };
}

/** A canvas whose 2D context records what was drawn and in which compositing state. */
function fakeCanvasFactory({ noContext = false } = {}) {
  const fills: { op: string; style: string; rect: number[] }[] = [];
  const ctx: Ctx2d = {
    drawImage: vi.fn(),
    fillRect: vi.fn((...rect: number[]) => fills.push({ op: ctx.globalCompositeOperation, style: ctx.fillStyle, rect })),
    globalCompositeOperation: 'source-over',
    fillStyle: '#000000',
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => (noContext ? null : ctx)),
    toDataURL: vi.fn(() => 'data:image/png;base64,UkVJTktFRA=='),
  };
  const createCanvas = () => canvas as unknown as HTMLCanvasElement;
  return { createCanvas, canvas, ctx, fills };
}

describe('recolourSignatureInk', () => {
  it('draws the stored PNG, then refills only its ink with the colour (source-in)', async () => {
    const images = fakeImageFactory();
    const canvases = fakeCanvasFactory();
    const deps: SignatureInkDeps = { createImage: images.createImage, createCanvas: canvases.createCanvas };

    const out = await recolourSignatureInk(WHITE_INK, '#111827', deps);

    expect(images.created).toEqual([{ src: WHITE_INK }]);
    expect(canvases.canvas.width).toBe(600);
    expect(canvases.canvas.height).toBe(180);
    expect(canvases.ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(canvases.ctx.drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 600, 180]);
    // The fill happens after the image is drawn, in source-in, over the whole canvas.
    expect(canvases.ctx.drawImage.mock.invocationCallOrder[0]).toBeLessThan(canvases.ctx.fillRect.mock.invocationCallOrder[0]);
    expect(canvases.fills).toEqual([{ op: 'source-in', style: '#111827', rect: [0, 0, 600, 180] }]);
    expect(canvases.canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(out).toBe('data:image/png;base64,UkVJTktFRA==');
  });

  it('accepts any CSS colour, e.g. the computed ink of the pad', async () => {
    const canvases = fakeCanvasFactory();
    await recolourSignatureInk(WHITE_INK, 'rgb(14, 20, 29)', { createImage: fakeImageFactory().createImage, createCanvas: canvases.createCanvas });
    expect(canvases.fills[0].style).toBe('rgb(14, 20, 29)');
  });

  it('rejects when the image cannot be decoded, so callers keep the original', async () => {
    await expect(
      recolourSignatureInk(WHITE_INK, '#111827', { createImage: fakeImageFactory({ fail: true }).createImage, createCanvas: fakeCanvasFactory().createCanvas }),
    ).rejects.toThrow(/could not be read/);
  });

  it('rejects when there is no 2D canvas', async () => {
    await expect(
      recolourSignatureInk(WHITE_INK, '#111827', { createImage: fakeImageFactory().createImage, createCanvas: fakeCanvasFactory({ noContext: true }).createCanvas }),
    ).rejects.toThrow(/2D canvas/);
  });

  it('rejects an empty image', async () => {
    await expect(
      recolourSignatureInk(WHITE_INK, '#111827', { createImage: fakeImageFactory({ width: 0, height: 0 }).createImage, createCanvas: fakeCanvasFactory().createCanvas }),
    ).rejects.toThrow(/empty/);
  });
});

describe('exportSubmissionPdf re-inks drawn signatures', () => {
  const schema: FormSchema = {
    title: 'Crew agreement',
    fields: [
      { id: 'name', type: 'text', label: 'Name' },
      { id: 'sig', type: 'signature', label: 'Signature' },
    ],
  };
  const args = {
    templateName: 'Crew agreement',
    versionNumber: 2,
    schema,
    data: { name: 'Test Officer', sig: { name: 'Test Officer', acknowledged: true, signedAt: '2026-01-05T10:00:00Z', image: WHITE_INK } },
    submittedBy: 'Test Officer',
    submittedFor: null,
    submittedAt: '2026-01-05T10:00:00Z',
    status: 'submitted',
    reference: 'SUB-00000001',
  };

  beforeEach(() => {
    pdfMocks.addImage.mockReset();
    pdfMocks.save.mockReset();
    pdfMocks.setTextColor.mockReset();
    pdfMocks.recolour.mockReset();
  });
  afterEach(() => vi.restoreAllMocks());

  it('places the re-inked image in the PDF ink colour, then saves', async () => {
    pdfMocks.recolour.mockResolvedValue('data:image/png;base64,SU5LRUQ=');
    const pending = exportSubmissionPdf(args);
    expect(pending).toBeInstanceOf(Promise);
    await pending;
    expect(pdfMocks.recolour).toHaveBeenCalledWith(WHITE_INK, PDF_INK);
    expect(pdfMocks.setTextColor).toHaveBeenCalledWith(PDF_INK);
    expect(pdfMocks.addImage).toHaveBeenCalledTimes(1);
    expect(pdfMocks.addImage.mock.calls[0][0]).toBe('data:image/png;base64,SU5LRUQ=');
    expect(pdfMocks.addImage.mock.calls[0][1]).toBe('PNG');
    expect(pdfMocks.save).toHaveBeenCalledWith('SUB-00000001.pdf');
  });

  it('falls back to the original image when re-inking fails', async () => {
    pdfMocks.recolour.mockRejectedValue(new Error('no canvas'));
    await exportSubmissionPdf(args);
    expect(pdfMocks.addImage.mock.calls[0][0]).toBe(WHITE_INK);
    expect(pdfMocks.save).toHaveBeenCalled();
  });

  it('leaves forms without a drawn signature alone', async () => {
    await exportSubmissionPdf({ ...args, data: { name: 'Test Officer', sig: { name: 'Test Officer', acknowledged: true, signedAt: '', image: null } } });
    expect(pdfMocks.recolour).not.toHaveBeenCalled();
    expect(pdfMocks.addImage).not.toHaveBeenCalled();
  });
});
