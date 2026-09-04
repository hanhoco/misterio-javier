/**
 * Test-only resampling helpers.
 *
 * `cropAndResize` stands in for the one step of the image-poster pipeline that
 * genuinely needs a browser: `ctx.drawImage(..., imageSmoothingQuality:
 * 'high')`. Bilinear interpolation is the same family of filter and produces
 * the same kind of soft, blended pixels, which is what the sanitiser and the
 * decoder are being tested against. Everything else in the pipeline - the crop
 * line, the poster geometry, the sanitiser, the seal plan, the seal geometry -
 * is the real production code.
 */

import type { ImageDataLike } from '../src/validation/sealDecoder';

/** Bilinear sample of `image` at a floating-point source coordinate. */
function sample(image: ImageDataLike, sx: number, sy: number, channel: number): number {
  const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(sy)));
  const x1 = Math.min(image.width - 1, x0 + 1);
  const y1 = Math.min(image.height - 1, y0 + 1);
  const tx = Math.max(0, Math.min(1, sx - x0));
  const ty = Math.max(0, Math.min(1, sy - y0));

  const p00 = image.data[(y0 * image.width + x0) * 4 + channel];
  const p10 = image.data[(y0 * image.width + x1) * 4 + channel];
  const p01 = image.data[(y1 * image.width + x0) * 4 + channel];
  const p11 = image.data[(y1 * image.width + x1) * 4 + channel];
  const top = p00 + (p10 - p00) * tx;
  const bottom = p01 + (p11 - p01) * tx;
  return top + (bottom - top) * ty;
}

/**
 * Crops `image` to its leftmost `cropWidth` columns and scales that crop to
 * `outWidth` x `outHeight`.
 */
export function cropAndResize(
  image: ImageDataLike,
  cropWidth: number,
  outWidth: number,
  outHeight: number,
): ImageDataLike {
  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  const stepX = cropWidth / outWidth;
  const stepY = image.height / outHeight;

  for (let y = 0; y < outHeight; y += 1) {
    const sy = (y + 0.5) * stepY - 0.5;
    for (let x = 0; x < outWidth; x += 1) {
      const sx = (x + 0.5) * stepX - 0.5;
      const target = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[target + channel] = sample(image, sx, sy, channel);
      }
      data[target + 3] = 255;
    }
  }

  return { width: outWidth, height: outHeight, data };
}

/** Bilinear magnification: what a zoomed-in screenshot of a poster looks like. */
export function upscaleImage(image: ImageDataLike, factor: number): ImageDataLike {
  const width = Math.round(image.width * factor);
  const height = Math.round(image.height * factor);
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    const sy = (y + 0.5) / factor - 0.5;
    for (let x = 0; x < width; x += 1) {
      const sx = (x + 0.5) / factor - 0.5;
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        data[target + channel] = sample(image, sx, sy, channel);
      }
      data[target + 3] = 255;
    }
  }

  return { width, height, data };
}

/** A rectangular region of an image, clamped to its bounds. */
export function cropImage(
  image: ImageDataLike,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageDataLike {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const w = Math.max(1, Math.min(Math.round(width), image.width - x0));
  const h = Math.max(1, Math.min(Math.round(height), image.height - y0));
  const data = new Uint8ClampedArray(w * h * 4);

  for (let row = 0; row < h; row += 1) {
    for (let column = 0; column < w; column += 1) {
      const source = ((y0 + row) * image.width + (x0 + column)) * 4;
      const target = (row * w + column) * 4;
      data[target] = image.data[source];
      data[target + 1] = image.data[source + 1];
      data[target + 2] = image.data[source + 2];
      data[target + 3] = 255;
    }
  }

  return { width: w, height: h, data };
}
