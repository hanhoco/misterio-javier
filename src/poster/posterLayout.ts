/**
 * The poster's native pixel size.
 *
 * It lives in its own module because both the catalogue (`posterData.ts`) and
 * the architecture (`facade.ts`) need it, and the catalogue imports the
 * architecture. One tiny module breaks that cycle.
 */

export const POSTER_WIDTH = 2400;
export const POSTER_HEIGHT = 1600;
