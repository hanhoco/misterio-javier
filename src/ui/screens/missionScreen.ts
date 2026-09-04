/**
 * A story mission: find one object on the park poster and send the evidence.
 *
 * The screen is built from the mission's data, never from a hardcoded target.
 * It is handed a `StoryMission` and the loaded poster, and everything it shows
 * - the objective, the clue, the counter, which seal counts as correct - comes
 * from those two. A sixteenth park target becomes a sixteenth mission with no
 * edit here.
 *
 * Feedback is positive whatever happened, per the brief: a wrong crop is "Great
 * searching!", never "wrong".
 */

import { recordAttempt, storyFoundCount } from '../../game/gameState';
import { STORY_MISSIONS, type StoryMission } from '../../game/missions';
import { scoreMission, type PrecisionTier } from '../../game/scoring';
import type { LoadedPoster } from '../../poster/posterSource';
import {
  decodeSealWithDiagnostics,
  type DecodeDiagnostics,
} from '../../validation/sealDecoder';
import { buildVerdict, type Verdict, type VerdictKind } from '../../validation/verdict';
import { attachCropGuide, type CropGuideHandle } from '../cropGuideOverlay';
import { isDevToolsRequested } from '../devMode';
import { button, element } from '../dom';
import { createEvidenceBox, type FeedbackTone } from '../evidenceBox';
import { createPosterStage, type PosterStage } from '../posterStage';
import type { Screen, ScreenContext } from './context';

/** Child-facing copy per verdict, warm on every branch. */
const FEEDBACK: Record<VerdictKind, { message: string; tone: FeedbackTone }> = {
  PRECISE: { message: 'You found the clue! And what a lovely crop. 🎉', tone: 'success' },
  LOOSE: { message: 'You found the clue! 🎉', tone: 'success' },
  TOO_WIDE: {
    message: 'You found the clue! Next time, zoom in a little bit more.',
    tone: 'success',
  },
  WRONG_OBJECT: {
    message: 'Great searching! That is another park clue. Keep looking for yours.',
    tone: 'warning',
  },
  AMBIGUOUS: {
    message: 'So close! Your crop has several clues. Try cropping just the object.',
    tone: 'warning',
  },
  NO_SEAL: {
    message: 'So close! I did not see the clue in your crop. Take another calm look.',
    tone: 'warning',
  },
  TOO_SMALL: {
    message: 'Try zooming in a little bit more, then crop again.',
    tone: 'warning',
  },
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
    `Mission ${mission.storyNumber} of ${STORY_MISSIONS.length} · ` +
      `Clues found: ${storyFoundCount(context.getProgress())}/${STORY_MISSIONS.length}`,
  );
  brief.appendChild(counter);
  brief.appendChild(element('h2', 'brief__objective', `🔎 ${mission.objective}`));
  brief.appendChild(element('p', 'brief__clue', mission.clue));
  root.appendChild(brief);

  /* Poster ---------------------------------------------------------------- */
  const stage = createPosterStage({ poster: poster.canvas, showReadiness: true });
  root.appendChild(stage.root);

  /*
   * The crop guide.
   *
   * The readiness light answers "may I crop yet?" and a child who reaches green
   * still has no idea WHAT to crop or how big - they crop too wide, too tight,
   * or off-centre. The guide answers the second question and only the second
   * question: it appears once the child has found the object AND zoomed in on
   * it themselves, never before, so it teaches the gesture without giving away
   * the search. See `src/viewer/cropGuide.ts`.
   *
   * Attached here rather than inside the stage because only a mission has a
   * target: the tutorial and the drills use the same stage over a practice
   * picture where there is nothing to guide towards.
   */
  let guidedMode = context.getProgress().guidedMode;
  const guide: CropGuideHandle | null = target
    ? attachCropGuide({ viewer: stage.viewer, target, guidedMode })
    : null;
  const stopWatchingGuidedMode = context.onGuidedModeChange((enabled) => {
    guidedMode = enabled;
    guide?.setGuidedMode(enabled);
  });

  /* Evidence -------------------------------------------------------------- */
  const continueButton = button('Next mission ➜', 'button button--primary button--big');
  continueButton.hidden = true;
  continueButton.addEventListener('click', () => options.onContinue());

  const evidence = createEvidenceBox({
    compact: true,
    title: 'Paste your evidence here',
    hint: 'Crop the object in the picture above with Windows + Shift + S.',
    onImage(pasted) {
      if (!target) {
        evidence.say('This poster does not have that object. Tell your teacher.', 'error');
        return;
      }

      evidence.showPreview(pasted);

      const report = decodeSealWithDiagnostics(pasted.image);
      /*
       * The EFFECTIVE scale goes in - CSS zoom times device pixel ratio - so a
       * crop taken below the readable floor is answered with "zoom in", never
       * with "that is not the clue". A child who cannot possibly have produced a
       * readable crop has not found the wrong object; they have not been given
       * a fair chance to find the right one.
       *
       * It has to be the effective scale and not the zoom label, or the game
       * goes back to being right on a Retina screen and wrong on the school
       * laptops that twenty-eight children are actually sitting at.
       */
      const verdict = buildVerdict(
        target,
        report.result,
        pasted.width,
        pasted.height,
        poster.findBySealCode,
        stage.viewer.getEffectiveScale(),
      );

      const copy = FEEDBACK[verdict.kind];
      evidence.say(copy.message, copy.tone);
      evidence.showFacts(factsFor(verdict, pasted.width, pasted.height, report.diagnostics));

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
        reward.textContent = `+${earned} points · piece ${mission.puzzlePieceIndex + 1} unlocked`;
        reward.hidden = false;
        continueButton.hidden = false;
        continueButton.focus();
      } else {
        context.sound.play('gentle');
        counter.textContent =
          `Mission ${mission.storyNumber} of ${STORY_MISSIONS.length} · ` +
          `Tries: ${next.missions[mission.id]?.attempts ?? 1}`;
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
      exposeDiagnostics(stage, poster, {
        guide,
        target,
        guidedMode: () => guidedMode,
      });
    },
    destroy() {
      evidence.destroy();
      stopWatchingGuidedMode();
      // Before the stage: the guide clears its own overlay renderer, and doing
      // that through a viewer whose observers are already gone is one more
      // ordering nobody should have to remember.
      guide?.destroy();
      stage.destroy();
      if (isDevToolsRequested()) delete window.__missionProbe;
    },
  };
}

