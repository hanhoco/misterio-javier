/**
 * The shell: routing, persistence and the chrome that stays on screen.
 *
 * Code is English; every string the child or the teacher reads is Spanish.
 *
 * Three things live here and nowhere else.
 *
 * Routing. `#/profesor` is the teacher panel and everything else is the game.
 * A hash route rather than a mode flag, so a teacher can bookmark the panel and
 * a child cannot stumble into it by pressing the wrong button.
 *
 * The poster. `assets/park-source.png` is THE poster: it is loaded once, on the
 * first mission that needs it, and the same canvas is handed to all fifteen. The
 * pipeline writes and reads back 5.4 million pixels, so doing it per mission
 * would be a visible stall fifteen times over.
 *
 * Persistence. Screens call `save`, and only this file knows that means
 * `localStorage`. A screen that failed to save still works; it just forgets.
 */

import {
  firstUnfinishedIndex,
  isGameComplete,
  isMissionUnlocked,
  missionProgress,
  progressScore,
  setSoundEnabled,
  storyFoundCount,
  unlockedPuzzlePieces,
  type GameProgress,
} from '../game/gameState';
import { MISSIONS, STORY_MISSIONS, type Mission } from '../game/missions';
import { loadProgress, saveLastProfile, saveProgress } from '../game/progressStore';
import { loadParkBackground, loadPoster, type LoadedPoster } from '../poster/posterSource';
import { mountMarkingTool } from '../tools/markingTool';
import { isDevToolsRequested } from './devMode';
import { button, element } from './dom';
import { createPuzzleBoard, type PuzzleBoard } from './puzzleBoard';
import { createResultCodeCard } from './resultCodeCard';
import type { Screen, ScreenContext } from './screens/context';
import { createDrillScreen } from './screens/drillScreen';
import { createMissionScreen } from './screens/missionScreen';
import { createProfileScreen } from './screens/profileScreen';
import { createPuzzleScreen } from './screens/puzzleScreen';
import { createTeacherScreen } from './screens/teacherScreen';
import { createTrainingScreen } from './screens/trainingScreen';
import { createSoundBoard } from './sound';

const TEACHER_ROUTE = '#/profesor';

type Mode = 'profile' | 'training' | 'playing';

