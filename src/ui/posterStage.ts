/**
 * The picture and its zoom controls, as one component.
 *
 * Every screen that shows a poster shows exactly this, which is what keeps the
 * stage, the buttons, the scale readout and - most importantly - the "Recorta
 * aquí" marker identical in the tutorial, in the drills and in all fifteen
 * missions.
 *
 * On the marker. Nothing else on the page tells a child that the screenshot is
 * taken of the poster *as it appears in their own browser window*, and that is
 * the one genuinely hard idea in the whole exercise. So it is not a tooltip and
 * not a one-time coach mark: it is a permanent label on the frame, because it
 * is permanently true.
 *
 * It is anchored BOTTOM-RIGHT, and that corner is not a matter of taste. Of the
 * four corners of the park poster at its opening fit, three sit on a findable
 * object - the kite top-left, the school top-right, the blue picnic blanket
 * bottom-left - and a marker on top of mission one's own target is worse than
 * no marker at all. Bottom-right is the only corner clear of all fifteen. It is
 * also `pointer-events: none`, so it can never swallow the drag that pans the
 * poster underneath it.
 *
 * On the readiness light. The zoom the poster opens at is not necessarily a
 * zoom a crop can be read at, and a child has no way of knowing that: the seals
 * are meant to be hard to see. So the stage says so out loud, live, next to the
 * "+" button - red until the poster is close enough, green from there on. It is
 * derived from the seal geometry in `zoomReadiness.ts` and never from a number
 * typed in here, because a number typed in here is exactly what shipped broken.
 *
 * It is driven by the EFFECTIVE scale (CSS scale x device pixel ratio), which
 * is what the child's screenshot will contain. Driving it from the zoom label
 * would reproduce the original bug with a green light on top of it.
 *
 * `fit()` exists because a viewer built before its container is in the document
 * measures a zero-sized box. The screen calls it from `mounted()`.
 */

import { PosterViewer, type ViewerScaleState } from '../viewer/posterViewer';
import {
  ZOOM_READINESS_COPY,
  zoomReadiness,
  type ZoomReadiness,
} from '../viewer/zoomReadiness';
import { isDevToolsRequested } from './devMode';
import { button, element } from './dom';

export interface PosterStageOptions {
  poster: HTMLCanvasElement;
  /** Extra class for the stage, e.g. the shorter practice stage. */
  stageClass?: string;
  /** Fires after a zoom-in, so the tutorial can tick its zoom step off. */
  onZoomIn?: () => void;
  /**
   * Show the live "can I crop yet?" traffic light beside the zoom buttons.
   *
   * Opt-in, and taken up by the two screens where a child hunts a seal on a
   * poster big enough to open below the readable floor: the mission screen and
   * the tutorial. The drills sit on a small practice picture that opens well
   * above the floor, and one of them is a copy-the-card exercise where zoom is
   * not the variable at all - a light that is always green there would only
   * teach a child to stop reading it. See `zoomReadiness.ts`.
   */
  showReadiness?: boolean;
}

export interface PosterStage {
  root: HTMLElement;
  viewer: PosterViewer;
  /** Fits the poster to the stage. Only meaningful once mounted. */
  fit(): void;
  /** Where the current zoom falls against the readable floor. */
  readiness(): ZoomReadiness;
}

