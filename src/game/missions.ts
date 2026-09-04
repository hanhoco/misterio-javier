/**
 * The mission catalogue: everything the game plays, expressed as data.
 *
 * The fifteen story missions are DERIVED from `PARK_TARGETS`, never typed out
 * again, so a new poster target becomes a new mission with no code change. The
 * shortcut drills sit between them at declared positions, also as data.
 *
 * Code identifiers and every string a child reads are both English.
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
  /** The instruction, one short line. */
  text: string;
  /** Keys to draw as a visual hint, e.g. `['Ctrl', 'V']`. */
  keys?: readonly string[];
  trigger: StepTrigger;
  /**
   * Label of the manual "I did it" button.
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
  /** Short heading. */
  title: string;
  /** The one line that says what to do. */
  objective: string;
  rewards: MissionRewards;
}

export interface StoryMission extends MissionBase {
  kind: 'story';
  /** Which park target this mission is about. */
  targetId: string;
  sealCode: number;
  /** 1 based number the child sees ("Mission 3 of 15"). */
  storyNumber: number;
  /** Which puzzle piece this mission unlocks. */
  puzzlePieceIndex: number;
  /** A nudge in story voice. */
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
  /** Name of that picture, as the objective refers to it. */
  shapeName?: string;
}

export type Mission = StoryMission | DrillMission;

/* -------------------------------------------------------------------------- */
/* Story data                                                                 */
/* -------------------------------------------------------------------------- */

/** The framing the child reads on the profile screen. */
export const STORY_INTRO =
  'Javier lost some important things in the park. There are clues hidden all ' +
  'over the place. Your mission is to find them and send the evidence.';

/**
 * One clue line per park target, keyed by target id.
 *
 * Kept as a lookup rather than a field on the target, because the poster
 * catalogue describes geometry and this describes the story told over it.
 */
const STORY_CLUES: Record<string, string> = {
  kite: 'The wind carried something of Javier’s way up high. Look at the sky.',
  slide: 'Someone saw him go down the tallest thing in the playground again and again.',
  swings: 'You can hear something going back and forth, back and forth. Who is swinging?',
  pond: 'There are wet feathers on the bank. The ducks saw something that afternoon.',
  bridge: 'To get to the other side you have to walk over some wooden planks.',
  oak: 'The tallest tree in the park makes lots of shade… and it is hiding a clue.',
  pinkBlanket: 'Someone left bread crumbs on a pink checked cloth.',
  blueBlanket: 'Down on the left, another family spread out a blue cloth.',
  yellowTruck: 'Something smells delicious near the school. A yellow one sells food there.',
  whiteTruck: 'Down on the right there is another food stand, and this one is white.',
  schoolBus: 'A long vehicle is going down the road. Did Javier get on it?',
  school: 'The brick building with the clock saw everything from up high.',
  carousel: 'You can hear music under a round red roof. Go closer.',
  goal: 'Someone kicked the ball hard at the net. Look for the goal.',
  garden: 'There are fresh footprints between the planted vegetables.',
};

