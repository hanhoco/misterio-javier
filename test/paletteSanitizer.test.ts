import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DECODER_SATURATION_FLOOR,
  DECODER_VALUE_FLOOR,
  HUE_SAFETY_MARGIN,
  SANITIZED_SATURATION,
  hsvToRgb,
  isDecodableSignal,
  nearestSafeHue,
  rgbToHsv,
  sanitizeColor,
  sanitizePalette,
} from '../src/poster/paletteSanitizer';
import {
  RESERVED_HUES,
  RESERVED_HUE_TOLERANCE,
  SEAL_COLORS,
  hueDistance,
  isReservedHue,
} from '../src/poster/seal';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

interface Pixel {
  label: string;
  /** The reserved hue this sample was built around, or null when it is safe art. */
  band: number | null;
  rgb: [number, number, number];
  /** True when the decoder would classify it, i.e. the sanitiser must move it. */
  dangerous: boolean;
}

/**
 * Every reserved band, sampled across its whole width and at several values.
 *
 * `dangerous` is decided by asking `isDecodableSignal` about the rounded 8-bit
 * colour, not by how the sample was constructed. Quantising a colour built on a
 * band edge can nudge its hue a fraction of a degree out of the band, and a
 * fixture that insisted otherwise would be testing its own arithmetic rather
 * than the sanitiser. `the 'covers every reserved band' test` keeps that honesty from
 * quietly turning into a vacuous test.
 */
function bandPixels(): Pixel[] {
  const pixels: Pixel[] = [];
  for (const reserved of RESERVED_HUES) {
    for (let offset = -RESERVED_HUE_TOLERANCE; offset <= RESERVED_HUE_TOLERANCE; offset += 5) {
      for (const saturation of [0.6, 0.8, 1]) {
        for (const value of [0.5, 0.75, 1]) {
          const hue = ((reserved + offset) % 360 + 360) % 360;
          const [r, g, b] = hsvToRgb(hue, saturation, value);
          const rgb: [number, number, number] = [Math.round(r), Math.round(g), Math.round(b)];
          const measured = rgbToHsv(rgb[0], rgb[1], rgb[2]);
          pixels.push({
            label: `hue ${hue} sat ${saturation} val ${value}`,
            band: reserved,
            rgb,
            dangerous: isDecodableSignal(measured.h, measured.s, measured.v),
          });
        }
      }
    }
  }

  // The seal colours themselves: the exact thing the decoder is looking for.
  for (let index = 0; index < SEAL_COLORS.length; index += 1) {
    const hex = SEAL_COLORS[index];
    const rgb: [number, number, number] = [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
    const measured = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    pixels.push({
      label: `seal colour ${hex}`,
      band: RESERVED_HUES[index],
      rgb,
      dangerous: isDecodableSignal(measured.h, measured.s, measured.v),
    });
  }

  return pixels;
}

/** Only the samples the decoder really would classify. */
function dangerousPixels(): Pixel[] {
  return bandPixels().filter((pixel) => pixel.dangerous);
}

/** Colours the sanitiser must not touch, one per reason it is already safe. */
function safePixels(): Pixel[] {
  const pixels: Pixel[] = [
    { label: 'pure white', band: null, rgb: [255, 255, 255], dangerous: false },
    { label: 'pure black', band: null, rgb: [0, 0, 0], dangerous: false },
    { label: 'mid grey', band: null, rgb: [128, 128, 128], dangerous: false },
  ];

  // In a reserved band, but too dull for the decoder to classify.
  for (const reserved of RESERVED_HUES) {
    const [r, g, b] = hsvToRgb(reserved, DECODER_SATURATION_FLOOR - 0.1, 0.9);
    pixels.push({
      label: `dull ${reserved}`,
      band: reserved,
      rgb: [Math.round(r), Math.round(g), Math.round(b)],
      dangerous: false,
    });
    // In a reserved band and vivid, but too dark for the decoder to classify.
    const [dr, dg, db] = hsvToRgb(reserved, 1, DECODER_VALUE_FLOOR - 0.1);
    pixels.push({
      label: `dark ${reserved}`,
      band: reserved,
      rgb: [Math.round(dr), Math.round(dg), Math.round(db)],
      dangerous: false,
    });
  }

  // Vivid, but nowhere near a reserved hue.
  for (const hue of [0, 60, 130, 240, 265, 350]) {
    if (isReservedHue(hue)) continue;
    const [r, g, b] = hsvToRgb(hue, 1, 1);
    pixels.push({
      label: `vivid ${hue}`,
      band: null,
      rgb: [Math.round(r), Math.round(g), Math.round(b)],
      dangerous: false,
    });
  }

  return pixels;
}

/** Lays the fixture out as a one-pixel-tall image the sanitiser can walk. */
function toImage(pixels: readonly Pixel[]): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((pixel, index) => {
    data[index * 4] = pixel.rgb[0];
    data[index * 4 + 1] = pixel.rgb[1];
    data[index * 4 + 2] = pixel.rgb[2];
    data[index * 4 + 3] = 255;
  });
  return { width: pixels.length, height: 1, data };
}

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe('nearestSafeHue', () => {
  it('moves every reserved hue clear of every band, with the safety margin', () => {
    for (let hue = 0; hue < 360; hue += 0.5) {
      const safe = nearestSafeHue(hue);
      assert.ok(safe >= 0 && safe < 360, `hue ${hue} mapped outside 0-360: ${safe}`);

      if (!isReservedHue(hue)) {
        assert.equal(safe, hue, `hue ${hue} was safe already and should not move`);
        continue;
      }

      for (const reserved of RESERVED_HUES) {
        assert.ok(
          hueDistance(safe, reserved) >= RESERVED_HUE_TOLERANCE + HUE_SAFETY_MARGIN - 1e-9,
          `hue ${hue} -> ${safe} still sits near reserved hue ${reserved}`,
        );
      }
    }
  });
});

