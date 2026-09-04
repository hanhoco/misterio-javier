/**
 * What a screen is allowed to ask the app for.
 *
 * Screens never reach for `localStorage`, never load the poster themselves and
 * never decide what comes next: they call these. That is what keeps a screen a
 * screen and lets the shell own persistence and navigation in one place.
 */

import type { GameProgress } from '../../game/gameState';
import type { LoadedPoster } from '../../poster/posterSource';
import type { SoundBoard } from '../sound';

export interface ScreenContext {
  /** Always the current progress, never a stale copy. */
  getProgress(): GameProgress;
  /**
   * Persists new progress without touching the DOM.
   *
   * Deliberately not a re-render: a screen that has just shown "¡Encontraste la
   * pista!" needs to keep that on screen until the child presses continue.
   */
  save(next: GameProgress): void;
  /** Rebuilds the screen for wherever the progress now points. */
  refresh(): void;
  /** The park poster, loaded once for the whole session. */
  poster(): Promise<LoadedPoster>;
  sound: SoundBoard;
  /** Plays the tutorial again, then comes back here. */
  replayTraining(): void;
  /** Leaves the run and goes back to the name screen. */
  changeProfile(): void;
}

export interface Screen {
  root: HTMLElement;
  /**
   * Called once the root is in the document.
   *
   * Anything that measures the page has to wait for this. A screen builds its
   * DOM detached, so a poster viewer constructed in the factory would measure a
   * zero-sized box and fit the poster to nothing.
   */
  mounted?(): void;
  destroy(): void;
}
