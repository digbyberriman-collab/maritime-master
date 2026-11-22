/**
 * Signature ink normalisation (gap/10 DS23: paper stays light).
 *
 * A drawn signature is one ink colour with alpha on a transparent background,
 * so refilling every inked pixel with a single colour (`source-in`) keeps the
 * strokes and their anti-aliasing exactly. Signatures captured before the pad
 * became a paper surface were drawn in the dark theme's near-white ink; this
 * makes them (and any other stored signature) read on a white PDF page and on
 * the paper pad.
 */

/** Factories for the image and offscreen canvas, injectable so tests can run without a canvas. */
export interface SignatureInkDeps {
  createImage: () => HTMLImageElement;
  createCanvas: () => HTMLCanvasElement;
}

const browserDeps: SignatureInkDeps = {
  createImage: () => new Image(),
  createCanvas: () => document.createElement('canvas'),
};

function loadImage(src: string, createImage: SignatureInkDeps['createImage']): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = createImage();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The signature image could not be read.'));
    image.src = src;
  });
}

/**
 * Redraw a stored signature PNG (data URL) in `colour` (any CSS colour) and
 * return it as a new PNG data URL. The caller names the ink: the PDF passes
 * its body text colour, the pad its own computed text colour, so this module
 * carries no literal colour. Rejects if the image cannot be decoded or no 2D
 * canvas exists, so callers can fall back to the original image.
 */
export async function recolourSignatureInk(dataUrl: string, colour: string, deps: Partial<SignatureInkDeps> = {}): Promise<string> {
  const { createImage, createCanvas } = { ...browserDeps, ...deps };
  const image = await loadImage(dataUrl, createImage);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error('The signature image is empty.');

  const canvas = createCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas is available to redraw the signature.');

  ctx.drawImage(image, 0, 0, width, height);
  // Keep the ink's alpha, replace its colour.
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}
