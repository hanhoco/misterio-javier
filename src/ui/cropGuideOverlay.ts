/**
 * The crop guide, drawn.
 *
 * `src/viewer/cropGuide.ts` owns the rectangle and the rules; this file owns
 * the pixels, the animation and the one behaviour that everything else depends
 * on - vanishing before the screenshot is taken.
 *
 * WHY IT IS DRAWN ON THE VIEWER'S CANVAS. A positioned DOM element over the
 * canvas would have to be told about every pan and every zoom, and would lag
 * both by a frame. `PosterViewer.setOverlayRenderer` runs inside the same
 * render that draws the poster, with the same transform, so the guide cannot
 * drift from the artwork it is drawn over - not on a drag, not on a wheel, not
 * on a monitor change.
 *
 * WINDOW BLUR. `Windows + Shift + S` takes focus away from the browser, and
 * that is the only reliable signal that the snipping overlay is up. Any blur
 * clears the guide instantly - no transition, no fade - and it comes back on
 * focus. A dashed rectangle inside the child's crop would be drawn straight
 * over the artwork the decoder has to read, which is the same reason the
 * walkthrough tears its scrim down on the snip step.
 *
 * REDUCED MOTION. The dashes march by moving `lineDashOffset` on a slow timer.
 * Under `prefers-reduced-motion: reduce` the timer never starts and the dashes
 * are simply static, which loses nothing: the rectangle is the message.
 */

import type { PosterTarget } from '../poster/posterData';
import {
  CROP_GUIDE_COLORS,
  CROP_GUIDE_LABEL,
  isCropGuideVisible,
  preciseCropBox,
  toScreenRect,
  type GuideRect,
} from '../viewer/cropGuide';
import type { PosterViewer } from '../viewer/posterViewer';

/** Dash pattern of the marching ants, in CSS pixels. */
const DASH_PATTERN: readonly [number, number] = [16, 12];

/** One full cycle of that pattern, which the phase wraps at. */
const DASH_CYCLE = DASH_PATTERN[0] + DASH_PATTERN[1];

/** The continuous dark rail under the dashes. */
const RAIL_WIDTH = 6;

/** The light dashes on top of it. */
const DASH_WIDTH = 3;

/**
 * How the ants march: a small step, seldom.
 *
 * Every step is a full poster redraw, and the poster is 5.4 megapixels. At 60fps
 * that is a busy loop on a school laptop for an animation nobody asked to be
 * smooth, so it runs at about nine steps a second. It reads as a gentle crawl,
 * which is what a "look here" cue should be next to a child who is
 * concentrating on something else.
 */
const DASH_STEP_PX = 3;
const DASH_FRAME_MS = 110;

/** Gap between the guide and its label, and the label's own padding. */
const LABEL_GAP = 8;
const LABEL_PADDING_X = 10;
const LABEL_PADDING_Y = 6;
const LABEL_RADIUS = 7;
const LABEL_FONT = 'bold 15px "Trebuchet MS", system-ui, sans-serif';

export interface CropGuideOptions {
  viewer: PosterViewer;
  /** The object the child has been asked to find. */
  target: Pick<PosterTarget, 'x' | 'y' | 'width' | 'height'>;
  /** Guided mode. Defaults to on, which is the classroom default. */
  guidedMode?: boolean;
}

export interface CropGuideHandle {
  setGuidedMode(enabled: boolean): void;
  /** Whether the guide was drawn on the most recent frame. */
  isVisible(): boolean;
  /** Its box in CSS pixels inside the viewer canvas, or null when hidden. */
  screenRect(): GuideRect | null;
  destroy(): void;
}

/** True when the machine is running under a "no animation, please" setting. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** A rounded rectangle path, without depending on `ctx.roundRect`. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export function attachCropGuide(options: CropGuideOptions): CropGuideHandle {
  const { viewer, target } = options;
  const posterBox = preciseCropBox(target);

  let guidedMode = options.guidedMode ?? true;
  let hiddenForSnip = false;
  let visible = false;
  let lastRect: GuideRect | null = null;
  let dashPhase = 0;
  let ticker: ReturnType<typeof setInterval> | null = null;
  const animated = !prefersReducedMotion();

  function stopTicker(): void {
    if (ticker === null) return;
    clearInterval(ticker);
    ticker = null;
  }

  function syncTicker(): void {
    if (!animated) return;
    if (visible && ticker === null) {
      ticker = setInterval(() => {
        dashPhase = (dashPhase + DASH_STEP_PX) % DASH_CYCLE;
        viewer.render();
      }, DASH_FRAME_MS);
      return;
    }
    if (!visible) stopTicker();
  }

  function drawLabel(ctx: CanvasRenderingContext2D, rect: GuideRect, viewport: GuideRect): void {
    ctx.font = LABEL_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const textWidth = ctx.measureText(CROP_GUIDE_LABEL).width;
    const width = textWidth + LABEL_PADDING_X * 2;
    const height = 15 + LABEL_PADDING_Y * 2;

    // Above the box by preference; tucked just inside its top edge when there
    // is no room above, which happens whenever the child has the object near
    // the top of the stage.
    const above = rect.y - LABEL_GAP - height;
    const y = above >= 0 ? above : Math.max(0, rect.y + LABEL_GAP);
    const x = Math.max(0, Math.min(viewport.width - width, rect.x));

    ctx.fillStyle = CROP_GUIDE_COLORS.labelBackground;
    roundedRectPath(ctx, x, y, width, height, LABEL_RADIUS);
    ctx.fill();

    ctx.fillStyle = CROP_GUIDE_COLORS.labelText;
    ctx.fillText(CROP_GUIDE_LABEL, x + LABEL_PADDING_X, y + height / 2 + 1);
  }

  viewer.setOverlayRenderer((ctx, view) => {
    const viewport = viewer.viewportSize();
    const targetRect = toScreenRect(target, view);

    visible = isCropGuideVisible({
      guidedMode,
      hiddenForSnip,
      effectiveScale: viewer.getEffectiveScale(),
      targetRect,
      viewport,
    });
    syncTicker();

    if (!visible) {
      lastRect = null;
      return;
    }

    const rect = toScreenRect(posterBox, view);
    lastRect = rect;

    // The dark rail first, continuous, so the outline never breaks up over
    // bright sky; then the light dashes marching along it.
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    ctx.lineWidth = RAIL_WIDTH;
    ctx.strokeStyle = CROP_GUIDE_COLORS.rail;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

    ctx.lineWidth = DASH_WIDTH;
    ctx.strokeStyle = CROP_GUIDE_COLORS.dash;
    ctx.setLineDash([...DASH_PATTERN]);
    ctx.lineDashOffset = -dashPhase;
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;

    drawLabel(ctx, rect, { x: 0, y: 0, ...viewport });
  });

  /*
   * Instantly, and with no transition. The child has already pressed
   * Windows + Shift + S by the time this runs.
   */
  const onBlur = () => {
    hiddenForSnip = true;
    viewer.render();
  };
  const onFocus = () => {
    hiddenForSnip = false;
    viewer.render();
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);

  return {
    setGuidedMode(enabled) {
      if (guidedMode === enabled) return;
      guidedMode = enabled;
      viewer.render();
    },
    isVisible: () => visible,
    screenRect: () => (lastRect ? { ...lastRect } : null),
    destroy() {
      stopTicker();
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      viewer.setOverlayRenderer(null);
    },
  };
}
