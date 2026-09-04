/**
 * Minimal 2D-context stub so the poster renderer can be exercised in plain
 * Node. It records every `arc()` together with the fill colour in force at the
 * time, which is enough to verify where the seals landed.
 */

export interface RecordedArc {
  x: number;
  y: number;
  radius: number;
  fillStyle: string;
}

export class RecordingContext {
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;
  lineCap = 'butt';
  readonly arcs: RecordedArc[] = [];

  createLinearGradient(): { addColorStop: () => void } {
    return { addColorStop: () => undefined };
  }

  arc(x: number, y: number, radius: number): void {
    this.arcs.push({ x, y, radius, fillStyle: this.fillStyle });
  }

  ellipse(): void {}
  rect(): void {}
  roundRect(): void {}
  beginPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  fill(): void {}
  stroke(): void {}
  fillRect(): void {}
  save(): void {}
  restore(): void {}
}

/** Installs a fake `document.createElement('canvas')`. Returns a restore fn. */
export function installCanvasStub(): { context: RecordingContext; restore: () => void } {
  const context = new RecordingContext();
  const previous = (globalThis as Record<string, unknown>).document;

  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };

  return {
    context,
    restore: () => {
      (globalThis as Record<string, unknown>).document = previous;
    },
  };
}
