/**
 * A tiny software 2D canvas, test-only.
 *
 * The palette-safety and seal round-trip tests are worthless against a stub
 * that records calls: they have to look at real pixels, including the
 * antialiased edges where a scene colour and an outline blend into each other.
 * There is no canvas implementation in this project's dependency tree and we
 * are not adding one, so this module rasterises the subset of
 * `CanvasRenderingContext2D` the poster actually uses.
 *
 * Antialiasing is 4x vertical subsampling with exact horizontal span coverage,
 * which is close enough to what a browser does that the blended edges the tests
 * care about really are blended.
 */

interface Point {
  x: number;
  y: number;
}

interface SubPath {
  points: Point[];
  closed: boolean;
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface SavedState {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  globalAlpha: number;
}

/** Sub-scanlines per pixel row. */
const SUBSAMPLES = 4;

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

function parseColor(value: string): Rgba {
  const text = value.trim();

  if (text.startsWith('#')) {
    const hex = text.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length >= 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
    return BLACK;
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb) {
    const parts = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()));
    return {
      r: parts[0] ?? 0,
      g: parts[1] ?? 0,
      b: parts[2] ?? 0,
      a: parts.length > 3 ? (parts[3] ?? 1) : 1,
    };
  }

  throw new Error(`softwareCanvas cannot parse the colour "${value}"`);
}

function circlePolygon(center: Point, radius: number): Point[] {
  const steps = Math.max(8, Math.min(32, Math.ceil(radius * 3)));
  const points: Point[] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push({
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    });
  }
  return points;
}

function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** Stroke pieces must all wind the same way, or nonzero fill cancels overlaps. */
function orientedClockwise(points: Point[]): Point[] {
  return signedArea(points) < 0 ? points.slice().reverse() : points;
}

export class SoftwareCanvasContext {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;

  fillStyle = '#000000';
  strokeStyle = '#000000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;

  private subpaths: SubPath[] = [];
  private current: SubPath | null = null;
  private readonly stack: SavedState[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  }

