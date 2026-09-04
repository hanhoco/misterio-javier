/**
 * The blocking walkthrough: what the steps are, and when each one is allowed to
 * end. No DOM anywhere in this file, so the rules are testable in plain Node
 * and the overlay in `walkthroughOverlay.ts` stays a renderer.
 *
 * Three decisions are worth defending here, because all three are easy to undo
 * by accident later.
 *
 * It runs ON TOP of the real training mission, not beside it. The training
 * mission already teaches the gesture; the tour teaches where things are. A
 * second, mock interface would teach a child the layout of a thing that does
 * not exist, so the selectors below point at the live training screen and the
 * child's clicks land on the real controls.
 *
 * Doing beats reading. Steps that merely name a thing end on a button. Steps
 * that teach a gesture - the zoom and the snip - end only when the gesture
 * actually happens, and carry no button at all. `canAdvanceOn` is what enforces
 * that, and the tests hold it in place.
 *
 * THE SNIP STEP CARRIES NO SCRIM. This is the one rule in the file that is a
 * correctness constraint rather than a design preference. `Windows + Shift + S`
 * photographs the screen as it is, so a dark scrim would be *in* the child's
 * evidence; worse, the decoder rejects any pixel whose HSV value is below 0.45
 * (`MIN_VALUE` in `sealDecoder.ts`), and a scrim over the poster pushes a
 * perfectly good seal under that floor. A seal photographed through a scrim
 * decodes as nothing at all. `scrim: false` on `snip` is therefore load-bearing
 * and `test/walkthrough.test.ts` asserts it.
 */

/** Everything that can end a step. */
export type WalkthroughTrigger =
  /** The child pressed the bubble's own button. */
  | 'next'
  /** The child actually zoomed the poster in. */
  | 'zoom-in'
  /** An image actually arrived in the evidence box. */
  | 'paste'
  /** The step steps aside on its own once the child has had time to read it. */
  | 'auto';

export interface WalkthroughStep {
  id: string;
  /**
   * CSS selector of the element to cut the spotlight hole over, or null for a
   * step that deliberately highlights nothing.
   *
   * A selector that matches nothing is not an error: the tour skips the step.
   * Screens change, and a missing rail is not a reason to strand a child behind
   * an overlay they cannot dismiss.
   */
  target: string | null;
  /** One instruction, 10-15 words, Spanish, for a 7-9 year old. */
  text: string;
  /** How this step ends. */
  trigger: WalkthroughTrigger;
  /**
   * Label of the bubble's advance button.
   *
   * Absent on a gesture-gated step, and that absence is the whole mechanism: a
   * step with no button cannot be clicked past.
   */
  buttonLabel?: string;
  /** Key caps to show under the text, e.g. Win + Shift + S. */
  keys?: readonly string[];
  /**
   * Whether this step darkens the rest of the screen.
   *
   * False only on the snip step. See the file header: a scrim in the screenshot
   * is both ugly and, because of `MIN_VALUE`, undecodable.
   */
  scrim: boolean;
  /** Draw the "the photo is of this window" diagram inside the bubble. */
  diagram?: boolean;
  /** How long an `auto` step waits before moving on, in milliseconds. */
  autoAdvanceMs?: number;
}

/**
 * The tour, in order, over the training screen.
 *
 * Selectors point at the training screen's own elements rather than at a set of
 * ids added for the tour, so a step whose element is renamed goes quiet (it is
 * skipped) instead of pointing the spotlight at empty floor.
 */
export const WALKTHROUGH_STEPS: readonly WalkthroughStep[] = [
  {
    id: 'poster',
    target: '.training__poster',
    text: 'Este es el parque. Aquí vas a buscar cada pista escondida.',
    trigger: 'next',
    buttonLabel: 'Siguiente',
    scrim: true,
  },
  {
    id: 'steps',
    target: '.training__instructions',
    text: 'Aquí aparecen los pasos, uno por uno. Sigue siempre el paso iluminado.',
    trigger: 'next',
    buttonLabel: 'Siguiente',
    scrim: true,
  },
  {
    id: 'zoom',
    // Earned, not clicked past: no `buttonLabel`, so the only way out of this
    // step is to press the + button that the spotlight is sitting on.
    target: '.poster-viewer__controls',
    text: 'Toca el botón más para acercarte. Los sellos son muy pequeños.',
    trigger: 'zoom-in',
    scrim: true,
  },
  {
    id: 'snip',
    /*
     * No spotlight and no scrim. The child is about to photograph the screen,
     * so the screen must be the screen. The overlay shows only a small hint
     * parked in whichever viewport corner is furthest from the poster.
     *
     * This bubble carries the one genuinely hard idea in the whole application.
     * Everything else here is mechanical: press this, drag that. Understanding
     * that `Windows + Shift + S` photographs *this window, as it looks right
     * now* - and not a file, and not some other program - is the single
     * conceptual leap, so it gets the diagram and it gets said plainly.
     */
    target: null,
    text: 'La foto se toma del parque como se ve aquí, en tu ventana.',
    trigger: 'paste',
    keys: ['Win', 'Shift', 'S'],
    scrim: false,
    diagram: true,
  },
  {
    id: 'evidence',
    target: '.evidence',
    text: 'Tu recorte llegó aquí. Esta es tu caja de evidencia.',
    trigger: 'auto',
    // Long enough to read twice. The step also ends on a click, so a fast child
    // is never made to wait and a slow one is never rushed off the sentence.
    autoAdvanceMs: 4000,
    buttonLabel: 'Siguiente',
    scrim: true,
  },
  {
    id: 'rail',
    target: '.rail',
    text: 'Cada pista que encuentres destapa una pieza del rompecabezas.',
    trigger: 'next',
    buttonLabel: '¡Empezar!',
    scrim: true,
  },
];

