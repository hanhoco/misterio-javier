/**
 * The mission catalogue: everything the game plays, expressed as data.
 *
 * The fifteen story missions are DERIVED from `PARK_TARGETS`, never typed out
 * again, so a new poster target becomes a new mission with no code change. The
 * shortcut drills sit between them at declared positions, also as data.
 *
 * Code identifiers are English; every string a child reads is Spanish.
 *
 * Nothing here touches the DOM, so the whole catalogue is importable from plain
 * Node for the tests.
 */

import { PARK_TARGETS, type ParkTarget } from '../poster/parkPosterData';
import type { PracticeShape } from '../poster/practicePoster';
import { encodeSealCode } from '../poster/seal';
import type { MissionRewards } from './scoring';

/** Re-exported so a screen picks up the mission type and its picture together. */
export type { PracticeShape };

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

/** What makes a guided step count as done. */
export type StepTrigger =
  /** The child presses the step's own button. */
  | 'button'
  /** The child zooms the poster viewer in at least once. */
  | 'zoom-in'
  /** The page lost focus, which is what the Windows snipping overlay causes. */
  | 'blur'
  /** The page got focus back. */
  | 'focus'
  /** A paste arrived. */
  | 'paste'
  /** A browser-zoom-in key combination was pressed. */
  | 'key-zoom-in'
  /** The browser-zoom-reset key combination was pressed. */
  | 'key-zoom-reset'
  /** A copy key combination was pressed. */
  | 'key-copy'
  /** The child selected the card. */
  | 'select-card';

/** One step of a guided sequence. */
export interface GuidedStep {
  /** Spanish instruction, one short line. */
  text: string;
  /** Keys to draw as a visual hint, e.g. `['Ctrl', 'V']`. */
  keys?: readonly string[];
  trigger: StepTrigger;
  /**
   * Spanish label of the manual "I did it" button.
   *
   * Present on every step that the browser cannot observe (and on the ones it
   * can only observe indirectly), so a child can never get stuck behind a cue
   * that failed to fire.
   */
  buttonLabel?: string;
}

/* -------------------------------------------------------------------------- */
/* Practice seal codes                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Each practice picture carries its own dedicated seal, so the drills go
 * through exactly the same decoder and the same verdict as the real missions.
 *
 * The digits are deliberately uniform (all-magenta, all-cyan, all-lime), a
 * pattern no park target uses - every one of the fifteen mixes its digits - so
 * a practice code can never collide with a story code.
 */
export const TRAINING_SEAL_CODE = encodeSealCode([0, 0, 0, 0, 0]);
export const CROP_DRILL_SEAL_CODE = encodeSealCode([1, 1, 1, 1, 1]);
export const COPY_DRILL_SEAL_CODE = encodeSealCode([2, 2, 2, 2, 2]);

/* -------------------------------------------------------------------------- */
/* Rewards                                                                    */
/* -------------------------------------------------------------------------- */

/** A story mission pays every line of the points table. */
export const STORY_REWARDS: MissionRewards = {
  clueFound: true,
  cropTaken: true,
  pastedCorrectly: true,
  canBePrecise: true,
};

/** A crop or copy drill: no clue is found, but a crop and a paste happen. */
export const PASTE_DRILL_REWARDS: MissionRewards = {
  clueFound: false,
  cropTaken: true,
  pastedCorrectly: true,
  canBePrecise: false,
};

/** The zoom drill: nothing is cropped or pasted, only the completion bonus. */
export const KEY_DRILL_REWARDS: MissionRewards = {
  clueFound: false,
  cropTaken: false,
  pastedCorrectly: false,
  canBePrecise: false,
};

/* -------------------------------------------------------------------------- */
/* Missions                                                                   */
/* -------------------------------------------------------------------------- */

