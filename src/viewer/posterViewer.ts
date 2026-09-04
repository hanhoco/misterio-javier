/**
 * Canvas zoom/pan viewer.
 *
 * We deliberately do NOT rely on the browser's own Ctrl+/Ctrl- zoom: the
 * verdict maths needs a scale we control and can reason about, and browser zoom
 * would silently change the relationship between poster pixels and screen
 * pixels behind our back.
 *
 * The viewer takes its poster size from the canvas it is handed rather than
 * from a constant, because the app can be showing either the procedural poster
 * (2400x1600) or the park poster (3000x1809), and the marking tool shows a
 * third thing again: the park poster before any seal is stamped on it.
 */

import {
  BUTTON_ZOOM_STEP,
  WHEEL_ZOOM_STEP,
  clampScale,
  computeFitScale,
} from './viewerGeometry';
import { effectiveCropScale } from './zoomReadiness';

/** How often the device pixel ratio is reconciled. See `ratioPoll`. */
const RATIO_POLL_MS = 1000;

/**
 * Everything a caller needs to say whether a crop taken right now can be read.
 *
 * `scale` is CSS pixels per poster pixel - what the zoom label shows and what
 * the child controls. `effectiveScale` is what the child's SCREENSHOT will
 * contain, because `Win + Shift + S` photographs device pixels. On a Retina
 * screen those differ by a factor of two, which is the whole reason the game
 * worked for the teacher and failed for the class.
 */
export interface ViewerScaleState {
  scale: number;
  devicePixelRatio: number;
  effectiveScale: number;
}

/** Something drawn on top of the poster in poster coordinates, per frame. */
export type OverlayRenderer = (
  ctx: CanvasRenderingContext2D,
  view: { scale: number; offsetX: number; offsetY: number },
) => void;