/**
 * True when `trigger` is allowed to end `step`.
 *
 * A gesture step accepts its gesture and nothing else, which is what stops a
 * child clicking through the two steps that are the point of the exercise. An
 * `auto` step also accepts `next`, because its button is a shortcut past its
 * own timer rather than a way around a gesture.
 */
export function canAdvanceOn(step: WalkthroughStep, trigger: WalkthroughTrigger): boolean {
  if (step.trigger === trigger) return true;
  return step.trigger === 'auto' && trigger === 'next';
}

export interface WalkthroughMachineOptions {
  /** Defaults to the shipped tour; injectable so tests can drive a short one. */
  steps?: readonly WalkthroughStep[];
  /**
   * Whether a selector currently resolves to something on screen. Steps whose
   * target is absent are skipped rather than shown against empty floor.
   */
  isTargetPresent: (selector: string) => boolean;
  /** The step changed. Fires for the first step too. */
  onStep?: (step: WalkthroughStep, position: number, total: number) => void;
  /** The tour ended, either finished or skipped. */
  onEnd?: (reason: 'finished' | 'skipped') => void;
}

export interface WalkthroughMachine {
  /**
   * Announces the first step.
   *
   * Separate from construction because the caller wires its renderer to
   * `onStep` and only then starts; announcing from the factory would fire the
   * first step into a listener that does not exist yet.
   */
  start(): void;
  /** The step on screen, or null once the tour has ended. */
  current(): WalkthroughStep | null;
  /** Position of the current step among the steps that will actually be shown. */
  position(): number;
  /** How many steps this run will show, after absent targets are dropped. */
  total(): number;
  /** Reports something that happened. Ignored when it does not fit the step. */
  fire(trigger: WalkthroughTrigger): void;
  /** The quiet "Saltar guía" escape hatch. */
  skip(): void;
  isDone(): boolean;
}

/**
 * The tour as a state machine.
 *
 * `isTargetPresent` is consulted lazily, one step at a time, and never up
 * front: the evidence box and the rail exist for the whole of the training
 * screen's life, but a screen that mounted something late would otherwise have
 * its step dropped before it appeared.
 */
export function createWalkthroughMachine(
  options: WalkthroughMachineOptions,
): WalkthroughMachine {
  const steps = options.steps ?? WALKTHROUGH_STEPS;

  /** Indices of the steps this run will show. Absent targets are dropped. */
  const shown = steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => step.target === null || options.isTargetPresent(step.target))
    .map(({ index }) => index);

  let cursor = 0;
  let done = shown.length === 0;

  function announce(): void {
    const step = api.current();
    if (step) options.onStep?.(step, cursor, shown.length);
  }

  function finish(reason: 'finished' | 'skipped'): void {
    if (done) return;
    done = true;
    options.onEnd?.(reason);
  }

  const api: WalkthroughMachine = {
    start() {
      if (done) {
        // Every step's target was missing. Ending immediately is the only kind
        // behaviour left: an empty tour must not park a scrim over the screen.
        options.onEnd?.('finished');
        return;
      }
      announce();
    },
    current: () => (done ? null : steps[shown[cursor]]),
    position: () => cursor,
    total: () => shown.length,
    fire(trigger) {
      const step = api.current();
      if (!step || !canAdvanceOn(step, trigger)) return;
      cursor += 1;
      if (cursor >= shown.length) {
        finish('finished');
        return;
      }
      announce();
    },
    skip() {
      finish('skipped');
    },
    isDone: () => done,
  };

  return api;
}
