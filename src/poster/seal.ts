/**
 * Seal geometry and palette: the single source of truth shared by the renderer
 * (which stamps seals onto the poster) and the decoder (which reads them back
 * out of a pasted screenshot). Nothing in this module touches the DOM, so it is
 * importable from plain Node for tests.
 */

/**
 * The four reserved seal colours. The poster illustration must NEVER use these
 * hues anywhere else: they are the decoder's only signal. See
 * `RESERVED_HUE_BANDS` and the scene-colour guard in `posterRenderer.ts`.
 *
 * Index order is the encoding order: magenta=0, cyan=1, lime=2, orange=3.
 */
export const SEAL_COLORS = ['#FF00E5', '#00E5FF', '#7CFF00', '#FF7A00'] as const;

/** Human readable names, used by the seal reference sheet. */
export const SEAL_COLOR_NAMES = ['magenta', 'cyan', 'lime', 'orange'] as const;

/** Hue (degrees, 0-360) of each reserved colour, in palette-index order. */
export const RESERVED_HUES = [306, 186, 91, 29] as const;

/** How many distinct colours a single dot can take. */
export const SEAL_COLOR_COUNT = SEAL_COLORS.length;

/** Number of dots per seal: 1 centre + 4 arms. */
export const SEAL_DOT_COUNT = 5;

/**
 * Distance from the centre dot to each arm dot, in poster-native pixels.
 *
 * Down from 15, so seventy-five seals stop reading as neon confetti thrown over
 * the user's artwork, but no lower than the moat allows. The centre core and an
 * arm core sit `SEAL_ARM_DISTANCE - 2 * SEAL_DOT_RADIUS` apart, and that gap
 * MUST stay at 2px or more at poster-native scale: at one pixel a resample to
 * 0.85x takes it sub-pixel, the two cores blend into one blob, and the
 * plus-shape is thrown away. Measured, red-cap failed at exactly that scale.
 *
 * 12 against a dot radius of 5 gives exactly that two-pixel moat. It also keeps
 * the arm-distance-to-dot-radius ratio the decoder brackets with
 * `ARM_SEARCH_*_RADII` at 12/5 = 2.4, comfortably inside [1.2, 3.5].
 *
 * Changing either this or `SEAL_DOT_RADIUS` moves the readable floor that the
 * zoom readiness indicator is derived from. See `src/viewer/zoomReadiness.ts`.
 */
export const SEAL_ARM_DISTANCE = 12;

/**
 * Radius of the coloured core of every dot, in poster-native pixels.
 *
 * This number, divided into the decoder's `MIN_READABLE_DOT_RADIUS_PX`, IS the
 * zoom at which a crop first becomes readable: at 4 the floor was 3/4 = 0.75x,
 * which is three presses of "+" above the zoom the viewer opens the park poster
 * at on a school laptop - a game a child cannot win. At 5 the floor is
 * 3/5 = 0.60x, one press away. Anything smaller reopens that hole.
 */
export const SEAL_DOT_RADIUS = 5;

/**
 * Width of the ring drawn around every dot. This is not decoration: it keeps
 * the pure colour core away from the surrounding artwork so that the bilinear
 * interpolation applied when a screenshot is scaled cannot bleed scene colours
 * into the core. It also creates a low-saturation moat between neighbouring
 * dots, which is what lets connected-component labelling split two
 * same-coloured adjacent dots apart. Do not remove it.
 */
export const SEAL_RING_WIDTH = 1.5;

/**
 * Colour of that ring: a mid grey.
 *
 * The ring's real job is to survive resampling as a moat the decoder will not
 * accept, so that connected-component labelling can still split two adjacent
 * cores. That constrains the colour more tightly than it first appears.
 *
 * Near-black was tried and it fails, for a reason worth writing down. HSV
 * saturation is `(max - min) / max`, so blending a saturated core toward black
 * scales every channel and leaves saturation almost untouched; the blended
 * pixel keeps passing `MIN_SATURATION` and the moat stops separating anything.
 * Measured, it lost seals at 0.85x and 1.05x on the dense poster.
 *
 * Blending toward a neutral grey collapses saturation the same way white does,
 * because a grey has no saturation of its own to contribute. So grey keeps the
 * technical guarantee white gave us while staying far quieter on a muted
 * illustration than a white halo ever could.
 */
export const SEAL_RING_COLOR = '#9AA0A6';

/** Outer radius of a dot including its protective ring. */
export const SEAL_DOT_OUTER_RADIUS = SEAL_DOT_RADIUS + SEAL_RING_WIDTH;

/** Total footprint of a seal (37x37 at poster-native scale). */
export const SEAL_FOOTPRINT =
  2 * (SEAL_ARM_DISTANCE + SEAL_DOT_OUTER_RADIUS);

/** Highest encodable code, exclusive: 4^5 = 1024 codes. */
export const SEAL_CODE_COUNT = SEAL_COLOR_COUNT ** SEAL_DOT_COUNT;

/**
 * Dot positions relative to the seal centre, in encoding order:
 * centre, up, right, down, left. Canvas coordinates (y grows downwards).
 */
export const SEAL_DOT_OFFSETS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: 0 },
  { dx: 0, dy: -SEAL_ARM_DISTANCE },
  { dx: SEAL_ARM_DISTANCE, dy: 0 },
  { dx: 0, dy: SEAL_ARM_DISTANCE },
  { dx: -SEAL_ARM_DISTANCE, dy: 0 },
];

/**
 * Hue windows the poster artwork must stay out of. The decoder accepts a hue
 * within +/-15 degrees of a reserved hue, so anything inside these bands could
 * be mistaken for a seal dot.
 */
export const RESERVED_HUE_TOLERANCE = 15;

export const RESERVED_HUE_BANDS = RESERVED_HUES.map((hue) => ({
  hue,
  min: hue - RESERVED_HUE_TOLERANCE,
  max: hue + RESERVED_HUE_TOLERANCE,
}));

/** Shortest angular distance between two hues, in degrees. */
export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b) % 360 + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

/** True when a hue falls inside any reserved band. */
export function isReservedHue(hue: number): boolean {
  return RESERVED_HUES.some((reserved) => hueDistance(hue, reserved) <= RESERVED_HUE_TOLERANCE);
}

/**
 * Digits of a seal, most significant first:
 * [centre, up, right, down, left], each 0-3.
 */
export type SealDigits = readonly [number, number, number, number, number];

/** Pack five base-4 digits into a single code (centre is most significant). */
export function encodeSealCode(digits: SealDigits): number {
  return digits.reduce((acc, digit) => {
    if (!Number.isInteger(digit) || digit < 0 || digit >= SEAL_COLOR_COUNT) {
      throw new RangeError(`Seal digit out of range: ${digit}`);
    }
    return acc * SEAL_COLOR_COUNT + digit;
  }, 0);
}

/** Unpack a code back into its five base-4 digits. */
export function decodeSealCode(code: number): SealDigits {
  if (!Number.isInteger(code) || code < 0 || code >= SEAL_CODE_COUNT) {
    throw new RangeError(`Seal code out of range: ${code}`);
  }
  const digits: number[] = [];
  let remaining = code;
  for (let i = 0; i < SEAL_DOT_COUNT; i += 1) {
    digits.unshift(remaining % SEAL_COLOR_COUNT);
    remaining = Math.floor(remaining / SEAL_COLOR_COUNT);
  }
  return digits as unknown as SealDigits;
}
