/**
 * The finale: the board complete, the picture revealed, the code in hand.
 *
 * Reached only when every mission - the fifteen story clues and the three
 * drills - has been finished.
 */

import {
  progressScore,
  storyFoundCount,
  totalAttempts,
  type GameProgress,
} from '../../game/gameState';
import { MISSION_REWARDS, STORY_MISSIONS } from '../../game/missions';
import { maxTotalScore } from '../../game/scoring';
import { button, element } from '../dom';
import { createPuzzleBoard } from '../puzzleBoard';
import { createResultCodeCard } from '../resultCodeCard';
import type { Screen } from './context';

export interface PuzzleScreenOptions {
  progress: GameProgress;
  onReplayTraining: () => void;
  onChangeProfile: () => void;
}

export function createPuzzleScreen(options: PuzzleScreenOptions): Screen {
  const { progress } = options;
  const root = element('section', 'screen screen--finale');

  const banner = element('div', 'finale__banner');
  banner.appendChild(
    element('h1', 'finale__title', '🏆 YOU SOLVED THE MYSTERY OF JAVIER!'),
  );
  banner.appendChild(
    element(
      'p',
      'finale__subtitle',
      `You found all ${STORY_MISSIONS.length} clues and learned every shortcut. ` +
        'Javier says thank you.',
    ),
  );
  root.appendChild(banner);

  const board = createPuzzleBoard({ variant: 'full' });
  board.revealAll();
  root.appendChild(board.root);

  const score = progressScore(progress);
  const stats = element('div', 'finale__stats');
  for (const [label, value] of [
    ['Clues found', `${storyFoundCount(progress)}/${STORY_MISSIONS.length}`],
    ['Score', `${score} of ${maxTotalScore(MISSION_REWARDS)}`],
    ['Tries used', String(totalAttempts(progress))],
  ] as const) {
    const stat = element('div', 'stat');
    stat.appendChild(element('span', 'stat__value', value));
    stat.appendChild(element('span', 'stat__label', label));
    stats.appendChild(stat);
  }
  root.appendChild(stats);

  root.appendChild(createResultCodeCard(progress));

  const actions = element('div', 'finale__actions');
  const replay = button('Do the training again', 'button button--ghost');
  replay.addEventListener('click', options.onReplayTraining);
  const change = button('Play with another name', 'button button--ghost');
  change.addEventListener('click', options.onChangeProfile);
  actions.append(replay, change);
  root.appendChild(actions);

  return {
    root,
    destroy() {
      /* Nothing global was attached. */
    },
  };
}