/**
 * What a mission screen looks like from the outside, under `?dev=1`.
 *
 * The classroom failure could not be reproduced by reading the code: it needed
 * the actual device pixels a child's screenshot would contain, at the actual
 * zoom their laptop opened at. This is the handle that makes that measurable
 * from outside the browser - the viewer's transform, so a target's on-screen
 * box can be computed, and the target list to compute it for.
 *
 * Behind the same `?dev=1` as the marking tool, so a class never sees it.
 */
declare global {
  interface Window {
    __missionProbe?: {
      viewer: PosterStage['viewer'];
      targets: LoadedPoster['targets'];
      scaleState: () => ReturnType<PosterStage['viewer']['getScaleState']>;
      readiness: () => ReturnType<PosterStage['readiness']>;
      guidedMode: () => boolean;
      guideTargetId: string | null;
      guideVisible: () => boolean;
      guideRect: () => ReturnType<CropGuideHandle['screenRect']> | null;
    };
  }
}

/**
 * The `?dev=1` probe. `guide` carries the crop-guide state so a CDP run can
 * assert the guide is hidden at the opening zoom and visible once the light is
 * green, which is the pair of facts a screenshot alone cannot prove.
 */
function exposeDiagnostics(
  stage: PosterStage,
  poster: LoadedPoster,
  guideState: {
    guide: CropGuideHandle | null;
    target: LoadedPoster['targets'][number] | null | undefined;
    guidedMode: () => boolean;
  },
): void {
  if (!isDevToolsRequested()) return;
  window.__missionProbe = {
    viewer: stage.viewer,
    targets: poster.targets,
    scaleState: () => stage.viewer.getScaleState(),
    readiness: () => stage.readiness(),
    guidedMode: guideState.guidedMode,
    guideTargetId: guideState.target?.id ?? null,
    guideVisible: () => guideState.guide?.isVisible() ?? false,
    guideRect: () => guideState.guide?.screenRect() ?? null,
  };
}

/** The reader's own numbers, shown small, under the friendly sentence. */
function factsFor(
  verdict: Verdict,
  width: number,
  height: number,
  diagnostics?: DecodeDiagnostics,
): Array<[string, string]> {
  const facts: Array<[string, string]> = [['Your crop', `${width} x ${height} px`]];
  if (verdict.capturedObjectName) facts.push(['You cropped', verdict.capturedObjectName]);
  if (verdict.areaRatio !== undefined) {
    facts.push(['Size', `${verdict.areaRatio.toFixed(1)}x the object`]);
  }
  if (!verdict.success && diagnostics) facts.push(['Reader', readerNote(diagnostics)]);
  return facts;
}

/**
 * One line naming the stage the decode died at, shown to everyone on a failure.
 *
 * This is here because three separate diagnoses of the classroom failures were
 * wrong, each one plausible and each one costing a lesson. The decoder knows
 * exactly where it stopped; it just never said. Now a single photograph of a
 * failed attempt settles colour versus geometry versus identity, instead of
 * another round of theory.
 *
 * The wording stays plain enough that a child reading it over their own
 * shoulder is not alarmed by it.
 */
function readerNote(d: DecodeDiagnostics): string {
  if (d.saturatedPixelCount === 0) return 'no bright colour in the crop';
  if (d.classifiedPixelCount === 0) {
    // Saturated ink is present but none of it matched a reserved hue: the
    // colours reached the screenshot shifted. Colour management against a
    // non-sRGB monitor profile does this, and it is invisible on screen.
    return `${d.saturatedPixelCount} bright pixels, none the right colour`;
  }
  if (d.blobCount === 0) {
    return `${d.classifiedPixelCount} colour pixels, too small or misshapen`;
  }
  if (d.seals.length === 0) {
    return `${d.blobCount} dots, no cross among them`;
  }
  return `read ${d.seals.map((seal) => seal.code).join(', ')}`;
}
