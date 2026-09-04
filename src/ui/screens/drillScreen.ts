/**
 * Stage 9: the short shortcut drills that sit between story missions.
 *
 * Three of them, all driven by the same guided-step list and all built from the
 * drill's own data.
 *
 * The zoom drill is about the BROWSER's zoom, `Ctrl` + `+`, which is a different
 * thing from the poster viewer's own zoom buttons - so it says so, out loud, and
 * it is the one drill with no poster on screen to blur the distinction. It is
 * detected with a keydown handler and never `preventDefault`ed: the whole point
 * is that the page really does get bigger, so the child sees what the shortcut
 * does. Step two brings it back with `Ctrl` + `0`.
 *
 * The crop and copy drills both end in a paste that goes through the ordinary
 * decoder against the practice picture's own dedicated seal. No special case,
 * no "drills always pass".
 */

import { recordAttempt } from '../../game/gameState';
import type { DrillMission } from '../../game/missions';
import {
  renderPracticeCard,
  renderPracticePoster,
  type PracticePoster,
} from '../../poster/practicePoster';
import { decodeSealWithDiagnostics } from '../../validation/sealDecoder';
import { buildVerdict } from '../../validation/verdict';
import { button, element, keyHint } from '../dom';
import { createEvidenceBox } from '../evidenceBox';
import { createPosterStage } from '../posterStage';
import { createStepList } from '../stepList';
import type { Screen, ScreenContext } from './context';

export interface DrillScreenOptions {
  mission: DrillMission;
  context: ScreenContext;
  onContinue: () => void;
}

/** True for the key event that zooms the browser in. */
function isZoomInCombo(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  return (
    event.key === '+' ||
    event.key === '=' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd'
  );
}

/** True for the key event that puts the browser back to 100%. */
function isZoomResetCombo(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false;
  return event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0';
}

function isCopyCombo(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && (event.key === 'c' || event.key === 'C');
}