export function mountApp(root: HTMLElement): void {
  root.textContent = '';
  root.className = 'app';

  const sound = createSoundBoard(false);

  let progress: GameProgress | null = null;
  let mode: Mode = 'profile';
  let trainingIsReplay = false;
  let posterPromise: Promise<LoadedPoster> | null = null;
  let currentScreen: Screen | null = null;
  let closeMarkingTool: (() => void) | null = null;
  /** The winning fanfare plays once per run, not on every re-render. */
  let finaleCelebrated = false;

  /* Chrome ---------------------------------------------------------------- */

  /*
   * Order on the page is deliberate and it is the order of importance to a
   * child: a slim brand row, then WHAT TO FIND and the picture, then everything
   * an adult cares about. An earlier arrangement put the title, the name, four
   * utility buttons, a progress bar, a score badge and a fifteen-tile puzzle
   * board above the game, so a seven year old met five rows of dashboard before
   * meeting the poster. The utilities did not get smaller; they got moved.
   */

  const header = element('header', 'app__header');
  const brand = element('div', 'app__brand');
  brand.appendChild(element('p', 'app__title', '🔎 EL MISTERIO DE JAVIER'));
  const whoChip = element('p', 'app__who', '');
  brand.appendChild(whoChip);
  header.appendChild(brand);

  const headerActions = element('div', 'app__actions');
  const codeButton = button('Ver mi código', 'button button--ghost button--small');
  const trainingButton = button('Entrenamiento', 'button button--ghost button--small');
  const soundButton = button('Sonido: apagado', 'button button--ghost button--small');
  const profileButton = button('Cambiar detective', 'button button--ghost button--small');
  headerActions.append(codeButton, trainingButton, soundButton, profileButton);
  header.appendChild(headerActions);
  root.appendChild(header);

  /*
   * The game on the left, the puzzle on the right.
   *
   * The rail is deliberately beside the activity and never above it: the child
   * is searching a picture and taking a screenshot of it, and the puzzle is
   * something they should notice filling in out of the corner of an eye, not
   * something they have to scroll past to reach the game.
   */
  const layout = element('div', 'app__layout');

  const body = element('main', 'app__body');
  layout.appendChild(body);

  const rail = element('aside', 'rail');
  rail.appendChild(element('p', 'rail__title', 'Tu avance'));

  const puzzleStrip = element('div', 'rail__puzzle');
  let puzzleBoard: PuzzleBoard | null = null;
  rail.appendChild(puzzleStrip);

  const progressTrack = element('div', 'progress');
  const progressFill = element('div', 'progress__fill');
  progressTrack.appendChild(progressFill);
  rail.appendChild(progressTrack);

  const progressLabel = element('p', 'rail__count', '');
  const scoreChip = element('p', 'rail__score', '');
  rail.append(progressLabel, scoreChip);

  const codePanel = element('div', 'app__code-panel');
  codePanel.hidden = true;
  rail.appendChild(codePanel);

  layout.appendChild(rail);
  root.appendChild(layout);

  /*
   * The marking tool is for whoever is authoring a poster, not for a class.
   * The same `?dev=1` flag also turns on the poster stage's scale readout; see
   * `devMode.ts`.
   */
  const devTools = element('details', 'dev-tools');
  const devToolsRequested = isDevToolsRequested();
  if (devToolsRequested) {
    devTools.appendChild(element('summary', 'dev-tools__summary', 'Herramientas (dev)'));
    const markingButton = button('Marcar objetos del póster', 'button button--ghost');
    markingButton.addEventListener('click', () => {
      if (closeMarkingTool) {
        closeMarkingTool();
        closeMarkingTool = null;
        markingButton.textContent = 'Marcar objetos del póster';
        return;
      }
      markingButton.disabled = true;
      loadParkBackground()
        .then((background) => {
          closeMarkingTool = mountMarkingTool(root, {
            poster: background,
            onClose: () => {
              closeMarkingTool?.();
              closeMarkingTool = null;
              markingButton.textContent = 'Marcar objetos del póster';
            },
          });
          markingButton.textContent = 'Cerrar marcador';
        })
        .catch((error: unknown) => console.error('Marking tool failed', error))
        .finally(() => {
          markingButton.disabled = false;
        });
    });
    devTools.appendChild(markingButton);
    root.appendChild(devTools);
  }

  /* Helpers --------------------------------------------------------------- */

  function isTeacherRoute(): boolean {
    return window.location.hash === TEACHER_ROUTE;
  }

  function setChromeVisible(visible: boolean): void {
    header.hidden = false;
    headerActions.hidden = !visible;
    rail.hidden = !visible;
    layout.classList.toggle('app__layout--solo', !visible);
    if (!visible) codePanel.hidden = true;
    devTools.hidden = !visible || !devToolsRequested;
  }

  function persist(next: GameProgress): void {
    progress = next;
    saveProgress(next);
  }

  /** The mission the child should be looking at right now. */
  function activeMission(state: GameProgress): Mission {
    const wanted = Math.min(Math.max(0, state.currentMissionIndex), MISSIONS.length - 1);
    const stillOpen =
      isMissionUnlocked(state, wanted) && !missionProgress(state, MISSIONS[wanted].id).found;
    return MISSIONS[stillOpen ? wanted : firstUnfinishedIndex(state)];
  }

  function refreshChrome(): void {
    if (!progress) return;

    whoChip.textContent = `Detective ${progress.name} · curso ${progress.classCode}`;

    const found = storyFoundCount(progress);
    const percent = Math.round((found / STORY_MISSIONS.length) * 100);
    progressFill.style.width = `${percent}%`;
    progressLabel.textContent = `${found} de ${STORY_MISSIONS.length} pistas`;
    // Earned points only. "0 / 5375" is a strange ceiling to hand a nine year
    // old; the maximum is a thing the teacher panel needs, not the child.
    scoreChip.textContent = `${progressScore(progress)} puntos`;

    soundButton.textContent = progress.soundEnabled ? 'Sonido: encendido' : 'Sonido: apagado';
    soundButton.setAttribute('aria-pressed', String(progress.soundEnabled));

    if (!puzzleBoard) {
      puzzleBoard = createPuzzleBoard({ variant: 'compact' });
      puzzleStrip.appendChild(puzzleBoard.root);
      puzzleStrip.appendChild(
        element('p', 'rail__hint', 'Cada pista destapa una pieza.'),
      );
    }
    puzzleBoard.setUnlocked(unlockedPuzzlePieces(progress));
  }

  const context: ScreenContext = {
    getProgress() {
      if (!progress) throw new Error('No profile is active');
      return progress;
    },
    save(next) {
      persist(next);
      refreshChrome();
    },
    refresh() {
      render();
    },
    poster() {
      posterPromise ??= loadPoster('park');
      return posterPromise;
    },
    sound,
    replayTraining() {
      trainingIsReplay = true;
      mode = 'training';
      render();
    },
    changeProfile() {
      progress = null;
      mode = 'profile';
      render();
    },
  };

  /* Rendering ------------------------------------------------------------- */

  function mount(screen: Screen): void {
    currentScreen?.destroy();
    body.textContent = '';
    currentScreen = screen;
    body.appendChild(screen.root);
    // Only now does the screen have a size to measure against.
    screen.mounted?.();
  }

  function showLoading(message: string): void {
    currentScreen?.destroy();
    currentScreen = null;
    body.textContent = '';
    body.appendChild(element('p', 'app__loading', message));
  }

  /**
   * Renders whatever the current route and progress call for.
   *
   * Story missions need the poster, which is asynchronous, so the render is
   * guarded by a token: a child who presses continue twice quickly must not end
   * up with the previous mission mounted after the next one.
   */
  let renderToken = 0;

  function render(): void {
    renderToken += 1;
    const token = renderToken;

    if (isTeacherRoute()) {
      setChromeVisible(false);
      header.hidden = true;
      mount(
        createTeacherScreen({
          onBack: () => {
            window.location.hash = '';
          },
        }),
      );
      return;
    }

    header.hidden = false;

    if (!progress || mode === 'profile') {
      setChromeVisible(false);
      mount(
        createProfileScreen({
          onStart(identity) {
            const loaded = loadProgress(identity.name, identity.classCode);
            saveLastProfile(identity);
            progress = loaded;
            sound.setEnabled(loaded.soundEnabled);
            /*
             * Straight into mission 1. The tutorial used to sit here on a first
             * run; the teacher watched a class meet it and asked for it off the
             * startup path, so "¡Empezar la misión!" now means what it says.
             * It is still one press of "Entrenamiento" away, and that button is
             * still where the Windows + Shift + S explanation lives.
             *
             * Nothing about a profile decides this any more, which is the
             * point: there is no first-run flag left to resurrect it.
             */
            mode = 'playing';
            trainingIsReplay = false;
            // Warm the poster: it is the very next thing on screen.
            void context.poster().catch(() => undefined);
            persist(loaded);
            render();
          },
          onTeacher() {
            window.location.hash = TEACHER_ROUTE;
          },
        }),
      );
      return;
    }

    setChromeVisible(true);
    refreshChrome();

    if (mode === 'training') {
      mount(
        createTrainingScreen({
          sound,
          isReplay: trainingIsReplay,
          /*
           * The tutorial is now only ever reached on purpose, from the
           * "Entrenamiento" button, so the tour that teaches the layout runs
           * every time it is asked for. Nothing is remembered about either one:
           * a flag that could put them back in front of a child on startup is
           * exactly what was removed.
           */
          runWalkthrough: true,
          onDone() {
            trainingIsReplay = false;
            mode = 'playing';
            render();
          },
        }),
      );
      return;
    }

    if (isGameComplete(progress)) {
      if (!finaleCelebrated) {
        finaleCelebrated = true;
        sound.play('win');
      }
      mount(
        createPuzzleScreen({
          progress,
          onReplayTraining: context.replayTraining,
          onChangeProfile: context.changeProfile,
        }),
      );
      return;
    }

    const mission = activeMission(progress);

    if (mission.kind === 'drill') {
      mount(
        createDrillScreen({
          mission,
          context,
          onContinue: () => render(),
        }),
      );
      return;
    }

    showLoading('Preparando el parque…');
    void context
      .poster()
      .then((poster) => {
        if (token !== renderToken) return;
        mount(
          createMissionScreen({
            mission,
            poster,
            context,
            onContinue: () => render(),
          }),
        );
      })
      .catch((error: unknown) => {
        console.error('Poster load failed', error);
        if (token !== renderToken) return;
        // A failed load is permanent for this session, so offer the one thing
        // that actually helps rather than a spinner that never ends.
        posterPromise = null;
        showLoading('No pude preparar el parque. Recarga la página, por favor.');
      });
  }

  /* Chrome behaviour ------------------------------------------------------ */

  codeButton.addEventListener('click', () => {
    if (!progress) return;
    if (!codePanel.hidden) {
      codePanel.hidden = true;
      codeButton.textContent = 'Ver mi código';
      return;
    }
    codePanel.textContent = '';
    codePanel.appendChild(createResultCodeCard(progress));
    codePanel.hidden = false;
    codeButton.textContent = 'Ocultar mi código';
  });

  trainingButton.addEventListener('click', () => context.replayTraining());
  profileButton.addEventListener('click', () => context.changeProfile());

  soundButton.addEventListener('click', () => {
    if (!progress) return;
    const enabled = !progress.soundEnabled;
    sound.setEnabled(enabled);
    persist(setSoundEnabled(progress, enabled));
    refreshChrome();
    if (enabled) sound.play('click');
  });

  window.addEventListener('hashchange', () => render());

  // A teacher may land straight on the panel; otherwise the profile screen is
  // the entry point and no name is assumed.
  progress = null;
  mode = 'profile';
  render();
}
