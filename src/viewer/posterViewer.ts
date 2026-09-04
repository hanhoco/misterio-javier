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

/** Something drawn on top of the poster in poster coordinates, per frame. */
export type OverlayRenderer = (
  ctx: CanvasRenderingContext2D,
  view: { scale: number; offsetX: number; offsetY: number },
) => void;

const MIN_SCALE = 0.15;
const MAX_SCALE = 8;
const WHEEL_ZOOM_STEP = 1.0015;

/**
 * How much one press of the + button changes the scale.
 *
 * 1.7, not the 1.35 this started at. From a whole-poster fit around 0.4x, a
 * 1.35 step needs five presses to reach 1:1 and a child gives up somewhere
 * around three; 1.7 gets there in two. The wheel keeps its own much finer step
 * because a wheel produces dozens of events per gesture.
 */
const BUTTON_ZOOM_STEP = 1.7;

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

  constructor(container: HTMLElement, poster: HTMLCanvasElement) {
    this.poster = poster;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'poster-viewer__canvas';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.ctx = ctx;

    this.attachEvents();
    this.resize();
    this.fitToView();

    new ResizeObserver(() => {
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
    }).observe(container);
  }

  /** Current poster-pixels-to-CSS-pixels factor. */
  getScale(): number {
    return this.scale;
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
   * Sizes the poster so the whole of it is on screen.
   *
   * A fit against a zero-sized rect is not a fit, it is a guess, so it is not
   * recorded: `hasFitted` stays false and the resize observer tries again the
   * moment the container has a real size.
   */
  fitToView(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const fitScale = Math.min(
      rect.width / this.posterWidth,
      rect.height / this.posterHeight,
    );
    this.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, fitScale));
    this.offsetX = (rect.width - this.posterWidth * this.scale) / 2;
    this.offsetY = (rect.height - this.posterHeight * this.scale) / 2;
    this.hasFitted = true;
    this.render();
  }

  /** The scale `fitToView` would choose right now, without changing anything. */
  fitScale(): number {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    return Math.min(rect.width / this.posterWidth, rect.height / this.posterHeight);
  }

  zoomBy(factor: number, anchorX?: number, anchorY?: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const ax = anchorX ?? rect.width / 2;
    const ay = anchorY ?? rect.height / 2;

    const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
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
  }
}
