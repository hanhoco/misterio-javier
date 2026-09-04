/**
 * A minimal PNG decoder, test-only.
 *
 * The round-trip test is only worth anything if it runs against the real
 * illustration's pixels. There is no image library in this project's dependency
 * tree and we are not adding one, so this reads the one PNG flavour the source
 * artwork actually is - 8-bit truecolour, no interlacing - using nothing but
 * Node's built-in zlib.
 *
 * It is deliberately strict: anything it was not written for throws, rather
 * than quietly decoding to garbage that would make a test lie.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import type { ImageDataLike } from '../src/validation/sealDecoder';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const COLOR_TYPE_RGB = 2;
const COLOR_TYPE_RGBA = 6;

/** Reverses one row's filter, in place, given the already-decoded row above. */
function unfilterRow(
  filter: number,
  row: Uint8Array,
  previous: Uint8Array,
  bytesPerPixel: number,
): void {
  const length = row.length;

  switch (filter) {
    case 0:
      return;
    case 1:
      for (let i = bytesPerPixel; i < length; i += 1) {
        row[i] = (row[i] + row[i - bytesPerPixel]) & 0xff;
      }
      return;
    case 2:
      for (let i = 0; i < length; i += 1) {
        row[i] = (row[i] + previous[i]) & 0xff;
      }
      return;
    case 3:
      for (let i = 0; i < length; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        row[i] = (row[i] + ((left + previous[i]) >> 1)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < length; i += 1) {
        const a = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const b = previous[i];
        const c = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        row[i] = (row[i] + predictor) & 0xff;
      }
      return;
    default:
      throw new Error(`Unsupported PNG row filter: ${filter}`);
  }
}

/** Decodes an 8-bit, non-interlaced truecolour PNG into RGBA pixels. */
export function decodePng(filePath: string): ImageDataLike {
  const file = readFileSync(filePath);

  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (file[i] !== PNG_SIGNATURE[i]) throw new Error(`${filePath} is not a PNG`);
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  let offset = PNG_SIGNATURE.length;
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
      if (colorType !== COLOR_TYPE_RGB && colorType !== COLOR_TYPE_RGBA) {
        throw new Error(`Unsupported PNG colour type: ${colorType}`);
      }
      if (data[12] !== 0) throw new Error('Interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (width === 0 || height === 0) throw new Error(`${filePath} has no IHDR`);

  const channels = colorType === COLOR_TYPE_RGBA ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    throw new Error(`${filePath}: expected ${expected} filtered bytes, got ${raw.length}`);
  }

  const out = new Uint8ClampedArray(width * height * 4);
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const row = new Uint8Array(raw.subarray(rowStart + 1, rowStart + 1 + stride));
    unfilterRow(filter, row, previous, channels);

    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 4;
      out[target] = row[source];
      out[target + 1] = row[source + 1];
      out[target + 2] = row[source + 2];
      out[target + 3] = channels === 4 ? row[source + 3] : 255;
    }

    previous = row;
  }

  return { width, height, data: out };
}