interface MissionBase {
  /** Stable machine identifier. */
  id: string;
  /** Position in the playable order, 0 based. */
  order: number;
  /** Short Spanish heading. */
  title: string;
  /** The one line that says what to do, Spanish. */
  objective: string;
  rewards: MissionRewards;
}

export interface StoryMission extends MissionBase {
  kind: 'story';
  /** Which park target this mission is about. */
  targetId: string;
  sealCode: number;
  /** 1 based number the child sees ("Misión 3 de 15"). */
  storyNumber: number;
  /** Which puzzle piece this mission unlocks. */
  puzzlePieceIndex: number;
  /** A nudge in story voice, Spanish. */
  clue: string;
}

export type DrillKind = 'zoom' | 'crop' | 'copy';

export interface DrillMission extends MissionBase {
  kind: 'drill';
  drill: DrillKind;
  /** The guided steps, revealed one at a time. */
  steps: readonly GuidedStep[];
  /** Present on the drills that end in a paste. */
  sealCode?: number;
  /** Which practice picture to draw, for the drills that show one. */
  shape?: PracticeShape;
  /** Spanish name of that picture, as the objective refers to it. */
  shapeName?: string;
}

export type Mission = StoryMission | DrillMission;

/* -------------------------------------------------------------------------- */
/* Story data                                                                 */
/* -------------------------------------------------------------------------- */

/** The framing the child reads on the profile screen. */
export const STORY_INTRO =
  'Javier perdió varias cosas importantes en el parque. Hay pistas escondidas ' +
  'por todas partes. Tu misión es encontrarlas y enviar la evidencia.';

/**
 * One clue line per park target, keyed by target id.
 *
 * Kept as a lookup rather than a field on the target, because the poster
 * catalogue describes geometry and this describes the story told over it.
 */
const STORY_CLUES: Record<string, string> = {
  kite: 'El viento se llevó algo de Javier muy alto. Levanta la vista al cielo.',
  slide: 'Alguien lo vio bajar una y otra vez por el juego más alto del parque.',
  swings: 'Se escucha algo que va y viene, va y viene. ¿Quién se está balanceando?',
  pond: 'Hay plumas mojadas en la orilla. Los patos vieron algo esa tarde.',
  bridge: 'Para pasar al otro lado hay que caminar sobre unas tablas de madera.',
  oak: 'El árbol más alto del parque da mucha sombra… y guarda una pista.',
  pinkBlanket: 'Quedaron migas de pan sobre una tela de cuadros rosados.',
  blueBlanket: 'Abajo, a la izquierda, otra familia extendió una tela azul.',
  yellowTruck: 'Huele riquísimo cerca de la escuela. Algo amarillo vende comida ahí.',
  whiteTruck: 'Abajo a la derecha hay otro puesto de comida, este es blanco.',
  schoolBus: 'Un vehículo largo pasa por la calle. ¿Javier se habrá subido?',
  school: 'El edificio de ladrillo con reloj lo vio todo desde arriba.',
  carousel: 'Se oye música bajo un techo rojo y redondo. Acércate.',
  goal: 'Alguien pateó el balón con fuerza hacia la red. Busca la portería.',
  garden: 'Entre las verduras sembradas quedaron huellas fresquitas.',
};

function toStoryMission(target: ParkTarget, storyIndex: number): Omit<StoryMission, 'order'> {
  return {
    kind: 'story',
    id: `story-${target.id}`,
    targetId: target.id,
    sealCode: target.sealCode,
    storyNumber: storyIndex + 1,
    puzzlePieceIndex: storyIndex,
    title: `Misión ${storyIndex + 1}`,
    objective: `Encuentra ${target.name}`,
    clue: STORY_CLUES[target.id] ?? 'Busca con calma. La pista está a la vista.',
    rewards: STORY_REWARDS,
  };
}

/* -------------------------------------------------------------------------- */
/* Drill data                                                                 */
/* -------------------------------------------------------------------------- */

