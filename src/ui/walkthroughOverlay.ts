/**
 * The overlay the walkthrough is made of: a dark scrim with a spotlight hole
 * cut over one element at a time, and a bubble anchored beside it.
 *
 * Read `walkthrough.ts` first - it owns the steps and the rules. This file owns
 * only the pixels, the blocking and the keyboard.
 *
 * HOW THE HOLE IS CUT. `box-shadow: 0 0 0 9999px rgba(...)` on a transparent,
 * absolutely positioned element paints everything outside that element dark and
 * leaves the element itself untouched. It is one property, it needs no canvas
 * and no mask, and it survives every layout the app has. What it cannot do is
 * block clicks: the shadow is painted by the hole element, so making the hole
 * click-through makes the whole dark region click-through as well. So the hole
 * is `pointer-events: none` and four transparent blocker rectangles - above,
 * below, left and right of it - do the blocking. The child can reach the
 * spotlighted element and nothing else.
 *
 * HOW THE HOLE KEEPS UP. A poster that finishes decoding, a rail that grows a
 * puzzle tile, a window that is resized: all of them move the target after the
 * step was drawn. Rather than guess at which events matter, the overlay reads
 * the target's rect on every animation frame and writes to the DOM only when it
 * actually changed. That is a rect read per frame while the tour is open, which
 * is nothing, and it is correct for scroll, resize, zoom, font loading and
 * layout thrash alike.
 *
 * THE SNIP STEP. On a step whose `scrim` is false the scrim, the hole and all
 * four blockers are removed from the DOM entirely - not hidden, not faded -
 * and only a small hint remains, parked in whichever viewport corner is
 * furthest from the poster. A dark rectangle over the poster would end up
 * inside the child's screenshot and would push the seal's HSV value under the
 * decoder's `MIN_VALUE` floor, which decodes as nothing at all.
 *
 * WINDOW BLUR. `Windows + Shift + S` takes focus away from the browser, and
 * that is the one reliable signal that the snipping overlay is up. Any blur
 * hides every piece of this overlay instantly, with no transition, whatever
 * step is on screen.
 */

import { button, element, keyHint } from './dom';
import {
  createWalkthroughMachine,
  type WalkthroughStep,
  type WalkthroughTrigger,
} from './walkthrough';

/** Breathing room around the spotlighted element, in CSS pixels. */
const SPOTLIGHT_PADDING = 8;

/** Gap between the spotlight and the bubble. */
const BUBBLE_GAP = 14;

/** Kept clear of the viewport edge so the bubble never sits half off-screen. */
const VIEWPORT_MARGIN = 12;

export interface WalkthroughOverlayOptions {
  /** Where the overlay is appended. Normally the app root. */
  host: HTMLElement;
  /** The tour ended. `skipped` includes the Escape confirmation. */
  onEnd: (reason: 'finished' | 'skipped') => void;
  /** Steps, for tests and for a shorter tour later. Defaults to the real one. */
  steps?: readonly WalkthroughStep[];
}

export interface WalkthroughOverlay {
  /** Reports a real action, e.g. the child zoomed in or pasted an image. */
  fire(trigger: WalkthroughTrigger): void;
  /** Tears everything down. Safe to call twice. */
  destroy(): void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** True when the machine is running under a "no animation, please" setting. */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * The one genuinely hard idea, drawn.
 *
 * A browser window with the park inside it and a dashed rectangle over part of
 * that park. It says, without a sentence a seven year old has to parse, that
 * the thing being photographed is what is on this screen right now.
 */
function windowDiagram(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 200 108');
  svg.setAttribute('class', 'walkthrough__diagram');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    'The photo is taken of this browser window, exactly as it looks right now.',
  );

  svg.innerHTML = [
    // The window frame.
    '<rect x="4" y="4" width="192" height="100" rx="9" fill="#ffffff" stroke="#1d2340" stroke-width="3"/>',
    // Its title bar and three dots, so it reads as "a window" at a glance.
    '<path d="M4 13a9 9 0 0 1 9-9h174a9 9 0 0 1 9 9v9H4z" fill="#e6ecff"/>',
    '<line x1="4" y1="22" x2="196" y2="22" stroke="#1d2340" stroke-width="3"/>',
    '<circle cx="16" cy="13" r="3" fill="#b02a37"/>',
    '<circle cx="27" cy="13" r="3" fill="#a86200"/>',
    '<circle cx="38" cy="13" r="3" fill="#17864a"/>',
    // The park inside it: sky, grass, a tree, a bench.
    '<rect x="7" y="22" width="186" height="46" fill="#cfe6f7"/>',
    '<rect x="7" y="68" width="186" height="33" fill="#bfe0a8"/>',
    '<path d="M60 68V52" stroke="#7a5230" stroke-width="5"/>',
    '<circle cx="60" cy="45" r="15" fill="#5fa845" stroke="#1d2340" stroke-width="2"/>',
    '<rect x="118" y="62" width="40" height="6" rx="2" fill="#c98a3a" stroke="#1d2340" stroke-width="2"/>',
    '<path d="M124 68v10M152 68v10" stroke="#1d2340" stroke-width="3"/>',
    // The crop the child is about to draw.
    '<rect x="104" y="40" width="70" height="46" fill="none" stroke="#2f6df6" stroke-width="3" stroke-dasharray="7 5"/>',
    '<text x="139" y="36" font-size="16" text-anchor="middle">✂</text>',
  ].join('');

