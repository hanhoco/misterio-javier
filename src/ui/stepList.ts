/**
 * A sequence of instructions revealed one at a time.
 *
 * Shared by the training mission and by the drills, because they are the same
 * mechanic: show one thing to do, wait for the cue that says it happened, tick
 * it off, show the next. Future steps are not merely dimmed, they are absent -
 * six instructions on screen at once is exactly the wall of text the brief says
 * to avoid, and a child who reads ahead stops following along.
 *
 * Every step that the browser cannot observe reliably also carries a button, so
 * a missed cue costs a tap rather than the whole tutorial.
 */

import type { GuidedStep, StepTrigger } from '../game/missions';
import { button, element, keyHint } from './dom';

export interface StepListOptions {
  steps: readonly GuidedStep[];
  /** Fires when a step is ticked off, with the index of the step completed. */
  onStepDone?: (index: number) => void;
  /** Fires once, after the last step. */
  onFinished?: () => void;
}

export interface StepList {
  root: HTMLElement;
  /**
   * Reports something that happened. Ticks the current step off when its
   * trigger matches, and is otherwise ignored - which is what stops an early
   * Ctrl+V racing past three instructions at once.
   */
  fire(trigger: StepTrigger): void;
  currentStep(): GuidedStep | null;
  currentIndex(): number;
  isFinished(): boolean;
}

export function createStepList(options: StepListOptions): StepList {
  const { steps } = options;
  const root = element('ol', 'steps');
  let index = 0;
  let finished = steps.length === 0;

  const items = steps.map((step, position) => {
    const item = element('li', 'steps__item');

    const badge = element('span', 'steps__badge', String(position + 1));
    const body = element('div', 'steps__body');
    body.appendChild(element('p', 'steps__text', step.text));
    if (step.keys) body.appendChild(keyHint(step.keys));

    item.append(badge, body);

    if (step.buttonLabel) {
      const action = button(step.buttonLabel, 'button button--ghost steps__action');
      action.addEventListener('click', () => advance(position));
      item.appendChild(action);
    }

    return item;
  });

  for (const item of items) root.appendChild(item);

  function paint(): void {
    items.forEach((item, position) => {
      item.classList.toggle('is-done', position < index);
      item.classList.toggle('is-current', position === index && !finished);
      // Not yet reached: kept out of the document flow entirely.
      item.hidden = position > index;
    });
  }

  function advance(position: number): void {
    if (finished || position !== index) return;
    options.onStepDone?.(position);
    index += 1;
    if (index >= steps.length) {
      finished = true;
      paint();
      options.onFinished?.();
      return;
    }
    paint();
  }

  paint();

  return {
    root,
    fire(trigger) {
      if (finished) return;
      if (steps[index].trigger === trigger) advance(index);
    },
    currentStep: () => (finished ? null : steps[index]),
    currentIndex: () => index,
    isFinished: () => finished,
  };
}
