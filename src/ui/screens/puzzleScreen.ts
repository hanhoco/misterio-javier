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
    element('h1', 'finale__title', '🏆 ¡RESOLVISTE EL MISTERIO DE JAVIER!'),
  );
  banner.appendChild(
    element(
      'p',
      'finale__subtitle',
      `Encontraste las ${STORY_MISSIONS.length} pistas y aprendiste todos los atajos. ` +
        'Javier te lo agradece.',
    ),
  );
  root.appendChild(banner);

  const board = createPuzzleBoard({ variant: 'full' });
  board.revealAll();
  root.appendChild(board.root);

  const score = progressScore(progress);
  const stats = element('div', 'finale__stats');
  for (const [label, value] of [
    ['Pistas encontradas', `${storyFoundCount(progress)}/${STORY_MISSIONS.length}`],
    ['Puntaje', `${score} de ${maxTotalScore(MISSION_REWARDS)}`],
    ['Intentos usados', String(totalAttempts(progress))],
  ] as const) {
    const stat = element('div', 'stat');
    stat.appendChild(element('span', 'stat__value', value));
    stat.appendChild(element('span', 'stat__label', label));
    stats.appendChild(stat);
  }
  root.appendChild(stats);

  root.appendChild(createResultCodeCard(progress));

  const actions = element('div', 'finale__actions');
  const replay = button('Repetir el entrenamiento', 'button button--ghost');
  replay.addEventListener('click', options.onReplayTraining);
  const change = button('Jugar con otro nombre', 'button button--ghost');
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
