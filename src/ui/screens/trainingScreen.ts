/**
 * Stage 2: the guided tutorial, before mission 1.
 *
 * Six steps, one at a time, on a picture with one big obvious object carrying
 * its own dedicated seal.
 *
 * Nothing here is graded. The paste is confirmed and that is all: the point is
 * that a child learns the Windows+Shift+S -> Ctrl+V loop without a verdict
 * hanging over it. Telling a seven year old their first ever crop was "wrong"
 * teaches them the tool is hostile, not how to use it.
 *
 * Steps three and five lean on window blur and focus, because that is exactly
 * what the Windows snipping overlay causes, but both also carry a button: the
 * cue is a nicety and must never be the only way forward.
 */

import { TRAINING_MISSION } from '../../game/missions';
import { renderPracticePoster } from '../../poster/practicePoster';
import { createEvidenceBox } from '../evidenceBox';
import { button, element } from '../dom';
import { createPosterStage } from '../posterStage';
import { createStepList } from '../stepList';
import { mountWalkthroughOverlay, type WalkthroughOverlay } from '../walkthroughOverlay';
import type { Screen } from './context';
import type { SoundBoard } from '../sound';

export interface TrainingScreenOptions {
  sound: SoundBoard;
  /** Finished the six steps, or chose to skip. */
  onDone: () => void;
  /** True when the child asked to replay it, which changes the wording. */
  isReplay?: boolean;
  /**
   * Run the blocking walkthrough on top of this screen.
   *
   * The tour is not a second tutorial: it runs over these very controls, so
   * what the child learns is the layout of the app they are actually holding.
   */
  runWalkthrough?: boolean;
  /** The tour ended, finished or skipped. Only fires when it was run. */
  onWalkthroughEnd?: () => void;
}

export function createTrainingScreen(options: TrainingScreenOptions): Screen {
  const root = element('section', 'screen screen--training');

  /**
   * The coach-mark tour, once the screen is mounted and measurable.
   *
   * Declared here rather than beside `mounted()` because the zoom and paste
   * handlers below close over it, and both are wired while it is still null.
   */
  let walkthrough: WalkthroughOverlay | null = null;

  /* Header ---------------------------------------------------------------- */
  const header = element('div', 'screen__header');
  const heading = element('div', 'screen__heading');
  heading.appendChild(element('h1', 'screen__title', TRAINING_MISSION.title));
  heading.appendChild(element('p', 'screen__subtitle', TRAINING_MISSION.objective));
  header.appendChild(heading);

  const skip = button(
    options.isReplay ? 'Volver a las misiones' : 'Ya sé hacerlo, saltar',
    'button button--ghost',
  );
  skip.addEventListener('click', () => options.onDone());
  header.appendChild(skip);
  root.appendChild(header);

  root.appendChild(element('p', 'callout', TRAINING_MISSION.intro));

  /* Body ------------------------------------------------------------------ */
  const body = element('div', 'training__body');

  const practice = renderPracticePoster({
    shape: TRAINING_MISSION.shape,
    sealCode: TRAINING_MISSION.sealCode,
    name: TRAINING_MISSION.shapeName,
    id: TRAINING_MISSION.id,
  });

  const stage = createPosterStage({
    poster: practice.canvas,
    stageClass: 'poster-viewer__stage--practice',
    onZoomIn: () => {
      steps.fire('zoom-in');
      // The tour's zoom step is earned, not clicked past, so it listens to the
      // same real gesture the training step does.
      walkthrough?.fire('zoom-in');
    },
  });

  const posterColumn = element('div', 'training__poster');
  posterColumn.appendChild(stage.root);

  const sideColumn = element('div', 'training__side');

  const steps = createStepList({
    steps: TRAINING_MISSION.steps,
    onStepDone: () => options.sound.play('click'),
    onFinished: () => {
      finished = true;
      evidence.setEnabled(false);
      evidence.say(TRAINING_MISSION.successMessage, 'success');
      options.sound.play('success');
      continueButton.hidden = false;
      continueButton.focus();
    },
  });

  const evidence = createEvidenceBox({
    hint: 'Cuando termines el recorte, presiona Ctrl + V aquí.',
    onImage(pasted) {
      evidence.showPreview(pasted);
      // Deliberately not graded: receipt only.
      evidence.say('Recibí tu recorte. 👍', 'success');
      steps.fire('paste');
      walkthrough?.fire('paste');
    },
    onNonImage() {
      evidence.say(
        'Todavía no hay una imagen en el portapapeles. Vuelve a recortar con ' +
          'Windows + Shift + S y pega otra vez.',
        'warning',
      );
    },
  });

  const continueButton = button('¡Vamos a la misión 1!', 'button button--primary button--big');
  continueButton.hidden = true;
  continueButton.addEventListener('click', () => options.onDone());

  const instructions = element('div', 'training__instructions');
  instructions.append(element('p', 'aim-note', TRAINING_MISSION.aimNote), steps.root);

  sideColumn.append(instructions, evidence.root, continueButton);
  body.append(posterColumn, sideColumn);
  root.appendChild(body);

  /* Window cues ----------------------------------------------------------- */
  let finished = false;
  const onBlur = () => {
    if (!finished) steps.fire('blur');
  };
  const onFocus = () => {
    if (!finished) steps.fire('focus');
  };
  window.addEventListener('blur', onBlur);
  window.addEventListener('focus', onFocus);

  return {
    root,
    mounted() {
      stage.fit();
      // Only now is every element the tour points at in the document and
      // measured; a spotlight built before this would be cut over a zero box.
      if (options.runWalkthrough) {
        walkthrough = mountWalkthroughOverlay({
          // A fixed, full-viewport overlay belongs to the viewport, not to the
          // screen's own column, so it hangs off the body rather than off root.
          host: document.body,
          onEnd() {
            walkthrough = null;
            options.onWalkthroughEnd?.();
          },
        });
      }
    },
    destroy() {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      walkthrough?.destroy();
      walkthrough = null;
      evidence.destroy();
    },
  };
}
