/**
 * The result code, shown to the child so they can read it out or copy it.
 *
 * Displayed in one big monospaced block with the groups intact, because the
 * whole design of the code assumes it will be transcribed by hand at some
 * point. The copy button is a convenience, not the plan.
 */

import { MISSIONS } from '../game/missions';
import { missionProgress, type GameProgress } from '../game/gameState';
import { encodeResultCode, type MissionResult } from '../game/resultCode';
import { button, element } from './dom';

/** Turns a run into the flat list the code encoder wants. */
export function resultCodeFor(progress: GameProgress): string {
  const missions: MissionResult[] = MISSIONS.map((mission) => {
    const state = missionProgress(progress, mission.id);
    return { found: state.found, attempts: state.attempts, precision: state.precision };
  });
  return encodeResultCode({ name: progress.name, missions });
}

export function createResultCodeCard(progress: GameProgress): HTMLElement {
  const code = resultCodeFor(progress);

  const card = element('section', 'result-code');
  card.appendChild(element('h3', 'result-code__title', 'Your result code'));
  card.appendChild(
    element(
      'p',
      'result-code__hint',
      'Read or write this code to your teacher. With it they can see how you did.',
    ),
  );

  const value = element('p', 'result-code__value', code);
  value.setAttribute('aria-label', `Result code: ${code.split('').join(' ')}`);
  card.appendChild(value);

  const copy = button('Copy the code', 'button button--ghost');
  const status = element('span', 'result-code__status', '');
  status.setAttribute('role', 'status');

  copy.addEventListener('click', () => {
    const done = () => {
      status.textContent = 'Copied!';
      window.setTimeout(() => {
        status.textContent = '';
      }, 2500);
    };

    // `writeText` needs a permission on some managed machines, so the selection
    // fallback matters: it is what a child on a locked-down laptop gets.
    void navigator.clipboard
      ?.writeText(code)
      .then(done)
      .catch(() => {
        const selection = window.getSelection();
        if (!selection) return;
        const range = document.createRange();
        range.selectNodeContents(value);
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Select it and press Ctrl + C.';
      });
  });

  const actions = element('div', 'result-code__actions');
  actions.append(copy, status);
  card.appendChild(actions);

  return card;
}