function toStoryMission(target: ParkTarget, storyIndex: number): Omit<StoryMission, 'order'> {
  return {
    kind: 'story',
    id: `story-${target.id}`,
    targetId: target.id,
    sealCode: target.sealCode,
    storyNumber: storyIndex + 1,
    puzzlePieceIndex: storyIndex,
    title: `Mission ${storyIndex + 1}`,
    objective: `Find ${target.name}`,
    clue: STORY_CLUES[target.id] ?? 'Take your time. The clue is in plain sight.',
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
      title: 'Key practice: zoom in',
      objective: 'Learn how to make the whole screen bigger with the keyboard.',
      drill: 'zoom',
      rewards: KEY_DRILL_REWARDS,
      steps: [
        {
          text: 'Hold down the Ctrl key and press the + key.',
          keys: ['Ctrl', '+'],
          trigger: 'key-zoom-in',
          buttonLabel: 'It did not work, keep going',
        },
        {
          text: 'Now press Ctrl and 0 to go back to the normal size.',
          keys: ['Ctrl', '0'],
          trigger: 'key-zoom-reset',
          buttonLabel: 'It did not work, keep going',
        },
      ],
    },
  },
  {
    afterStoryCount: 7,
    mission: {
      kind: 'drill',
      id: 'drill-crop',
      title: 'Key practice: crop',
      objective: 'Crop the star and paste it into the evidence box.',
      drill: 'crop',
      sealCode: CROP_DRILL_SEAL_CODE,
      shape: 'star',
      shapeName: 'the star',
      rewards: PASTE_DRILL_REWARDS,
      steps: [
        {
          text: 'Press the three keys Windows + Shift + S at the same time.',
          keys: ['Win', 'Shift', 'S'],
          trigger: 'blur',
          buttonLabel: 'I did it',
        },
        {
          text: 'With the mouse, select only the star.',
          trigger: 'button',
          buttonLabel: 'I selected it',
        },
        {
          text: 'Come back to the game and press Ctrl + V in the box below.',
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
      title: 'Key practice: copy and paste',
      objective: 'Copy the heart card and paste it into the evidence box.',
      drill: 'copy',
      sealCode: COPY_DRILL_SEAL_CODE,
      shape: 'heart',
      shapeName: 'the heart',
      rewards: PASTE_DRILL_REWARDS,
      steps: [
        {
          text: 'Click on the card to select it.',
          trigger: 'select-card',
          buttonLabel: 'Select it for me',
        },
        {
          text: 'Press Ctrl + C to copy it.',
          keys: ['Ctrl', 'C'],
          trigger: 'key-copy',
          buttonLabel: 'I copied it',
        },
        {
          text: 'Press Ctrl + V in the box below to paste it.',
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
  title: 'Training mission',
  objective: 'Learn how to crop the screen and paste your evidence.',
  intro:
    'Before we start searching, let us practise together. Follow the steps one ' +
    'by one, take your time. Nothing can go wrong here.',
  aimNote:
    'The important bit: the crop is taken of the picture you see here, on your own ' +
    'screen. When you press Windows + Shift + S the screen turns grey and you draw ' +
    'a rectangle on top of the ball, right here.',
  sealCode: TRAINING_SEAL_CODE,
  shape: 'ball',
  shapeName: 'the ball',
  successMessage: 'Well done! The game got your crop.',
  steps: [
    {
      text: 'Look for the ball in the picture above.',
      trigger: 'button',
      buttonLabel: 'I can see it',
    },
    {
      text: 'Zoom in with the + button under the picture.',
      trigger: 'zoom-in',
      buttonLabel: 'I zoomed in',
    },
    {
      text: 'Press the three keys Windows + Shift + S at the same time. The screen will turn grey.',
      keys: ['Win', 'Shift', 'S'],
      trigger: 'blur',
      buttonLabel: 'I did it',
    },
    {
      text: 'With the mouse, draw a rectangle around the ball. Only the ball, nothing else.',
      trigger: 'button',
      buttonLabel: 'I selected it',
    },
    {
      text: 'Let go of the mouse: your crop is saved and you come back to the game.',
      trigger: 'focus',
      buttonLabel: 'I am back',
    },
    {
      text: 'Press Ctrl + V down here, in the evidence box.',
      keys: ['Ctrl', 'V'],
      trigger: 'paste',
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* The assembled run                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Story order: biggest object first, smallest last.
 *
 * `PARK_TARGETS` is in poster order, which put the kite - 27 x 34 pixels in the
 * source illustration, the smallest of the fifteen and nine times narrower than
 * the school building - at mission one. Two children spent four and three tries
 * on it before either had learned the gesture, on the hardest target in the
 * game. That is backwards: the first mission teaches zoom, snip and paste, and
 * it should be the easiest possible object to hit.
 *
 * Sorted by area rather than hand-listed so a new target lands in the right
 * place by itself.
 */
function byDescendingArea(a: ParkTarget, b: ParkTarget): number {
  return b.width * b.height - a.width * a.height;
}

function buildMissions(): readonly Mission[] {
  const stories = [...PARK_TARGETS].sort(byDescendingArea).map(toStoryMission);
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
