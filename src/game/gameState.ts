/**
 * Progression: what is unlocked, what has been tried, what has been found.
 *
 * Every function here is pure and returns a new object rather than mutating the
 * one it was given. That is not ceremony: the progress object is also the thing
 * written to `localStorage` and encoded into the result code, and a shared
 * mutable object is how those three end up disagreeing with each other.
 *
 * Nothing here touches the DOM.
 */

import {
  MISSIONS,
  STORY_MISSIONS,
  type Mission,
  type StoryMission,
} from './missions';
import {
  scoreMission,
  type MissionOutcome,
  type PrecisionTier,
} from './scoring';

/** Bumped whenever the stored shape changes, so old saves are discarded. */
export const PROGRESS_VERSION = 1;

/** Attempts above this are stored as this: four bits is all the code carries. */
export const MAX_RECORDED_ATTEMPTS = 15;

export interface MissionProgress {
  found: boolean;
  attempts: number;
  precision: PrecisionTier;
}

export interface GameProgress {
  version: number;
  /** The child's first name, as typed. */
  name: string;
  /** The class code the teacher handed out. */
  classCode: string;
  trainingCompleted: boolean;
  /**
   * Whether the blocking walkthrough has been seen through to its end (or
   * deliberately skipped) at least once.
   *
   * Separate from `trainingCompleted` on purpose: the training mission teaches
   * the gesture and the walkthrough teaches where things are, and a child can
   * have finished one without the other. It is also what makes the first run
   * forced and every later run opt-in from the "Entrenamiento" button.
   */
  walkthroughSeen: boolean;
  soundEnabled: boolean;
  /** Index into `MISSIONS` of the mission on screen. */
  currentMissionIndex: number;
  /** Keyed by mission id. Missions never attempted are simply absent. */
  missions: Record<string, MissionProgress>;
}

export const EMPTY_MISSION_PROGRESS: MissionProgress = {
  found: false,
  attempts: 0,
  precision: 'none',
};

export function createProgress(name: string, classCode: string): GameProgress {
  return {
    version: PROGRESS_VERSION,
    name,
    classCode,
    trainingCompleted: false,
    walkthroughSeen: false,
    /** Sound is off until the child turns it on. Classrooms are shared rooms. */
    soundEnabled: false,
    currentMissionIndex: 0,
    missions: {},
  };
}

export function missionProgress(progress: GameProgress, missionId: string): MissionProgress {
  return progress.missions[missionId] ?? EMPTY_MISSION_PROGRESS;
}

/**
 * Missions unlock strictly in order: the first is always open, and every other
 * one waits for the mission immediately before it to be found.
 */
export function isMissionUnlocked(progress: GameProgress, index: number): boolean {
  if (index < 0 || index >= MISSIONS.length) return false;
  if (index === 0) return true;
  return missionProgress(progress, MISSIONS[index - 1].id).found;
}

/** Index of the first mission that has not been found yet. */
export function firstUnfinishedIndex(progress: GameProgress): number {
  const index = MISSIONS.findIndex((mission) => !missionProgress(progress, mission.id).found);
  return index === -1 ? MISSIONS.length - 1 : index;
}

export interface AttemptResult {
  success: boolean;
  /** Only meaningful when `success` is true. */
  precision?: PrecisionTier;
}

/**
 * Records one attempt on a mission.
 *
 * A mission that has already been found is frozen: the call is ignored and the
 * same object comes back. That is what stops a child pasting the same correct
 * crop five times and banking the points five times over, and it is also why
 * the attempt counter cannot drift after the fact.
 */
export function recordAttempt(
  progress: GameProgress,
  missionId: string,
  result: AttemptResult,
): GameProgress {
  const index = MISSIONS.findIndex((mission) => mission.id === missionId);
  if (index === -1) return progress;

  const current = missionProgress(progress, missionId);
  if (current.found) return progress;

  const next: MissionProgress = {
    found: result.success,
    attempts: Math.min(MAX_RECORDED_ATTEMPTS, current.attempts + 1),
    precision: result.success ? (result.precision ?? 'none') : current.precision,
  };

  return {
    ...progress,
    currentMissionIndex: result.success
      ? Math.min(MISSIONS.length - 1, index + 1)
      : progress.currentMissionIndex,
    missions: { ...progress.missions, [missionId]: next },
  };
}

export function markTrainingCompleted(progress: GameProgress): GameProgress {
  return { ...progress, trainingCompleted: true };
}

export function markWalkthroughSeen(progress: GameProgress): GameProgress {
  return { ...progress, walkthroughSeen: true };
}

export function setSoundEnabled(progress: GameProgress, soundEnabled: boolean): GameProgress {
  return { ...progress, soundEnabled };
}

export function goToMission(progress: GameProgress, index: number): GameProgress {
  if (!isMissionUnlocked(progress, index)) return progress;
  return { ...progress, currentMissionIndex: index };
}

/* -------------------------------------------------------------------------- */
/* Derived numbers                                                            */
/* -------------------------------------------------------------------------- */

export function outcomeOf(progress: GameProgress, mission: Mission): MissionOutcome {
  const state = missionProgress(progress, mission.id);
  return { found: state.found, attempts: state.attempts, precision: state.precision };
}

export function completedCount(progress: GameProgress): number {
  return MISSIONS.filter((mission) => missionProgress(progress, mission.id).found).length;
}

/** How many of the fifteen story clues have been found. */
export function storyFoundCount(progress: GameProgress): number {
  return STORY_MISSIONS.filter((mission) => missionProgress(progress, mission.id).found).length;
}

/** Story missions found, as puzzle piece indices. */
export function unlockedPuzzlePieces(progress: GameProgress): number[] {
  return STORY_MISSIONS.filter((mission) => missionProgress(progress, mission.id).found).map(
    (mission) => mission.puzzlePieceIndex,
  );
}

export function progressPercent(progress: GameProgress): number {
  if (MISSIONS.length === 0) return 0;
  return Math.round((completedCount(progress) / MISSIONS.length) * 100);
}

export function isGameComplete(progress: GameProgress): boolean {
  return completedCount(progress) === MISSIONS.length;
}

export function totalAttempts(progress: GameProgress): number {
  return MISSIONS.reduce(
    (sum, mission) => sum + missionProgress(progress, mission.id).attempts,
    0,
  );
}

export function progressScore(progress: GameProgress): number {
  return MISSIONS.reduce(
    (sum, mission) => sum + scoreMission(mission.rewards, outcomeOf(progress, mission)),
    0,
  );
}

/** Story missions that took three or more attempts, or were never found. */
export function troubleMissions(progress: GameProgress): StoryMission[] {
  return STORY_MISSIONS.filter((mission) => {
    const state = missionProgress(progress, mission.id);
    return !state.found || state.attempts >= 3;
  });
}