export function createPosterStage(options: PosterStageOptions): PosterStage {
  const root = element('div', 'stage');

  const stage = element(
    'div',
    `poster-viewer__stage${options.stageClass ? ` ${options.stageClass}` : ''}`,
  );

  const marker = element('div', 'snip-marker');
  marker.appendChild(element('span', 'snip-marker__icon', '✂'));
  marker.appendChild(element('span', 'snip-marker__text', 'Recorta aquí'));
  stage.appendChild(marker);

  const viewer = new PosterViewer(stage, options.poster);

  const controls = element('div', 'poster-viewer__controls');
  const zoomOut = button('−', 'button button--round');
  const zoomIn = button('+', 'button button--round');
  const fitButton = button('Ver todo', 'button button--ghost button--small');
  zoomOut.setAttribute('aria-label', 'Alejar');
  zoomIn.setAttribute('aria-label', 'Acercar');
  const scaleLabel = element('span', 'poster-viewer__scale', '');

  /*
   * The readiness light.
   *
   * It sits in the controls row rather than in a bar of its own, and that is
   * deliberate on a 1366x768 school laptop: the mission screen has to hold the
   * picture and the paste target on screen at once, so a new row of chrome
   * would come straight out of the poster's height. Here it costs nothing and
   * still lands exactly where the child is already looking - on the "+" button
   * it is asking them to press.
   */
  const readinessChip = element('p', 'zoom-ready');
  readinessChip.setAttribute('role', 'status');
  readinessChip.setAttribute('aria-live', 'polite');
  const readinessBadge = element('span', 'zoom-ready__badge', '');
  const readinessLabel = element('span', 'zoom-ready__label', '');
  const readinessHint = element('span', 'zoom-ready__hint', '');
  readinessChip.append(readinessBadge, readinessLabel, readinessHint);

  /*
   * The three numbers the next classroom report will be diagnosed from.
   *
   * The last one is the only one that decides anything, and it is the one no
   * screen was showing when a Retina laptop quietly passed a test that
   * twenty-eight school laptops could not. Behind `?dev=1`, like the marking
   * tool: a teacher should never see it, and whoever answers the next report
   * should never have to guess it.
   */
  const debugLabel = element('span', 'poster-viewer__debug', '');
  const showDebug = isDevToolsRequested();

  const showReadiness = options.showReadiness ?? false;
  controls.append(zoomOut, zoomIn, fitButton);
  if (showReadiness) controls.appendChild(readinessChip);
  controls.appendChild(scaleLabel);
  if (showDebug) controls.appendChild(debugLabel);

  let currentReadiness: ZoomReadiness = 'too-far';

  const refresh = (state: ViewerScaleState) => {
    scaleLabel.textContent = `Zoom: ${state.scale.toFixed(2)}x`;
    if (showDebug) {
      debugLabel.textContent =
        `CSS ${state.scale.toFixed(3)}x · DPR ${state.devicePixelRatio} · ` +
        `efectivo ${state.effectiveScale.toFixed(3)}x`;
    }

    // The EFFECTIVE scale, never the CSS one. See `zoomReadiness.ts`: the
    // screenshot is taken in device pixels, so a light driven by the zoom label
    // would go green on a machine that cannot deliver - and the child, who now
    // trusts it, would keep cropping and keep failing.
    currentReadiness = zoomReadiness(state.effectiveScale);
    const copy = ZOOM_READINESS_COPY[currentReadiness];
    readinessBadge.textContent = copy.badge;
    readinessLabel.textContent = copy.label;
    readinessHint.textContent = copy.hint;
    readinessChip.classList.toggle('is-ready', currentReadiness === 'ready');
    readinessChip.classList.toggle('is-too-far', currentReadiness === 'too-far');
    // The "+" button pulses while the poster is still too far away, so the
    // instruction and the thing to press are never two separate discoveries.
    zoomIn.classList.toggle('is-nudging', showReadiness && currentReadiness === 'too-far');
  };

  // Every scale change ends in a viewer render, including the resize-driven
  // first fit and a move to a monitor with a different pixel ratio, so one
  // listener covers the buttons, the wheel, the fit and the hardware alike.
  viewer.onScaleChange(refresh);

  zoomIn.addEventListener('click', () => {
    viewer.zoomIn();
    options.onZoomIn?.();
  });
  zoomOut.addEventListener('click', () => viewer.zoomOut());
  fitButton.addEventListener('click', () => viewer.fitToView());

  root.append(stage, controls);

  return {
    root,
    viewer,
    fit() {
      viewer.fitToView();
    },
    readiness: () => currentReadiness,
  };
}