export function createDrillScreen(options: DrillScreenOptions): Screen {
  const { mission, context } = options;
  const root = element('section', 'screen screen--drill');

  const header = element('div', 'screen__header');
  const heading = element('div', 'screen__heading');
  heading.appendChild(element('p', 'screen__eyebrow', 'Práctica rápida'));
  heading.appendChild(element('h2', 'screen__title', mission.title));
  heading.appendChild(element('p', 'screen__subtitle', mission.objective));
  header.appendChild(heading);
  root.appendChild(header);

  const body = element('div', 'drill__body');
  // The zoom drill has no evidence box, so its steps get the whole width
  // rather than sitting in a half-width column beside nothing.
  const sideColumn = element(
    'div',
    `drill__side${mission.drill === 'zoom' ? ' drill__side--single' : ''}`,
  );

  const continueButton = button('Seguir con la misión ➜', 'button button--primary button--big');
  continueButton.hidden = true;
  continueButton.addEventListener('click', () => options.onContinue());

  const cleanups: Array<() => void> = [];
  /** Viewers that must be fitted once the screen is in the document. */
  const fitters: Array<() => void> = [];

  /** Banks the drill and shows the continue button. Runs at most once. */
  let completed = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    context.save(
      recordAttempt(context.getProgress(), mission.id, { success: true, precision: 'none' }),
    );
    context.sound.play('unlock');
    continueButton.hidden = false;
    continueButton.focus();
  };

  /** Counts a miss, so the teacher panel can see the drill took a few goes. */
  const countMiss = () => {
    context.save(recordAttempt(context.getProgress(), mission.id, { success: false }));
  };

  const steps = createStepList({
    steps: mission.steps,
    onStepDone: () => context.sound.play('click'),
    onFinished: complete,
  });
  sideColumn.appendChild(steps.root);

  if (mission.drill === 'zoom') {
    body.appendChild(buildZoomPanel());

    const onKeyDown = (event: KeyboardEvent) => {
      if (completed) return;
      if (isZoomInCombo(event)) steps.fire('key-zoom-in');
      else if (isZoomResetCombo(event)) steps.fire('key-zoom-reset');
    };
    // Never prevented: the browser really should zoom, that is the lesson.
    window.addEventListener('keydown', onKeyDown);
    cleanups.push(() => window.removeEventListener('keydown', onKeyDown));
  }

  if (mission.drill === 'crop') {
    const practice = renderPracticePoster({
      shape: mission.shape ?? 'star',
      sealCode: mission.sealCode ?? 0,
      name: mission.shapeName ?? 'la figura',
      id: mission.id,
    });
    body.appendChild(buildPosterPanel(practice));

    const evidence = buildEvidence(practice, 'crop');
    sideColumn.appendChild(evidence);

    const onBlur = () => {
      if (!completed) steps.fire('blur');
    };
    window.addEventListener('blur', onBlur);
    cleanups.push(() => window.removeEventListener('blur', onBlur));
  }

  if (mission.drill === 'copy') {
    const practice = renderPracticeCard({
      shape: mission.shape ?? 'heart',
      sealCode: mission.sealCode ?? 0,
      name: mission.shapeName ?? 'la figura',
      id: mission.id,
    });

    const cardPanel = element('div', 'drill__card-panel');
    cardPanel.appendChild(
      element('p', 'drill__card-title', 'Esta es la tarjeta que vas a copiar:'),
    );

    const card = element('figure', 'copy-card');
    const image = element('img', 'copy-card__image');
    image.src = practice.canvas.toDataURL('image/png');
    image.alt = mission.shapeName ?? 'Tarjeta para copiar';
    image.draggable = false;
    card.appendChild(image);
    cardPanel.appendChild(card);

    const selectCard = () => {
      const selection = window.getSelection();
      if (!selection) return;
      const range = document.createRange();
      range.selectNode(image);
      selection.removeAllRanges();
      selection.addRange(range);
      card.classList.add('is-selected');
      steps.fire('select-card');
    };

    card.addEventListener('click', selectCard);
    cardPanel.appendChild(
      element(
        'p',
        'drill__card-hint',
        'Truco: si el clic no la selecciona, haz clic derecho sobre la tarjeta y ' +
          'elige "Copiar imagen".',
      ),
    );
    body.appendChild(cardPanel);

    const onKeyDown = (event: KeyboardEvent) => {
      if (completed) return;
      if (isCopyCombo(event)) steps.fire('key-copy');
    };
    window.addEventListener('keydown', onKeyDown);
    cleanups.push(() => window.removeEventListener('keydown', onKeyDown));

    sideColumn.appendChild(buildEvidence(practice, 'copy'));
  }

  sideColumn.appendChild(continueButton);
  body.appendChild(sideColumn);
  root.appendChild(body);

  return {
    root,
    mounted() {
      for (const fit of fitters) fit();
    },
    destroy() {
      for (const cleanup of cleanups) cleanup();
    },
  };

  /* ---------------------------------------------------------------------- */

  function buildZoomPanel(): HTMLElement {
    const panel = element('div', 'drill__demo');
    panel.appendChild(element('h3', 'drill__demo-title', 'El zoom del navegador'));
    panel.appendChild(
      element(
        'p',
        'drill__demo-text',
        'Estos botones + y − que ves en las misiones acercan solamente el póster. ' +
          'Ahora vas a practicar otra cosa: el zoom que agranda TODA la pantalla ' +
          'del navegador. Sirve para ver mejor cualquier página.',
      ),
    );

    const keys = element('div', 'drill__keys');
    const zoomRow = element('div', 'drill__key-row');
    zoomRow.appendChild(element('span', 'drill__key-label', 'Agrandar todo'));
    zoomRow.appendChild(keyHint(['Ctrl', '+']));
    const resetRow = element('div', 'drill__key-row');
    resetRow.appendChild(element('span', 'drill__key-label', 'Volver al tamaño normal'));
    resetRow.appendChild(keyHint(['Ctrl', '0']));
    keys.append(zoomRow, resetRow);
    panel.appendChild(keys);

    panel.appendChild(
      element(
        'p',
        'drill__demo-text',
        'Mira cómo cambian las letras de esta página cuando lo presionas. ' +
          'No te preocupes: con Ctrl y 0 todo vuelve a su lugar.',
      ),
    );
    return panel;
  }

  function buildPosterPanel(practice: PracticePoster): HTMLElement {
    const panel = element('div', 'drill__poster');
    const stage = createPosterStage({
      poster: practice.canvas,
      stageClass: 'poster-viewer__stage--practice',
    });
    fitters.push(() => stage.fit());
    panel.appendChild(stage.root);
    return panel;
  }

  function buildEvidence(practice: PracticePoster, kind: 'crop' | 'copy'): HTMLElement {
    const evidence = createEvidenceBox({
      compact: true,
      hint:
        kind === 'crop'
          ? 'Recorta con Windows + Shift + S y pega aquí con Ctrl + V.'
          : 'Después de copiar la tarjeta, presiona Ctrl + V aquí.',
      onImage(pasted) {
        if (completed) return;
        evidence.showPreview(pasted);

        const report = decodeSealWithDiagnostics(pasted.image);
        const verdict = buildVerdict(
          practice.target,
          report.result,
          pasted.width,
          pasted.height,
          (code) => (code === practice.target.sealCode ? practice.target : undefined),
        );

        if (verdict.success) {
          evidence.say('¡Perfecto! Eso era exactamente. 🎉', 'success');
          evidence.setEnabled(false);
          steps.fire('paste');
          // The paste may not have been the step the list was waiting on, for
          // instance when a child pastes before ticking off the copy step. The
          // drill is done either way.
          complete();
          return;
        }

        countMiss();
        context.sound.play('gentle');
        evidence.say(
          kind === 'copy'
            ? '¡Casi! Lo que pegaste no era la tarjeta completa. Selecciónala otra ' +
              'vez y vuelve a copiarla con Ctrl + C.'
            : '¡Casi! Ese recorte no tenía la figura completa. Inténtalo otra vez.',
          'warning',
        );
      },
      onNonImage() {
        if (completed) return;
        evidence.say(
          kind === 'copy'
            ? 'Tu navegador no puso la imagen en el portapapeles. Prueba así: haz ' +
              'clic derecho sobre la tarjeta y elige "Copiar imagen", y luego pega ' +
              'aquí con Ctrl + V.'
            : 'Todavía no hay una imagen en el portapapeles. Recorta con Windows + ' +
              'Shift + S y vuelve a pegar.',
          'warning',
        );
      },
    });

    cleanups.push(() => evidence.destroy());
    return evidence.root;
  }
}
