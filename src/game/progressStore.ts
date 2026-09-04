/**
 * Persistence, so a refresh does not cost a child their afternoon.
 *
 * Two rules run through this file.
 *
 * It never throws. School machines run browsers with site data disabled, and
 * private windows make `localStorage` itself throw on access rather than merely
 * return null. Every read and every write is wrapped, and when storage is
 * unusable the game falls back to an in-memory map and simply forgets on
 * refresh - which is a worse experience but still a working one.
 *
 * It never trusts what it reads back. Stored JSON is validated field by field,
 * and anything unrecognised - a truncated write, an older layout, somebody
 * poking at devtools - degrades to a fresh profile instead of a half-populated
 * one that would crash three screens later.
 *
 * The key is the name and class code pair, and nothing else about a child is
 * ever written down.
 */

import {
  PROGRESS_VERSION,
  createProgress,
  type GameProgress,
  type MissionProgress,
} from './gameState';
import { PRECISION_TIERS, type PrecisionTier } from './scoring';

export const STORAGE_PREFIX = 'misterio-javier:v1:';

/** The slice of the Storage API this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory stand-in for when the real thing is unavailable or hostile. */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const fallbackStorage = createMemoryStorage();

/**
 * The browser's `localStorage`, or an in-memory map when touching it throws.
 *
 * The probe write is deliberate: some browsers expose the object and only fail
 * on the first `setItem`, so merely checking for existence proves nothing.
 */
export function defaultStorage(): StorageLike {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return fallbackStorage;
    const probe = `${STORAGE_PREFIX}probe`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return fallbackStorage;
  }
}

/** Normalised so "Ana " and "ana" resume the same run. */
function normalizeKeyPart(value: string): string {
  return value.trim().toLocaleLowerCase('es-CO');
}

export function progressKey(name: string, classCode: string): string {
  return `${STORAGE_PREFIX}${normalizeKeyPart(classCode)}|${normalizeKeyPart(name)}`;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMissionProgress(value: unknown): MissionProgress | null {
  if (!isPlainObject(value)) return null;
  const { found, attempts, precision } = value;
  if (typeof found !== 'boolean') return null;
  if (typeof attempts !== 'number' || !Number.isFinite(attempts) || attempts < 0) return null;
  if (typeof precision !== 'string') return null;
  if (!(PRECISION_TIERS as readonly string[]).includes(precision)) return null;
  return { found, attempts: Math.trunc(attempts), precision: precision as PrecisionTier };
}

/**
 * Turns unknown JSON into a `GameProgress`, or null when it is not one.
 *
 * Exported because it is the whole of the "corrupt data degrades gracefully"
 * behaviour, and testing it through `localStorage` would test the browser.
 */
export function parseProgress(raw: unknown): GameProgress | null {
  if (!isPlainObject(raw)) return null;
  if (raw.version !== PROGRESS_VERSION) return null;
  if (typeof raw.name !== 'string' || typeof raw.classCode !== 'string') return null;
  if (!isPlainObject(raw.missions)) return null;

  const missions: Record<string, MissionProgress> = {};
  for (const [id, value] of Object.entries(raw.missions)) {
    const mission = readMissionProgress(value);
    // One unreadable mission does not condemn the profile: the child keeps the
    // rest of their afternoon and simply replays that mission.
    if (mission) missions[id] = mission;
  }

  const currentMissionIndex =
    typeof raw.currentMissionIndex === 'number' && Number.isFinite(raw.currentMissionIndex)
      ? Math.max(0, Math.trunc(raw.currentMissionIndex))
      : 0;

  return {
    version: PROGRESS_VERSION,
    name: raw.name,
    classCode: raw.classCode,
    /*
     * `trainingCompleted` and `walkthroughSeen` used to be read here. They are
     * gone from `GameProgress` because the tutorial no longer sits on the
     * startup path, and they are deliberately NOT read back: a profile saved by
     * the older build still carries them, and the correct thing to do with a
     * field the game no longer has an opinion about is to drop it on the floor
     * rather than fail the profile that holds it. Every other field of such a
     * save - the missions, the score, the name - loads exactly as before.
     */
    soundEnabled: raw.soundEnabled === true,
    currentMissionIndex,
    missions,
  };
}

/* -------------------------------------------------------------------------- */
/* Read and write                                                             */
/* -------------------------------------------------------------------------- */

/** Saves. Returns false when storage refused, so the UI can say so. */
export function saveProgress(
  progress: GameProgress,
  storage: StorageLike = defaultStorage(),
): boolean {
  try {
    storage.setItem(
      progressKey(progress.name, progress.classCode),
      JSON.stringify(progress),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the run for this name and class code, or a fresh one.
 *
 * Always returns a usable profile. Absent, unparseable and structurally wrong
 * data all take the same path, because from the child's seat they are the same
 * thing: nothing to resume.
 */
export function loadProgress(
  name: string,
  classCode: string,
  storage: StorageLike = defaultStorage(),
): GameProgress {
  const fresh = createProgress(name, classCode);
  let stored: string | null = null;
  try {
    stored = storage.getItem(progressKey(name, classCode));
  } catch {
    return fresh;
  }
  if (stored === null) return fresh;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return fresh;
  }

  const progress = parseProgress(parsed);
  if (!progress) return fresh;

  // The typed name wins over the stored one: the child may have fixed a typo,
  // and the key already ignores case and surrounding spaces.
  return { ...progress, name, classCode };
}

export function clearProgress(
  name: string,
  classCode: string,
  storage: StorageLike = defaultStorage(),
): void {
  try {
    storage.removeItem(progressKey(name, classCode));
  } catch {
    /* Nothing to do: forgetting is exactly what was asked for. */
  }
}

/* -------------------------------------------------------------------------- */
/* The last profile used                                                      */
/* -------------------------------------------------------------------------- */

const LAST_PROFILE_KEY = `${STORAGE_PREFIX}last-profile`;

export interface ProfileIdentity {
  name: string;
  classCode: string;
}

/** Remembers who was playing, so the profile screen can pre-fill. */
export function saveLastProfile(
  identity: ProfileIdentity,
  storage: StorageLike = defaultStorage(),
): void {
  try {
    storage.setItem(LAST_PROFILE_KEY, JSON.stringify(identity));
  } catch {
    /* A pre-filled field is a convenience, never a requirement. */
  }
}

export function loadLastProfile(
  storage: StorageLike = defaultStorage(),
): ProfileIdentity | null {
  try {
    const raw = storage.getItem(LAST_PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if (typeof parsed.name !== 'string' || typeof parsed.classCode !== 'string') return null;
    return { name: parsed.name, classCode: parsed.classCode };
  } catch {
    return null;
  }
}