  return svg;
}

export function mountWalkthroughOverlay(
  options: WalkthroughOverlayOptions,
): WalkthroughOverlay {
  const reducedMotion = prefersReducedMotion();

  /* The parts ------------------------------------------------------------- */

  const root = element('div', 'walkthrough');
  if (reducedMotion) root.classList.add('walkthrough--still');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Step by step guide');

  /** Carries the box-shadow that darkens everything else. Click-through. */
  const hole = element('div', 'walkthrough__hole');

  /** The four transparent rectangles that actually block the rest of the page. */
  const blockers = ['top', 'right', 'bottom', 'left'].map((side) =>
    element('div', `walkthrough__block walkthrough__block--${side}`),
  );

  const bubble = element('div', 'walkthrough__bubble');
  const bubbleBody = element('div', 'walkthrough__body');
  const bubbleText = element('p', 'walkthrough__text', '');
  bubbleText.setAttribute('aria-live', 'polite');
  bubbleBody.appendChild(bubbleText);
  const bubbleExtras = element('div', 'walkthrough__extras');
  bubbleBody.appendChild(bubbleExtras);

  const dots = element('div', 'walkthrough__dots');
  dots.setAttribute('aria-hidden', 'true');

  const actions = element('div', 'walkthrough__actions');
  const nextButton = button('Next', 'button button--primary walkthrough__next');
  const skipButton = button('Skip the guide', 'walkthrough__skip');
  actions.append(skipButton, nextButton);

  /** The Escape confirmation. Never a competing button; only ever a question. */
  const confirm = element('div', 'walkthrough__confirm');
  confirm.hidden = true;
  const confirmText = element('p', 'walkthrough__confirm-text', 'Do you want to leave the guide?');
  const confirmYes = button('Yes, leave', 'button button--ghost button--small');
  const confirmNo = button('Stay here', 'button button--primary button--small');
  const confirmRow = element('div', 'walkthrough__confirm-row');
  confirmRow.append(confirmNo, confirmYes);
  confirm.append(confirmText, confirmRow);

  bubble.append(bubbleBody, dots, actions, confirm);

  /**
   * The snip step's only visible furniture. Deliberately outside `root`: it has
   * to survive the frame in which the scrim, the hole and the blockers are all
   * torn out of the document.
   */
  const snipHint = element('div', 'walkthrough__snip-hint');
  snipHint.hidden = true;

  options.host.append(root, snipHint);

  /* State ----------------------------------------------------------------- */

  let currentStep: WalkthroughStep | null = null;
  let targetElement: HTMLElement | null = null;
  let lastRect: Rect | null = null;
  let frame = 0;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  /** True while the browser has lost focus, i.e. while the snip overlay is up. */
  let windowBlurred = false;

  const machine = createWalkthroughMachine({
    steps: options.steps,
    isTargetPresent: (selector) => document.querySelector(selector) !== null,
    onStep: (step, position, total) => showStep(step, position, total),
    onEnd: (reason) => {
      teardown();
      options.onEnd(reason);
    },
  });

  /* Geometry -------------------------------------------------------------- */

  function readRect(): Rect | null {
    if (!targetElement || !targetElement.isConnected) return null;
    const box = targetElement.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) return null;
    return {
      top: Math.max(0, box.top - SPOTLIGHT_PADDING),
      left: Math.max(0, box.left - SPOTLIGHT_PADDING),
      width: Math.min(window.innerWidth, box.width + SPOTLIGHT_PADDING * 2),
      height: Math.min(window.innerHeight, box.height + SPOTLIGHT_PADDING * 2),
    };
  }

  function paintSpotlight(rect: Rect): void {
    hole.style.top = `${rect.top}px`;
    hole.style.left = `${rect.left}px`;
    hole.style.width = `${rect.width}px`;
    hole.style.height = `${rect.height}px`;

    const right = rect.left + rect.width;
    const bottom = rect.top + rect.height;
    const [top, rightBlock, bottomBlock, left] = blockers;

    top.style.cssText = `top:0;left:0;right:0;height:${Math.max(0, rect.top)}px`;
    bottomBlock.style.cssText = `top:${bottom}px;left:0;right:0;bottom:0`;
    left.style.cssText = `top:${rect.top}px;left:0;width:${Math.max(0, rect.left)}px;height:${rect.height}px`;
    rightBlock.style.cssText = `top:${rect.top}px;left:${right}px;right:0;height:${rect.height}px`;
  }

  /** Places the bubble beside the hole, or centres it when there is no hole. */
  function placeBubble(rect: Rect | null): void {
    const box = bubble.getBoundingClientRect();
    const width = box.width || 320;
    const height = box.height || 180;

    if (!rect) {
      bubble.style.top = `${Math.max(VIEWPORT_MARGIN, (window.innerHeight - height) / 2)}px`;
      bubble.style.left = `${Math.max(VIEWPORT_MARGIN, (window.innerWidth - width) / 2)}px`;
      return;
    }

    // Below the spotlight when it fits, above when it does not, and beside it
    // when the spotlight is tall enough to leave no room either way.
    const below = rect.top + rect.height + BUBBLE_GAP;
    const above = rect.top - BUBBLE_GAP - height;
    let top: number;
    if (below + height + VIEWPORT_MARGIN <= window.innerHeight) {
      top = below;
    } else if (above >= VIEWPORT_MARGIN) {
      top = above;
    } else {
      top = Math.max(VIEWPORT_MARGIN, (window.innerHeight - height) / 2);
    }

    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, centred),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
    );

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
  }

  /**
   * Parks the snip hint in the viewport corner furthest from the poster.
   *
   * Hard-coding a corner is what breaks when a school laptop is 1366x768
   * instead of 1600x1100, so the corner is measured. The hint must not sit over
   * the poster: whatever is over the poster ends up in the screenshot.
   */
  function placeSnipHint(): void {
    const stage = document.querySelector('.poster-viewer__stage');
    const box = snipHint.getBoundingClientRect();
    const width = box.width || 260;
    const height = box.height || 120;

    const corners = [
      { top: VIEWPORT_MARGIN, left: VIEWPORT_MARGIN },
      { top: VIEWPORT_MARGIN, left: window.innerWidth - width - VIEWPORT_MARGIN },
      { top: window.innerHeight - height - VIEWPORT_MARGIN, left: VIEWPORT_MARGIN },
      {
        top: window.innerHeight - height - VIEWPORT_MARGIN,
        left: window.innerWidth - width - VIEWPORT_MARGIN,
      },
    ];

    let best = corners[1];
    if (stage) {
      const poster = stage.getBoundingClientRect();
      let bestOverlap = Number.POSITIVE_INFINITY;
      for (const corner of corners) {
        const overlapX = Math.max(
          0,
          Math.min(corner.left + width, poster.right) - Math.max(corner.left, poster.left),
        );
        const overlapY = Math.max(
          0,
          Math.min(corner.top + height, poster.bottom) - Math.max(corner.top, poster.top),
        );
        const overlap = overlapX * overlapY;
        if (overlap < bestOverlap) {
          bestOverlap = overlap;
          best = corner;
        }
      }
    }

    snipHint.style.top = `${Math.max(0, best.top)}px`;
    snipHint.style.left = `${Math.max(0, best.left)}px`;
  }

  /* The frame loop -------------------------------------------------------- */

  function tick(): void {
    frame = window.requestAnimationFrame(tick);
    if (destroyed || windowBlurred) return;

    if (currentStep && currentStep.scrim === false) {
      placeSnipHint();
      return;
    }

    const rect = readRect();
    if (sameRect(rect, lastRect)) return;
    lastRect = rect;

    if (rect) {
      if (!root.contains(hole)) root.append(hole, ...blockers);
      root.classList.remove('walkthrough--full');
      paintSpotlight(rect);
    } else {
      // No target: darken everything and centre the bubble. This is what a step
      // with `target: null` and a scrim looks like; a step whose selector was
      // simply missing never got here, because the machine skipped it.
      root.classList.add('walkthrough--full');
      if (!root.contains(hole)) root.append(hole, ...blockers);
      paintSpotlight({ top: 0, left: 0, width: 0, height: 0 });
    }
    placeBubble(rect);
  }

  /* Steps ----------------------------------------------------------------- */

  function clearAutoTimer(): void {
    if (autoTimer !== null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
  }

  function paintDots(position: number, total: number): void {
    dots.textContent = '';
    for (let i = 0; i < total; i += 1) {
      const dot = element('span', 'walkthrough__dot');
      dot.classList.toggle('is-done', i < position);
      dot.classList.toggle('is-current', i === position);
      dots.appendChild(dot);
    }
  }

  function showStep(step: WalkthroughStep, position: number, total: number): void {
    clearAutoTimer();
    currentStep = step;
    confirm.hidden = true;
    bubble.hidden = false;
    root.dataset.step = step.id;

    targetElement = step.target
      ? document.querySelector<HTMLElement>(step.target)
      : null;
    lastRect = null;

    bubbleText.textContent = step.text;
    bubbleExtras.textContent = '';
    if (step.keys) bubbleExtras.appendChild(keyHint(step.keys));
    if (step.diagram) bubbleExtras.appendChild(windowDiagram());

    paintDots(position, total);

    nextButton.hidden = step.buttonLabel === undefined;
    if (step.buttonLabel) nextButton.textContent = step.buttonLabel;

    if (step.scrim) {
      snipHint.hidden = true;
      root.appendChild(bubble);
      root.hidden = false;
    } else {
      /*
       * THE CRITICAL BRANCH. Nothing of the overlay may remain over the poster
       * while the child presses Windows + Shift + S: not the scrim, not the
       * hole, not a blocker, not the bubble. They are removed from the DOM, not
       * hidden, so there is no transparent-but-present element left to argue
       * about. What stays is the hint, and the hint is parked away from the
       * poster and cannot take a pointer.
       */
      hole.remove();
      for (const blocker of blockers) blocker.remove();
      root.hidden = true;
      snipHint.textContent = '';
      snipHint.appendChild(bubble);
      snipHint.hidden = false;
      placeSnipHint();
    }

    if (step.trigger === 'auto' && step.autoAdvanceMs !== undefined) {
      autoTimer = setTimeout(() => machine.fire('auto'), step.autoAdvanceMs);
    }

    // Focus follows the bubble on a blocking step, and deliberately does not on
    // the snip step: nothing there is modal, and pulling focus onto "Skip the
    // guide" a moment before the child presses three keys is asking for it.
    if (step.scrim) focusBubble();
  }

  function focusBubble(): void {
    const focusable = bubble.querySelector<HTMLElement>(
      'button:not([hidden]):not(:disabled)',
    );
    (focusable ?? bubble).focus({ preventScroll: true });
  }

  /* Keyboard and focus ---------------------------------------------------- */

  bubble.tabIndex = -1;

  function focusables(): HTMLElement[] {
    return [...bubble.querySelectorAll('button')].filter(
      (node) => !node.hidden && !node.disabled && node.offsetParent !== null,
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (destroyed) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      // Escape offers, it never decides. A child who hits it by accident has
      // not lost the guide.
      confirm.hidden = false;
      confirmNo.focus({ preventScroll: true });
      return;
    }

    if (event.key !== 'Tab') return;
    const nodes = focusables();
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && (active === first || !bubble.contains(active))) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (active === last || !bubble.contains(active))) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  /**
   * Keeps focus inside the bubble or on the spotlighted element.
   *
   * Not a blanket trap: the spotlighted control is part of the step, and a
   * child working the tour from the keyboard has to be able to reach the zoom
   * button that the step is asking them to press.
   */
  const onFocusIn = (event: FocusEvent) => {
    if (destroyed || !currentStep) return;
    if (currentStep.scrim === false) return;
    const node = event.target as Node | null;
    if (!node) return;
    if (bubble.contains(node)) return;
    if (targetElement?.contains(node)) return;
    focusBubble();
  };

  /* Window cues ----------------------------------------------------------- */

  /**
   * The snipping overlay steals focus, so a blur means the screen is about to
   * be photographed. Everything vanishes at once, with no transition: a fading
   * scrim would still be half-painted in the child's evidence.
   */
  const onBlur = () => {
    windowBlurred = true;
    root.style.display = 'none';
    snipHint.style.display = 'none';
  };

  const onFocus = () => {
    windowBlurred = false;
    root.style.display = '';
    snipHint.style.display = '';
    lastRect = null;
  };

  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('focusin', onFocusIn, true);

  nextButton.addEventListener('click', () => machine.fire('next'));
  skipButton.addEventListener('click', () => machine.skip());
  confirmYes.addEventListener('click', () => machine.skip());
  confirmNo.addEventListener('click', () => {
    confirm.hidden = true;
    focusBubble();
  });

  /* Lifecycle ------------------------------------------------------------- */

  function teardown(): void {
    if (destroyed) return;
    destroyed = true;
    clearAutoTimer();
    if (frame) window.cancelAnimationFrame(frame);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('focus', onFocus);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('focusin', onFocusIn, true);
    root.remove();
    snipHint.remove();
  }

  frame = window.requestAnimationFrame(tick);
  machine.start();

  return {
    fire(trigger) {
      if (!destroyed) machine.fire(trigger);
    },
    destroy: teardown,
  };
}