interface DrillPlacement {
  /** How many story missions come before this drill. */
  afterStoryCount: number;
  mission: Omit<DrillMission, 'order'>;
}

/**
 * The three shortcut drills and where they sit in the run.
 *
 * They are spaced roughly a quarter apart so a child meets a new shortcut
 * before the missions start needing it, and never meets two in a row.
 */
const DRILL_PLACEMENTS: readonly DrillPlacement[] = [
  {
    afterStoryCount: 3,
    mission: {
      kind: 'drill',
      id: 'drill-zoom',
      title: 'Práctica de teclas: acercar',
      objective: 'Aprende a acercar toda la pantalla con el teclado.',
      drill: 'zoom',
      rewards: KEY_DRILL_REWARDS,
      steps: [
        {
          text: 'Mantén presionada la tecla Ctrl y presiona la tecla +.',
          keys: ['Ctrl', '+'],
          trigger: 'key-zoom-in',
          buttonLabel: 'No me funcionó, continuar',
        },
        {
          text: 'Ahora presiona Ctrl y 0 para volver al tamaño normal.',
          keys: ['Ctrl', '0'],
          trigger: 'key-zoom-reset',
          buttonLabel: 'No me funcionó, continuar',
        },
      ],
    },
  },
  {
    afterStoryCount: 7,
    mission: {
      kind: 'drill',
      id: 'drill-crop',
      title: 'Práctica de teclas: recortar',
      objective: 'Recorta la estrella y pégala en la caja de evidencia.',
      drill: 'crop',
      sealCode: CROP_DRILL_SEAL_CODE,
      shape: 'star',
      shapeName: 'la estrella',
      rewards: PASTE_DRILL_REWARDS,
      steps: [
        {
          text: 'Presiona las tres teclas Windows + Shift + S al mismo tiempo.',
          keys: ['Win', 'Shift', 'S'],
          trigger: 'blur',
          buttonLabel: 'Ya lo hice',
        },
        {
          text: 'Con el mouse, selecciona solamente la estrella.',
          trigger: 'button',
          buttonLabel: 'Ya la seleccioné',
        },
        {
          text: 'Regresa al juego y presiona Ctrl + V en la caja de abajo.',
          keys: ['Ctrl', 'V'],
          trigger: 'paste',
        },
      ],
    },
  },
  {
    afterStoryCount: 11,
    mission: {
      kind: 'drill',
      id: 'drill-copy',
      title: 'Práctica de teclas: copiar y pegar',
      objective: 'Copia la tarjeta del corazón y pégala en la caja de evidencia.',
      drill: 'copy',
      sealCode: COPY_DRILL_SEAL_CODE,
      shape: 'heart',
      shapeName: 'el corazón',
      rewards: PASTE_DRILL_REWARDS,
      steps: [
        {
          text: 'Haz clic sobre la tarjeta para seleccionarla.',
          trigger: 'select-card',
          buttonLabel: 'Seleccionar por mí',
        },
        {
          text: 'Presiona Ctrl + C para copiarla.',
          keys: ['Ctrl', 'C'],
          trigger: 'key-copy',
          buttonLabel: 'Ya la copié',
        },
        {
          text: 'Presiona Ctrl + V en la caja de abajo para pegarla.',
          keys: ['Ctrl', 'V'],
          trigger: 'paste',
        },
      ],
    },
  },
];

/* -------------------------------------------------------------------------- */
/* The training mission                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The tutorial that runs before mission 1.
 *
 * It is not part of `MISSIONS`: it is never graded and never scored, because
 * the point is learning the flow, not proving anything. The screen confirms
 * only that the crop arrived.
 */
export interface TrainingMission {
  id: string;
  title: string;
  objective: string;
  intro: string;
  /**
   * The one sentence the whole tutorial exists for.
   *
   * The conceptual leap in this game is not "which keys": it is that the crop
   * is taken of the child's OWN screen, over the picture they are looking at.
   * A child who misses that points the snipping tool at nothing.
   */
  aimNote: string;
  sealCode: number;
  shape: PracticeShape;
  shapeName: string;
  successMessage: string;
  steps: readonly GuidedStep[];
}

