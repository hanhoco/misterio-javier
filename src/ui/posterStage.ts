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
 * `fit()` exists because a viewer built before its container is in the document
 * measures a zero-sized box. The screen calls it from `mounted()`.
 */

import { PosterViewer } from '../viewer/posterViewer';
import { button, element } from './dom';

export interface PosterStageOptions {
  poster: HTMLCanvasElement;
  /** Extra class for the stage, e.g. the shorter practice stage. */
  stageClass?: string;
  /** Fires after a zoom-in, so the tutorial can tick its zoom step off. */
  onZoomIn?: () => void;
}

export interface PosterStage {
  root: HTMLElement;
  viewer: PosterViewer;
  /** Fits the poster to the stage. Only meaningful once mounted. */
  fit(): void;
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
  controls.append(zoomOut, zoomIn, fitButton, scaleLabel);

  const refreshScale = () => {
    scaleLabel.textContent = `Zoom: ${viewer.getScale().toFixed(2)}x`;
  };

  zoomIn.addEventListener('click', () => {
    viewer.zoomIn();
    refreshScale();
    options.onZoomIn?.();
  });
  zoomOut.addEventListener('click', () => {
    viewer.zoomOut();
    refreshScale();
  });
  fitButton.addEventListener('click', () => {
    viewer.fitToView();
    refreshScale();
  });
  stage.addEventListener('wheel', () => refreshScale(), { passive: true });

  root.append(stage, controls);

  return {
    root,
    viewer,
    fit() {
      viewer.fitToView();
      refreshScale();
    },
  };
}