export class PosterViewer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private poster: HTMLCanvasElement;

  private overlay: OverlayRenderer | null = null;
  private panEnabled = true;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  /** Viewport size at the last resize, so a resize can keep the view centred. */
  private lastWidth = 0;
  private lastHeight = 0;
  /** False until a fit ran against a container that actually had a size. */
  private hasFitted = false;
  /**
   * Told whenever the scale changes, so the readiness indicator can be live.
   *
   * A listener rather than a return value from `zoomIn`, because the scale also
   * moves on the wheel, on "Ver todo", on a poster swap and on the first resize
   * that gives the container a real size - and a child who reaches a readable
   * zoom by spinning the wheel deserves the same green light as one who
   * pressed the button.
   */
  private scaleListener: ((state: ViewerScaleState) => void) | null = null;
  /** What the listener was last told, so pans do not spam it. */
  private notifiedScale = Number.NaN;
  private notifiedRatio = Number.NaN;
  /**
   * Watches `devicePixelRatio` for changes.
   *
   * It is not a constant. Drag the window from a Retina display to an external
   * monitor, or change Windows display scaling from 100% to 125%, and it moves
   * underneath a page that is already open - taking the readiness light's
   * answer with it. Reading it once at startup would leave a child looking at
   * a green light on a screen that can no longer deliver.
   */
  private ratioQuery: MediaQueryList | null = null;
  private readonly onRatioChange = () => {
    this.watchDevicePixelRatio();
    // The backing store is sized in device pixels, so a ratio change is a
    // resize in all but name.
    this.resize();
    this.render();
  };
  /**
   * Backstop for the ratio watch above.
   *
   * The `(resolution: Xdppx)` change event is the documented way to hear about
   * a monitor change, and it is not reliable enough on its own to bet a
   * classroom on: measured under Chrome's device-metrics emulation, the query's
   * `matches` flips correctly but no `change` event is ever delivered, and
   * neither `resize` nor the ResizeObserver reports the new ratio in the same
   * tick. A stale ratio means a green light on a machine that cannot deliver,
   * which is the failure this whole module exists to prevent.
   *
   * So the ratio is also reconciled on a slow timer. One number compared once a
   * second costs nothing measurable, and it closes every case the event misses.
   */
  private ratioPoll: ReturnType<typeof setInterval> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(container: HTMLElement, poster: HTMLCanvasElement) {
    this.poster = poster;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'poster-viewer__canvas';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.attachEvents();
    this.watchDevicePixelRatio();
    this.resize();
    this.fitToView();

    this.ratioPoll = setInterval(() => {
      if (this.getDevicePixelRatio() === this.notifiedRatio) return;
      this.onRatioChange();
    }, RATIO_POLL_MS);

    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      // A viewer built before its container was in the document measured a
      // zero-sized rect, and `fitToView` clamped the scale to MIN_SCALE - which
      // is how a 900px practice picture ended up opening at 0.15x in a box that
      // could have shown it at 1:1. The first resize that reports a real size
      // is the first honest chance to fit, so take it.
      if (!this.hasFitted) {
        this.fitToView();
        return;
      }
      this.clampOffsets();
      this.render();
    });
    this.resizeObserver.observe(container);
  }

  /**
   * Releases the observer, the ratio watch and its timer.
   *
   * Screens are torn down and rebuilt fifteen times over a lesson, so a viewer
   * that leaves a timer running behind it leaves fifteen.
   */
  destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.ratioQuery?.removeEventListener('change', this.onRatioChange);
    this.ratioQuery = null;
    if (this.ratioPoll !== null) clearInterval(this.ratioPoll);
    this.ratioPoll = null;
    this.scaleListener = null;
  }

  /** Current poster-pixels-to-CSS-pixels factor. */
  getScale(): number {
    return this.scale;
  }

  /** How many device pixels one CSS pixel currently is. Read live, never cached. */
  getDevicePixelRatio(): number {
    const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  }

  /** The scale the child's screenshot will actually carry. */
  getEffectiveScale(): number {
    return effectiveCropScale(this.scale, this.getDevicePixelRatio());
  }

  /** Scale, device pixel ratio and their product, as one snapshot. */
  getScaleState(): ViewerScaleState {
    const devicePixelRatio = this.getDevicePixelRatio();
    return {
      scale: this.scale,
      devicePixelRatio,
      effectiveScale: effectiveCropScale(this.scale, devicePixelRatio),
    };
  }

  /**
   * Registers the one listener that follows the scale, and fires it at once
   * with the current value so the caller never has to seed its own UI.
   */
  onScaleChange(listener: (state: ViewerScaleState) => void): void {
    this.scaleListener = listener;
    this.notifiedScale = Number.NaN;
    this.notifiedRatio = Number.NaN;
    this.notifyScale();
  }

  private notifyScale(): void {
    const state = this.getScaleState();
    if (state.scale === this.notifiedScale && state.devicePixelRatio === this.notifiedRatio) {
      return;
    }
    this.notifiedScale = state.scale;
    this.notifiedRatio = state.devicePixelRatio;
    this.scaleListener?.(state);
  }

  /**
   * Re-arms the device-pixel-ratio watch.
   *
   * A `(resolution: Xdppx)` query only ever reports leaving the ratio it was
   * built for, so it has to be rebuilt around the new ratio every time it
   * fires. `matchMedia` is absent in some embedded webviews; a viewer that
   * cannot watch the ratio still reads it live on every render, so it lags a
   * monitor change by one interaction rather than being wrong forever.
   */
  private watchDevicePixelRatio(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    this.ratioQuery?.removeEventListener('change', this.onRatioChange);
    this.ratioQuery = window.matchMedia(`(resolution: ${this.getDevicePixelRatio()}dppx)`);
    this.ratioQuery.addEventListener('change', this.onRatioChange);
  }

  /** Native width of the poster currently on screen. */
  get posterWidth(): number {
    return this.poster.width;
  }

  /** Native height of the poster currently on screen. */
  get posterHeight(): number {
    return this.poster.height;
  }

  /** Swaps the poster without losing the viewer or its listeners. */
  setPoster(poster: HTMLCanvasElement): void {
    this.poster = poster;
    this.fitToView();
  }

  /** Draws something on top of every frame, in CSS pixels. Null clears it. */
  setOverlayRenderer(overlay: OverlayRenderer | null): void {
    this.overlay = overlay;
    this.render();
  }

  /**
   * Turns pointer drag into panning, or leaves the pointer to the caller.
   *
   * The marking tool needs the drag gesture for drawing boxes, and a canvas
   * that both pans and draws on the same gesture is a canvas that does neither
   * predictably.
   */
  setPanEnabled(enabled: boolean): void {
    this.panEnabled = enabled;
    this.canvas.classList.toggle('is-drawing', !enabled);
    if (!enabled) this.dragging = false;
  }

  /** Converts a viewport point (a pointer event) into poster-native pixels. */
  posterPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale,
    };
  }

  /** Converts poster-native pixels into CSS pixels inside the viewer canvas. */
  screenPointFromPoster(x: number, y: number): { x: number; y: number } {
    return { x: x * this.scale + this.offsetX, y: y * this.scale + this.offsetY };
  }

  /**
   * The canvas box in CSS pixels.
   *
   * Read live rather than cached, for the same reason the device pixel ratio
   * is: the stage is resized by the window, by the rail growing a puzzle tile
   * and by a monitor change, and an overlay that has to answer "is this box
   * still on screen?" cannot be asking a stale number.
   */
  viewportSize(): { width: number; height: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  /**
   * Sizes the poster so the whole of it is on screen.
   *
   * A fit against a zero-sized rect is not a fit, it is a guess, so it is not
   * recorded: `hasFitted` stays false and the resize observer tries again the
   * moment the container has a real size.
   */
  fitToView(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    this.scale = clampScale(
      computeFitScale(rect.width, rect.height, this.posterWidth, this.posterHeight),
    );
    this.offsetX = (rect.width - this.posterWidth * this.scale) / 2;
    this.offsetY = (rect.height - this.posterHeight * this.scale) / 2;
    this.hasFitted = true;
    this.render();
  }

  /** The scale `fitToView` would choose right now, without changing anything. */
  fitScale(): number {
    const rect = this.canvas.getBoundingClientRect();
    return computeFitScale(rect.width, rect.height, this.posterWidth, this.posterHeight);
  }

  zoomBy(factor: number, anchorX?: number, anchorY?: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ax = anchorX ?? rect.width / 2;
    const ay = anchorY ?? rect.height / 2;

    const nextScale = clampScale(this.scale * factor);
    if (nextScale === this.scale) return;

    // Keep the poster point under the anchor pinned while the scale changes.
    const posterX = (ax - this.offsetX) / this.scale;
    const posterY = (ay - this.offsetY) / this.scale;
    this.scale = nextScale;
    this.offsetX = ax - posterX * this.scale;
    this.offsetY = ay - posterY * this.scale;

    this.clampOffsets();
    this.render();
  }

  zoomIn(): void {
    this.zoomBy(BUTTON_ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / BUTTON_ZOOM_STEP);
  }

  private attachEvents(): void {
    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        this.zoomBy(
          WHEEL_ZOOM_STEP ** -event.deltaY,
          event.clientX - rect.left,
          event.clientY - rect.top,
        );
      },
      { passive: false },
    );

    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.panEnabled) return;
      this.dragging = true;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.canvas.setPointerCapture(event.pointerId);
      this.canvas.classList.add('is-dragging');
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      this.offsetX += event.clientX - this.lastPointerX;
      this.offsetY += event.clientY - this.lastPointerY;
      this.lastPointerX = event.clientX;
      this.lastPointerY = event.clientY;
      this.clampOffsets();
      this.render();
    });

    const endDrag = (event: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      this.canvas.classList.remove('is-dragging');
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  /**
   * Sizes the backing store to device pixels so seals stay crisp on screen, and
   * keeps whatever was in the middle of the view in the middle of it.
   *
   * Offsets are measured from the container's top-left, so leaving them alone
   * across a resize would slide the poster towards that corner: widen the
   * window and a centred poster ends up left of centre. Shifting by half the
   * size change keeps the view where the user left it.
   */
  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));

    if (this.lastWidth > 0 && this.lastHeight > 0) {
      this.offsetX += (rect.width - this.lastWidth) / 2;
      this.offsetY += (rect.height - this.lastHeight) / 2;
    }
    this.lastWidth = rect.width;
    this.lastHeight = rect.height;
  }

  /** Never let the poster drift entirely off screen. */
  private clampOffsets(): void {
    const rect = this.canvas.getBoundingClientRect();
    const drawWidth = this.posterWidth * this.scale;
    const drawHeight = this.posterHeight * this.scale;
    const marginX = Math.min(rect.width * 0.5, drawWidth);
    const marginY = Math.min(rect.height * 0.5, drawHeight);
    this.offsetX = Math.min(rect.width - marginX, Math.max(marginX - drawWidth, this.offsetX));
    this.offsetY = Math.min(rect.height - marginY, Math.max(marginY - drawHeight, this.offsetY));
  }

  render(): void {
    const ratio = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.fillStyle = '#dfe7f2';
    this.ctx.fillRect(0, 0, rect.width, rect.height);

    // Smoothing on: it mimics what the OS screenshot tool does to the pixels,
    // and the white rings exist precisely to survive it.
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.ctx.drawImage(
      this.poster,
      this.offsetX,
      this.offsetY,
      this.posterWidth * this.scale,
      this.posterHeight * this.scale,
    );

    if (this.overlay) {
      this.ctx.save();
      this.overlay(this.ctx, {
        scale: this.scale,
        offsetX: this.offsetX,
        offsetY: this.offsetY,
      });
      this.ctx.restore();
    }

    // Every path that moves the scale ends in a render, so this is the one
    // place the readiness indicator has to be told from.
    this.notifyScale();
  }
}
