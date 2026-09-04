/**
 * The marking tool: how every future poster gets its metadata.
 *
 * Placing fifteen bounding boxes by reading pixel coordinates off a zoomed
 * screenshot is slow and, worse, silently wrong - a box that is twenty pixels
 * out still looks fine and only fails later, as a seal stamped on the grass
 * next to the object. So the boxes are drawn on the poster itself, at whatever
 * zoom makes the object easy to see, and the tool emits the catalogue.
 *
 * Output is normalised 0-1 coordinates against the cropped illustration, which
 * is the same unit `parkPosterData.ts` stores, so the JSON pastes straight in.
 *
 * Code is English; every string the user reads is Spanish.
 */

import {
  PARK_TARGET_DEFINITION_LIST,
  PARK_DECOY_CODES,
} from '../poster/parkPosterData';
import { SEAL_CODE_COUNT, encodeSealCode, type SealDigits } from '../poster/seal';
import { PosterViewer } from '../viewer/posterViewer';

/** A box the user has drawn, in normalised 0-1 poster coordinates. */
interface MarkedBox {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sealCode: number;
}

/** Smallest drag, in poster pixels, that counts as a box rather than a slip. */
const MIN_BOX_SIZE = 24;

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Every code already spoken for: the shipped park targets and their decoys.
 *
 * A new box must avoid both. Colliding with a target would make two objects
 * answer to one code; colliding with a decoy would make a decoy answer to a
 * real object, which is worse, because the child would be told they found
 * something while looking at the wrong thing.
 */
function reservedCodes(): Set<number> {
  const taken = new Set<number>(PARK_DECOY_CODES);
  for (const definition of PARK_TARGET_DEFINITION_LIST) {
    taken.add(encodeSealCode(definition.digits));
  }
  return taken;
}

/** The lowest code nobody is using yet. */
function nextFreeCode(taken: ReadonlySet<number>): number {
  for (let code = 0; code < SEAL_CODE_COUNT; code += 1) {
    if (!taken.has(code)) return code;
  }
  throw new Error('No hay códigos de sello disponibles.');
}

/** Base-4 digits of a code, so the emitted JSON matches the catalogue's shape. */
function digitsOf(code: number): SealDigits {
  const digits: number[] = [];
  let remaining = code;
  for (let i = 0; i < 5; i += 1) {
    digits.unshift(remaining % 4);
    remaining = Math.floor(remaining / 4);
  }
  return digits as unknown as SealDigits;
}

export interface MarkingToolOptions {
  /** The poster to draw on: cropped and sanitised, but with no seals stamped. */
  poster: HTMLCanvasElement;
  /** Called when the user closes the tool. */
  onClose: () => void;
}

/**
 * Mounts the marking tool into `root`. Returns a function that tears it down.
 */