  /* -- state ------------------------------------------------------------- */

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
    });
  }

  restore(): void {
    const state = this.stack.pop();
    if (!state) return;
    this.fillStyle = state.fillStyle;
    this.strokeStyle = state.strokeStyle;
    this.lineWidth = state.lineWidth;
    this.lineCap = state.lineCap;
    this.lineJoin = state.lineJoin;
    this.globalAlpha = state.globalAlpha;
  }

  /* -- path building ------------------------------------------------------ */

  beginPath(): void {
    this.subpaths = [];
    this.current = null;
  }

  moveTo(x: number, y: number): void {
    this.current = { points: [{ x, y }], closed: false };
    this.subpaths.push(this.current);
  }

  lineTo(x: number, y: number): void {
    if (!this.current) this.moveTo(x, y);
    else this.current.points.push({ x, y });
  }

  closePath(): void {
    if (this.current) this.current.closed = true;
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.subpaths.push({
      points: [
        { x, y },
        { x: x + width, y },
        { x: x + width, y: y + height },
        { x, y: y + height },
      ],
      closed: true,
    });
    this.current = null;
  }

  roundRect(x: number, y: number, width: number, height: number, radius: number): void {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    const points: Point[] = [];
    const corner = (cx: number, cy: number, from: number, to: number) => {
      const steps = Math.max(4, Math.ceil(r));
      for (let i = 0; i <= steps; i += 1) {
        const angle = from + ((to - from) * i) / steps;
        points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
      }
    };
    corner(x + width - r, y + r, -Math.PI / 2, 0);
    corner(x + width - r, y + height - r, 0, Math.PI / 2);
    corner(x + r, y + height - r, Math.PI / 2, Math.PI);
    corner(x + r, y + r, Math.PI, (Math.PI * 3) / 2);
    this.subpaths.push({ points, closed: true });
    this.current = null;
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle = 0,
    endAngle = Math.PI * 2,
    counterclockwise = false,
  ): void {
    this.ellipse(x, y, radius, radius, 0, startAngle, endAngle, counterclockwise);
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
    counterclockwise = false,
  ): void {
    let start = startAngle;
    let end = endAngle;
    if (!counterclockwise) {
      while (end < start) end += Math.PI * 2;
    } else {
      while (end > start) end -= Math.PI * 2;
    }
    const sweep = end - start;
    const radius = Math.max(radiusX, radiusY);
    const steps = Math.max(
      3,
      Math.min(240, Math.ceil((Math.abs(sweep) / (Math.PI * 2)) * Math.max(16, radius * 3))),
    );

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const points: Point[] = [];
    for (let i = 0; i <= steps; i += 1) {
      const angle = start + (sweep * i) / steps;
      const px = Math.cos(angle) * radiusX;
      const py = Math.sin(angle) * radiusY;
      points.push({ x: x + px * cos - py * sin, y: y + px * sin + py * cos });
    }

    const isFullTurn = Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-6;
    if (this.current) {
      for (const point of points) this.current.points.push(point);
    } else {
      this.current = { points, closed: isFullTurn };
      this.subpaths.push(this.current);
      if (isFullTurn) this.current = null;
    }
  }

  /* -- painting ----------------------------------------------------------- */

  fill(): void {
    const polygons = this.subpaths
      .map((subpath) => subpath.points)
      .filter((points) => points.length >= 3);
    this.paintPolygons(polygons, parseColor(this.fillStyle));
  }

  stroke(): void {
    const half = Math.max(this.lineWidth, 0.1) / 2;
    const polygons: Point[][] = [];

    for (const subpath of this.subpaths) {
      const points = dedupe(subpath.points);
      if (points.length === 0) continue;
      if (points.length === 1) {
        if (this.lineCap === 'round') polygons.push(circlePolygon(points[0], half));
        continue;
      }

      const segmentCount = subpath.closed ? points.length : points.length - 1;
      for (let i = 0; i < segmentCount; i += 1) {
        const p = points[i];
        const q = points[(i + 1) % points.length];
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;
        const nx = (-dy / length) * half;
        const ny = (dx / length) * half;
        polygons.push(
          orientedClockwise([
            { x: p.x + nx, y: p.y + ny },
            { x: q.x + nx, y: q.y + ny },
            { x: q.x - nx, y: q.y - ny },
            { x: p.x - nx, y: p.y - ny },
          ]),
        );
      }

      // A disc at every joint approximates a round join, which is all this
      // illustration ever needs and keeps the corners from opening up.
      const firstJoint = subpath.closed ? 0 : 1;
      const lastJoint = subpath.closed ? points.length : points.length - 1;
      for (let i = firstJoint; i < lastJoint; i += 1) {
        polygons.push(orientedClockwise(circlePolygon(points[i], half)));
      }
      if (!subpath.closed && this.lineCap === 'round') {
        polygons.push(orientedClockwise(circlePolygon(points[0], half)));
        polygons.push(orientedClockwise(circlePolygon(points[points.length - 1], half)));
      }
    }

    this.paintPolygons(polygons, parseColor(this.strokeStyle));
  }

  /** Axis-aligned, so coverage is exact and there is no scanline work at all. */
  fillRect(x: number, y: number, width: number, height: number): void {
    const left = Math.min(x, x + width);
    const right = Math.max(x, x + width);
    const top = Math.min(y, y + height);
    const bottom = Math.max(y, y + height);

    const x0 = Math.max(0, Math.floor(left));
    const x1 = Math.min(this.width, Math.ceil(right));
    const y0 = Math.max(0, Math.floor(top));
    const y1 = Math.min(this.height, Math.ceil(bottom));
    if (x1 <= x0 || y1 <= y0) return;

    const color = parseColor(this.fillStyle);
    for (let py = y0; py < y1; py += 1) {
      const coverY = Math.min(bottom, py + 1) - Math.max(top, py);
      if (coverY <= 0) continue;
      for (let px = x0; px < x1; px += 1) {
        const coverX = Math.min(right, px + 1) - Math.max(left, px);
        if (coverX <= 0) continue;
        this.blend(py * this.width + px, color, coverX * coverY);
      }
    }
  }

  /**
   * Writes a pixel buffer straight into the canvas, ignoring the path state.
   *
   * The park poster is not drawn, it is loaded: the tests need to put a real
   * decoded, resampled, sanitised image underneath before the real seal
   * rasteriser stamps on top of it.
   */
  putImageData(
    image: { width: number; height: number; data: Uint8ClampedArray },
    dx = 0,
    dy = 0,
  ): void {
    for (let y = 0; y < image.height; y += 1) {
      const targetY = dy + y;
      if (targetY < 0 || targetY >= this.height) continue;
      for (let x = 0; x < image.width; x += 1) {
        const targetX = dx + x;
        if (targetX < 0 || targetX >= this.width) continue;
        const source = (y * image.width + x) * 4;
        const target = (targetY * this.width + targetX) * 4;
        this.pixels[target] = image.data[source];
        this.pixels[target + 1] = image.data[source + 1];
        this.pixels[target + 2] = image.data[source + 2];
        this.pixels[target + 3] = 255;
      }
    }
  }

  getImageData(
    sx = 0,
    sy = 0,
    sw = this.width,
    sh = this.height,
  ): { width: number; height: number; data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(sw * sh * 4);
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const source = ((sy + y) * this.width + (sx + x)) * 4;
        const target = (y * sw + x) * 4;
        data[target] = this.pixels[source];
        data[target + 1] = this.pixels[source + 1];
        data[target + 2] = this.pixels[source + 2];
        data[target + 3] = 255;
      }
    }
    return { width: sw, height: sh, data };
  }

  /* -- rasteriser --------------------------------------------------------- */

  private blend(pixelIndex: number, color: Rgba, coverage: number): void {
    const alpha = Math.min(1, coverage) * color.a * this.globalAlpha;
    if (alpha <= 0) return;
    const i = pixelIndex * 4;
    this.pixels[i] = this.pixels[i] + (color.r - this.pixels[i]) * alpha;
    this.pixels[i + 1] = this.pixels[i + 1] + (color.g - this.pixels[i + 1]) * alpha;
    this.pixels[i + 2] = this.pixels[i + 2] + (color.b - this.pixels[i + 2]) * alpha;
  }

  private paintPolygons(polygons: readonly Point[][], color: Rgba): void {
    if (polygons.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const edgeX0: number[] = [];
    const edgeY0: number[] = [];
    const edgeX1: number[] = [];
    const edgeY1: number[] = [];

    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i += 1) {
        const p = polygon[i];
        const q = polygon[(i + 1) % polygon.length];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        if (p.y === q.y) continue;
        edgeX0.push(p.x);
        edgeY0.push(p.y);
        edgeX1.push(q.x);
        edgeY1.push(q.y);
      }
    }

    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(this.width, Math.ceil(maxX) + 1);
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.height, Math.ceil(maxY) + 1);
    if (x1 <= x0 || y1 <= y0 || edgeX0.length === 0) return;

    const boxWidth = x1 - x0;
    const coverage = new Float32Array(boxWidth * (y1 - y0));
    const crossX = new Float64Array(edgeX0.length);
    const crossDir = new Int8Array(edgeX0.length);

    for (let py = y0; py < y1; py += 1) {
      const rowOffset = (py - y0) * boxWidth;
      for (let sub = 0; sub < SUBSAMPLES; sub += 1) {
        const sampleY = py + (sub + 0.5) / SUBSAMPLES;

        let count = 0;
        for (let e = 0; e < edgeX0.length; e += 1) {
          const ay = edgeY0[e];
          const by = edgeY1[e];
          const low = ay < by ? ay : by;
          const high = ay < by ? by : ay;
          if (sampleY < low || sampleY >= high) continue;
          const t = (sampleY - ay) / (by - ay);
          const cx = edgeX0[e] + t * (edgeX1[e] - edgeX0[e]);
          const dir = by > ay ? 1 : -1;
          // Insertion sort as we go: crossing counts are tiny.
          let k = count - 1;
          while (k >= 0 && crossX[k] > cx) {
            crossX[k + 1] = crossX[k];
            crossDir[k + 1] = crossDir[k];
            k -= 1;
          }
          crossX[k + 1] = cx;
          crossDir[k + 1] = dir;
          count += 1;
        }
        if (count < 2) continue;

        let winding = 0;
        for (let i = 0; i < count - 1; i += 1) {
          winding += crossDir[i];
          if (winding === 0) continue;
          const spanStart = Math.max(crossX[i], x0);
          const spanEnd = Math.min(crossX[i + 1], x1);
          if (spanEnd <= spanStart) continue;
          for (let px = Math.floor(spanStart); px < spanEnd; px += 1) {
            if (px < x0 || px >= x1) continue;
            const left = spanStart > px ? spanStart : px;
            const right = spanEnd < px + 1 ? spanEnd : px + 1;
            coverage[rowOffset + (px - x0)] += (right - left) / SUBSAMPLES;
          }
        }
      }
    }

    for (let py = y0; py < y1; py += 1) {
      const rowOffset = (py - y0) * boxWidth;
      const pixelRow = py * this.width;
      for (let px = x0; px < x1; px += 1) {
        const value = coverage[rowOffset + (px - x0)];
        if (value <= 0) continue;
        this.blend(pixelRow + px, color, value);
      }
    }
  }
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) continue;
    out.push(point);
  }
  return out;
}

/** A stand-in for `HTMLCanvasElement` that hands back a software context. */
class SoftwareCanvas {
  width = 300;
  height = 150;
  private context: SoftwareCanvasContext | null = null;

  getContext(kind: string): SoftwareCanvasContext | null {
    if (kind !== '2d') return null;
    if (!this.context) this.context = new SoftwareCanvasContext(this.width, this.height);
    return this.context;
  }
}

/**
 * Installs a fake `document.createElement('canvas')` backed by the software
 * rasteriser. Returns a restore function.
 */
export function installSoftwareCanvas(): { restore: () => void } {
  const previous = (globalThis as Record<string, unknown>).document;
  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`softwareCanvas only creates canvases, not <${tag}>`);
      return new SoftwareCanvas();
    },
  };
  return {
    restore: () => {
      (globalThis as Record<string, unknown>).document = previous;
    },
  };
}

/** Pulls the software context back out of a canvas returned by the renderer. */
export function contextOf(canvas: unknown): SoftwareCanvasContext {
  const context = (canvas as SoftwareCanvas).getContext('2d');
  if (!context) throw new Error('Expected a software 2D context');
  return context;
}