describe('palette sanitiser', () => {
  it('covers every reserved band with pixels the decoder really would read', () => {
    // Guards the fixture, not the sanitiser: if quantisation ever pushed a whole
    // band's samples out of the decoder's reach, the tests below would pass on
    // an empty set and prove nothing.
    for (const reserved of RESERVED_HUES) {
      const covered = bandPixels().filter(
        (pixel) => pixel.band === reserved && pixel.dangerous,
      ).length;
      assert.ok(covered >= 5, `band ${reserved} contributed only ${covered} live samples`);
    }
  });

  it('leaves no pixel the decoder could classify', () => {
    const pixels = [...bandPixels(), ...safePixels()];
    const image = toImage(pixels);

    const stats = sanitizePalette(image);
    assert.equal(stats.scanned, pixels.length);

    const offenders: string[] = [];
    for (let index = 0; index < pixels.length; index += 1) {
      const i = index * 4;
      const { h, s, v } = rgbToHsv(image.data[i], image.data[i + 1], image.data[i + 2]);
      if (isDecodableSignal(h, s, v)) {
        offenders.push(
          `${pixels[index].label} -> hue ${h.toFixed(1)} sat ${s.toFixed(3)} val ${v.toFixed(3)}`,
        );
      }
    }

    assert.deepEqual(offenders, [], 'pixels survived the sanitiser inside a reserved band');
  });

  it('recolours exactly the dangerous pixels and leaves safe ones byte-identical', () => {
    const pixels = [...bandPixels(), ...safePixels()];
    const image = toImage(pixels);
    const before = Uint8ClampedArray.from(image.data);

    const stats = sanitizePalette(image);
    assert.equal(
      stats.recolored,
      pixels.filter((pixel) => pixel.dangerous).length,
      'the sanitiser moved a different number of pixels than were dangerous',
    );

    for (let index = 0; index < pixels.length; index += 1) {
      if (pixels[index].dangerous) continue;
      const i = index * 4;
      assert.deepEqual(
        [image.data[i], image.data[i + 1], image.data[i + 2]],
        [before[i], before[i + 1], before[i + 2]],
        `${pixels[index].label} was already safe and must not be touched`,
      );
    }
  });

  it('preserves the shading: HSV value survives every recolour', () => {
    // Value is the channel the artwork's light and shadow live in. Hue may
    // rotate and saturation may drop, but a sanitised illustration that lost
    // its values would come back as a flat, unreadable smear.
    const failures: string[] = [];

    for (const pixel of dangerousPixels()) {
      const original = rgbToHsv(pixel.rgb[0], pixel.rgb[1], pixel.rgb[2]);
      const result = sanitizeColor(pixel.rgb[0], pixel.rgb[1], pixel.rgb[2]);
      assert.equal(result.changed, true, `${pixel.label} should have been recoloured`);

      const after = rgbToHsv(
        Math.round(result.rgb[0]),
        Math.round(result.rgb[1]),
        Math.round(result.rgb[2]),
      );
      // One 8-bit level is 1/255 = 0.0039; allow two for the round trip.
      if (Math.abs(after.v - original.v) > 2 / 255) {
        failures.push(
          `${pixel.label}: value ${original.v.toFixed(4)} -> ${after.v.toFixed(4)}`,
        );
      }
    }

    assert.deepEqual(failures, []);
  });

  it('takes whichever escape route moves the colour least', () => {
    // A colour sitting at the very edge of a band is one or two degrees from
    // safety, so rotating is obviously cheaper than halving its saturation.
    const edgeHue = RESERVED_HUES[0] + RESERVED_HUE_TOLERANCE;
    const [er, eg, eb] = hsvToRgb(edgeHue, 1, 1);
    const edge = sanitizeColor(Math.round(er), Math.round(eg), Math.round(eb));
    assert.equal(edge.hueRotated, true, 'an edge colour should rotate, not desaturate');

    // A colour dead in the centre of a band would have to travel the full
    // half-width plus the margin; dropping saturation is the smaller move.
    const [cr, cg, cb] = hsvToRgb(RESERVED_HUES[0], 0.6, 1);
    const center = sanitizeColor(Math.round(cr), Math.round(cg), Math.round(cb));
    assert.equal(center.hueRotated, false, 'a band-centre colour should desaturate');
    const after = rgbToHsv(
      Math.round(center.rgb[0]),
      Math.round(center.rgb[1]),
      Math.round(center.rgb[2]),
    );
    assert.ok(
      after.s <= SANITIZED_SATURATION + 0.01,
      `desaturated pixel kept saturation ${after.s.toFixed(3)}`,
    );
  });
});