export const TRAINING_MISSION: TrainingMission = {
  id: 'training',
  title: 'Misión de entrenamiento',
  objective: 'Aprende a recortar la pantalla y a pegar tu evidencia.',
  intro:
    'Antes de empezar a buscar, practiquemos juntos. Sigue los pasos uno por uno, ' +
    'sin apuro. Aquí nada está mal.',
  aimNote:
    'Lo importante: el recorte se hace sobre la imagen que ves aquí, en tu propia ' +
    'pantalla. Al presionar Windows + Shift + S la pantalla se pone gris y tú ' +
    'dibujas un rectángulo encima de la pelota, aquí mismo.',
  sealCode: TRAINING_SEAL_CODE,
  shape: 'ball',
  shapeName: 'la pelota',
  successMessage: '¡Muy bien! El juego recibió tu recorte.',
  steps: [
    {
      text: 'Busca la pelota en la imagen de arriba.',
      trigger: 'button',
      buttonLabel: 'Ya la veo',
    },
    {
      text: 'Acércate usando el botón + del zoom, debajo de la imagen.',
      trigger: 'zoom-in',
      buttonLabel: 'Ya me acerqué',
    },
    {
      text: 'Presiona las tres teclas Windows + Shift + S al mismo tiempo. La pantalla se pondrá gris.',
      keys: ['Win', 'Shift', 'S'],
      trigger: 'blur',
      buttonLabel: 'Ya lo hice',
    },
    {
      text: 'Con el mouse, dibuja un rectángulo sobre la pelota. Solo la pelota, sin nada más.',
      trigger: 'button',
      buttonLabel: 'Ya la seleccioné',
    },
    {
      text: 'Suelta el mouse: el recorte ya quedó guardado y vuelves al juego.',
      trigger: 'focus',
      buttonLabel: 'Ya regresé',
    },
    {
      text: 'Presiona Ctrl + V aquí abajo, en la caja de evidencia.',
      keys: ['Ctrl', 'V'],
      trigger: 'paste',
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* The assembled run                                                          */
/* -------------------------------------------------------------------------- */

function buildMissions(): readonly Mission[] {
  const stories = PARK_TARGETS.map(toStoryMission);
  const assembled: Array<Omit<Mission, 'order'>> = [];

  for (let index = 0; index <= stories.length; index += 1) {
    for (const placement of DRILL_PLACEMENTS) {
      if (placement.afterStoryCount === index) assembled.push(placement.mission);
    }
    if (index < stories.length) assembled.push(stories[index]);
  }

  return assembled.map((mission, order) => ({ ...mission, order }) as Mission);
}

/** Every mission, in the order they are unlocked. */
export const MISSIONS: readonly Mission[] = buildMissions();

/** The fifteen story missions, in poster order. */
export const STORY_MISSIONS: readonly StoryMission[] = MISSIONS.filter(
  (mission): mission is StoryMission => mission.kind === 'story',
);

/** The drills, in the order they appear. */
export const DRILL_MISSIONS: readonly DrillMission[] = MISSIONS.filter(
  (mission): mission is DrillMission => mission.kind === 'drill',
);

/** How many puzzle pieces the board has: one per story mission. */
export const PUZZLE_PIECE_COUNT = STORY_MISSIONS.length;

/** Rewards aligned with `MISSIONS`, for `totalScore`. */
export const MISSION_REWARDS: readonly MissionRewards[] = MISSIONS.map(
  (mission) => mission.rewards,
);

export function findMission(id: string): Mission | undefined {
  return MISSIONS.find((mission) => mission.id === id);
}

export function missionIndex(id: string): number {
  return MISSIONS.findIndex((mission) => mission.id === id);
}
