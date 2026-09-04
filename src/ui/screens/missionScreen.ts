/**
 * A story mission: find one object on the park poster and send the evidence.
 *
 * The screen is built from the mission's data, never from a hardcoded target.
 * It is handed a `StoryMission` and the loaded poster, and everything it shows
 * - the objective, the clue, the counter, which seal counts as correct - comes
 * from those two. A sixteenth park target becomes a sixteenth mission with no
 * edit here.
 *
 * Feedback is positive whatever happened, per the brief: a wrong crop is "¡Muy
 * buena búsqueda!", never "incorrecto".
 */

import { recordAttempt, storyFoundCount } from '../../game/gameState';
import { STORY_MISSIONS, type StoryMission } from '../../game/missions';
import { scoreMission, type PrecisionTier } from '../../game/scoring';
import type { LoadedPoster } from '../../poster/posterSource';
import { decodeSealWithDiagnostics } from '../../validation/sealDecoder';
import { buildVerdict, type Verdict, type VerdictKind } from '../../validation/verdict';
import { button, element } from '../dom';
import { createEvidenceBox, type FeedbackTone } from '../evidenceBox';
import { createPosterStage } from '../posterStage';
import type { Screen, ScreenContext } from './context';

/** Child-facing copy per verdict, warm on every branch. */
const FEEDBACK: Record<VerdictKind, { message: string; tone: FeedbackTone }> = {
  PRECISE: { message: '¡Encontraste la pista! Y tu recorte quedó precioso. 🎉', tone: 'success' },
  LOOSE: { message: '¡Encontraste la pista! 🎉', tone: 'success' },
  TOO_WIDE: {
    message: '¡Encontraste la pista! La próxima vez, acércate un poquito más.',
    tone: 'success',
  },
  WRONG_OBJECT: {
    message: '¡Muy buena búsqueda! Esa es otra pista del parque. Sigue buscando la tuya.',
    tone: 'warning',
  },
  AMBIGUOUS: {
    message: '¡Casi! Tu recorte tiene varias pistas. Intenta recortar solo el objeto.',
    tone: 'warning',
  },
  NO_SEAL: {
    message: '¡Casi! No vi la pista en tu recorte. Mira otra vez con calma.',
    tone: 'warning',
  },
  TOO_SMALL: { message: 'Intenta acercarte un poquito más con el zoom.', tone: 'warning' },
};

/** How the verdict's grading maps onto the tier stored and scored. */
function precisionOf(verdict: Verdict): PrecisionTier {
  if (verdict.kind === 'PRECISE') return 'precise';
  if (verdict.kind === 'LOOSE') return 'close';
  if (verdict.kind === 'TOO_WIDE') return 'wide';
  return 'none';
}

export interface MissionScreenOptions {
  mission: StoryMission;
  poster: LoadedPoster;
  context: ScreenContext;
  /** Called when the child presses continue after finding the clue. */
  onContinue: () => void;
}

export function createMissionScreen(options: MissionScreenOptions): Screen {
  const { mission, poster, context } = options;
  const root = element('section', 'screen screen--mission');

  const target = poster.targets.find((candidate) => candidate.id === mission.targetId);

  /* Objective ------------------------------------------------------------- */
  const brief = element('div', 'brief');
  const counter = element(
    'p',
    'brief__counter',
    `Misión ${mission.storyNumber} de ${STORY_MISSIONS.length} · ` +
      `Pistas encontradas: ${storyFoundCount(context.getProgress())}/${STORY_MISSIONS.length}`,
  );
  brief.appendChild(counter);
  brief.appendChild(element('h2', 'brief__objective', `🔎 ${mission.objective}`));
  brief.appendChild(element('p', 'brief__clue', mission.clue));
  root.appendChild(brief);

  /* Poster ---------------------------------------------------------------- */
  const stage = createPosterStage({ poster: poster.canvas });
  root.appendChild(stage.root);

  /* Evidence -------------------------------------------------------------- */
  const continueButton = button('Siguiente misión ➜', 'button button--primary button--big');
  continueButton.hidden = true;
  continueButton.addEventListener('click', () => options.onContinue());

  const evidence = createEvidenceBox({
    compact: true,
    title: 'Pega aquí tu evidencia',
    hint: 'Recorta el objeto en la imagen de arriba con Windows + Shift + S.',
    onImage(pasted) {
      if (!target) {
        evidence.say('Este póster no tiene ese objeto. Avísale a tu profe.', 'error');
        return;
      }

      evidence.showPreview(pasted);

      const report = decodeSealWithDiagnostics(pasted.image);
      const verdict = buildVerdict(
        target,
        report.result,
        pasted.width,
        pasted.height,
        poster.findBySealCode,
      );

      const copy = FEEDBACK[verdict.kind];
      evidence.say(copy.message, copy.tone);
      evidence.showFacts(factsFor(verdict, pasted.width, pasted.height));

      const next = recordAttempt(context.getProgress(), mission.id, {
        success: verdict.success,
        precision: precisionOf(verdict),
      });
      context.save(next);

      if (verdict.success) {
        context.sound.play('success');
        evidence.setEnabled(false);
        const earned = scoreMission(mission.rewards, {
          found: true,
          attempts: next.missions[mission.id]?.attempts ?? 1,
          precision: precisionOf(verdict),
        });
        reward.textContent = `+${earned} puntos · pieza ${mission.puzzlePieceIndex + 1} desbloqueada`;
        reward.hidden = false;
        continueButton.hidden = false;
        continueButton.focus();
      } else {
        context.sound.play('gentle');
        counter.textContent =
          `Misión ${mission.storyNumber} de ${STORY_MISSIONS.length} · ` +
          `Intentos: ${next.missions[mission.id]?.attempts ?? 1}`;
      }
    },
  });

  const reward = element('p', 'mission__reward', '');
  reward.hidden = true;

  const actions = element('div', 'mission__actions');
  actions.append(reward, continueButton);

  root.append(evidence.root, actions);

  return {
    root,
    mounted() {
      // The stage only has a size once the screen is in the document, and a fit
      // measured before that is a fit against nothing.
      stage.fit();
    },
    destroy() {
      evidence.destroy();
    },
  };
}

/** The reader's own numbers, shown small, under the friendly sentence. */
function factsFor(
  verdict: Verdict,
  width: number,
  height: number,
): Array<[string, string]> {
  const facts: Array<[string, string]> = [['Tu recorte', `${width} x ${height} px`]];
  if (verdict.capturedObjectName) facts.push(['Recortaste', verdict.capturedObjectName]);
  if (verdict.areaRatio !== undefined) {
    facts.push(['Tamaño', `${verdict.areaRatio.toFixed(1)}x el objeto`]);
  }
  return facts;
}
