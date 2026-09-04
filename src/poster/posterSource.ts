/**
 * The two posters the app can play on, behind one interface.
 *
 * The park poster is the game. It is the user's own illustration and it is what
 * loads by default. The procedural poster stays reachable because its palette
 * guard, its determinism and its seal round-trip are the regression suite that
 * proves the decoder still works, and losing that to a UI decision would be a
 * bad trade - but it is a fallback, not an equal choice.
 */

import parkSourceUrl from '../../assets/park-source.png';

import {
  PARK_TARGETS,
  findParkTargetBySealCode,
} from './parkPosterData';
import {
  POSTER_OBJECTS,
  findObjectBySealCode,
  type PosterTarget,
} from './posterData';
import { renderImagePoster, renderImagePosterBackground } from './imagePoster';
import { renderPoster } from './posterRenderer';

export type PosterSourceId = 'park' | 'procedural';

export interface LoadedPoster {
  id: PosterSourceId;
  /** User facing name, Spanish. */
  label: string;
  canvas: HTMLCanvasElement;
  targets: readonly PosterTarget[];
  findBySealCode: (code: number) => PosterTarget | undefined;
}

/** Order matters: the first entry is the default the app opens on. */
export const POSTER_SOURCES: ReadonlyArray<{ id: PosterSourceId; label: string }> = [
  { id: 'park', label: 'Parque' },
  { id: 'procedural', label: 'Procedural (respaldo)' },
];

/** The URL of the park illustration, resolved by the bundler. */
export const PARK_SOURCE_URL: string = parkSourceUrl;

export async function loadPoster(id: PosterSourceId): Promise<LoadedPoster> {
  if (id === 'procedural') {
    return {
      id,
      label: 'Procedural (respaldo)',
      canvas: renderPoster(),
      targets: POSTER_OBJECTS,
      findBySealCode: findObjectBySealCode,
    };
  }

  const { canvas } = await renderImagePoster({ sourceUrl: PARK_SOURCE_URL });
  return {
    id: 'park',
    label: 'Parque',
    canvas,
    targets: PARK_TARGETS,
    findBySealCode: findParkTargetBySealCode,
  };
}

/** The park poster without its seals: what the marking tool draws boxes over. */
export function loadParkBackground(): Promise<HTMLCanvasElement> {
  return renderImagePosterBackground({ sourceUrl: PARK_SOURCE_URL });
}