export function mountMarkingTool(root: HTMLElement, options: MarkingToolOptions): () => void {
  const boxes: MarkedBox[] = [];
  const taken = reservedCodes();
  let sequence = 1;

  /** The drag in progress, in poster coordinates, or null. */
  let pending: { x0: number; y0: number; x1: number; y1: number } | null = null;
  let mode: 'draw' | 'pan' = 'draw';
  let selectedId: string | null = null;

  const panel = element('section', 'marking');

  /* Header ---------------------------------------------------------------- */
  const header = element('header', 'marking__header');
  header.appendChild(element('h2', 'marking__title', 'Marcar objetos'));

  const modeButton = element('button', 'button button--ghost', 'Modo: dibujar');
  modeButton.type = 'button';
  const fitButton = element('button', 'button button--ghost', 'Ver todo');
  fitButton.type = 'button';
  const zoomOutButton = element('button', 'button button--round', '−');
  zoomOutButton.type = 'button';
  zoomOutButton.setAttribute('aria-label', 'Alejar');
  const zoomInButton = element('button', 'button button--round', '+');
  zoomInButton.type = 'button';
  zoomInButton.setAttribute('aria-label', 'Acercar');
  const closeButton = element('button', 'button', 'Cerrar');
  closeButton.type = 'button';

  const tools = element('div', 'marking__tools');
  tools.append(modeButton, zoomOutButton, zoomInButton, fitButton, closeButton);
  header.appendChild(tools);
  panel.appendChild(header);

  panel.appendChild(
    element(
      'p',
      'marking__hint',
      'Arrastra sobre la ilustración para encerrar un objeto y luego escribe su nombre. ' +
        'Cambia a "mover" para desplazar el póster y usa la rueda para acercarte.',
    ),
  );

  /* Body: stage + sidebar -------------------------------------------------- */
  const body = element('div', 'marking__body');
  const stage = element('div', 'marking__stage');
  const sidebar = element('aside', 'marking__sidebar');
  body.append(stage, sidebar);
  panel.appendChild(body);

  const listTitle = element('h3', 'marking__subtitle', 'Objetos marcados');
  const list = element('ul', 'marking__list');
  const empty = element('p', 'marking__empty', 'Todavía no has marcado ningún objeto.');
  sidebar.append(listTitle, empty, list);

  /* Output ---------------------------------------------------------------- */
  const outputTitle = element('h3', 'marking__subtitle', 'Datos del póster (JSON)');
  const output = element('textarea', 'marking__output');
  output.readOnly = true;
  output.rows = 12;
  output.spellcheck = false;
  const copyButton = element('button', 'button button--ghost', 'Copiar JSON');
  copyButton.type = 'button';
  const copyNote = element('p', 'marking__note', '');
  sidebar.append(outputTitle, output, copyButton, copyNote);

  root.appendChild(panel);

  const viewer = new PosterViewer(stage, options.poster);
  viewer.setPanEnabled(false);

  /* Rendering ------------------------------------------------------------- */

  function toScreenRect(box: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): { x: number; y: number; width: number; height: number } {
    const topLeft = viewer.screenPointFromPoster(
      box.x * viewer.posterWidth,
      box.y * viewer.posterHeight,
    );
    const scale = viewer.getScale();
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: box.width * viewer.posterWidth * scale,
      height: box.height * viewer.posterHeight * scale,
    };
  }

  viewer.setOverlayRenderer((ctx) => {
    ctx.lineWidth = 2;
    ctx.font = '14px "Trebuchet MS", system-ui, sans-serif';
    ctx.textBaseline = 'bottom';

    for (const box of boxes) {
      const rect = toScreenRect(box);
      const selected = box.id === selectedId;
      ctx.strokeStyle = selected ? '#2f6df6' : '#1d2340';
      ctx.fillStyle = selected ? 'rgba(47, 109, 246, 0.18)' : 'rgba(29, 35, 64, 0.10)';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      const label = box.name || box.id;
      ctx.fillStyle = '#1d2340';
      ctx.fillText(label, rect.x + 4, rect.y - 4);
    }

    if (pending) {
      const a = viewer.screenPointFromPoster(
        Math.min(pending.x0, pending.x1),
        Math.min(pending.y0, pending.y1),
      );
      const b = viewer.screenPointFromPoster(
        Math.max(pending.x0, pending.x1),
        Math.max(pending.y0, pending.y1),
      );
      ctx.strokeStyle = '#b02a37';
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.setLineDash([]);
    }
  });

  function refreshOutput(): void {
    const payload = boxes.map((box) => ({
      id: box.id,
      name: box.name,
      x: Number(box.x.toFixed(5)),
      y: Number(box.y.toFixed(5)),
      width: Number(box.width.toFixed(5)),
      height: Number(box.height.toFixed(5)),
      sealCode: box.sealCode,
      digits: digitsOf(box.sealCode),
    }));
    output.value = JSON.stringify(payload, null, 2);
  }

  function refreshList(): void {
    list.textContent = '';
    empty.hidden = boxes.length > 0;

    for (const box of boxes) {
      const item = element('li', 'marking__item');
      if (box.id === selectedId) item.classList.add('is-selected');

      const nameInput = element('input', 'marking__name');
      nameInput.type = 'text';
      nameInput.value = box.name;
      nameInput.placeholder = 'Nombre en español';
      nameInput.setAttribute('aria-label', `Nombre de ${box.id}`);
      nameInput.addEventListener('input', () => {
        box.name = nameInput.value;
        refreshOutput();
        viewer.render();
      });
      nameInput.addEventListener('focus', () => {
        selectedId = box.id;
        viewer.render();
      });

      const code = element('span', 'marking__code', `#${box.sealCode}`);

      const remove = element('button', 'button button--ghost marking__remove', 'Borrar');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Borrar ${box.id}`);
      remove.addEventListener('click', () => {
        const index = boxes.findIndex((candidate) => candidate.id === box.id);
        if (index < 0) return;
        taken.delete(box.sealCode);
        boxes.splice(index, 1);
        if (selectedId === box.id) selectedId = null;
        refreshList();
        refreshOutput();
        viewer.render();
      });

      item.append(nameInput, code, remove);
      list.appendChild(item);
    }
  }

  /* Drawing --------------------------------------------------------------- */

  const canvas = stage.querySelector('canvas');
  if (!canvas) throw new Error('El visor no creó su lienzo.');

  const clampToPoster = (point: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(viewer.posterWidth, point.x)),
    y: Math.max(0, Math.min(viewer.posterHeight, point.y)),
  });

  const onPointerDown = (event: PointerEvent) => {
    if (mode !== 'draw') return;
    const start = clampToPoster(viewer.posterPointFromClient(event.clientX, event.clientY));
    pending = { x0: start.x, y0: start.y, x1: start.x, y1: start.y };
    canvas.setPointerCapture(event.pointerId);
    viewer.render();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pending) return;
    const point = clampToPoster(viewer.posterPointFromClient(event.clientX, event.clientY));
    pending.x1 = point.x;
    pending.y1 = point.y;
    viewer.render();
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!pending) return;
    const box = pending;
    pending = null;
    canvas.releasePointerCapture(event.pointerId);

    const left = Math.min(box.x0, box.x1);
    const top = Math.min(box.y0, box.y1);
    const width = Math.abs(box.x1 - box.x0);
    const height = Math.abs(box.y1 - box.y0);
    if (width < MIN_BOX_SIZE || height < MIN_BOX_SIZE) {
      viewer.render();
      return;
    }

    const sealCode = nextFreeCode(taken);
    taken.add(sealCode);
    const id = `object${sequence}`;
    sequence += 1;

    boxes.push({
      id,
      name: '',
      x: left / viewer.posterWidth,
      y: top / viewer.posterHeight,
      width: width / viewer.posterWidth,
      height: height / viewer.posterHeight,
      sealCode,
    });
    selectedId = id;

    refreshList();
    refreshOutput();
    viewer.render();

    const lastInput = list.querySelector<HTMLInputElement>('.marking__item:last-child input');
    lastInput?.focus();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  /* Controls -------------------------------------------------------------- */

  modeButton.addEventListener('click', () => {
    mode = mode === 'draw' ? 'pan' : 'draw';
    modeButton.textContent = mode === 'draw' ? 'Modo: dibujar' : 'Modo: mover';
    viewer.setPanEnabled(mode === 'pan');
  });
  zoomInButton.addEventListener('click', () => viewer.zoomIn());
  zoomOutButton.addEventListener('click', () => viewer.zoomOut());
  fitButton.addEventListener('click', () => viewer.fitToView());
  closeButton.addEventListener('click', () => options.onClose());

  copyButton.addEventListener('click', () => {
    output.select();
    navigator.clipboard
      ?.writeText(output.value)
      .then(() => {
        copyNote.textContent = 'Copiado al portapapeles.';
      })
      .catch(() => {
        copyNote.textContent = 'No pude copiar. Selecciona el texto y usa Ctrl + C.';
      });
  });

  refreshList();
  refreshOutput();

  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    panel.remove();
  };
}
