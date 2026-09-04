import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MISSIONS } from '../src/game/missions';
import {
  createProgress,
  recordAttempt,
  setGuidedMode,
  type GameProgress,
} from '../src/game/gameState';
import {
  createMemoryStorage,
  loadProgress,
  parseProgress,
  progressKey,
  saveProgress,
} from '../src/game/progressStore';

/** A profile with an afternoon's play in it, so nothing is tested on an empty one. */
function playedProgress(): GameProgress {
  let progress = createProgress('Ana', '3B');
  progress = recordAttempt(progress, MISSIONS[0].id, { success: true, precision: 'precise' });
  return progress;
}

describe('guided mode', () => {
  it('is on for a brand new detective', () => {
    // Thirty children finishing fifteen missions is today's goal; the challenge
    // is what the teacher turns on afterwards, not what a child meets first.
    assert.equal(createProgress('Ana', '3B').guidedMode, true);
  });

  it('round-trips through storage in both directions', () => {
    const storage = createMemoryStorage();

    const detective = setGuidedMode(playedProgress(), false);
    assert.equal(saveProgress(detective, storage), true);
    assert.equal(loadProgress('Ana', '3B', storage).guidedMode, false);

    const guided = setGuidedMode(detective, true);
    assert.equal(saveProgress(guided, storage), true);
    assert.equal(loadProgress('Ana', '3B', storage).guidedMode, true);
  });

  it('survives a refresh, so a lesson is not re-configured every reload', () => {
    const storage = createMemoryStorage();
    saveProgress(setGuidedMode(playedProgress(), false), storage);
    const resumed = loadProgress('  ANA ', '3b', storage);
    assert.equal(resumed.guidedMode, false);
    assert.equal(resumed.missions[MISSIONS[0].id]?.found, true);
  });

  it('degrades to guided ON for anything that is not an explicit false', () => {
    /*
     * The polarity that matters. `soundEnabled` defaults off because a corrupt
     * value must not turn thirty speakers on; `guidedMode` defaults on because
     * a corrupt value must not silently take the crop guide away from a class
     * that is relying on it. A profile from the build before this feature has
     * no such field at all, and that is the commonest case of all.
     */
    const base = playedProgress() as unknown as Record<string, unknown>;
    for (const corrupt of [undefined, null, 0, 1, '', 'false', 'no', 'sí', {}, [], Number.NaN]) {
      const parsed = parseProgress({ ...base, guidedMode: corrupt });
      assert.ok(parsed, `guidedMode = ${JSON.stringify(corrupt)} killed the whole profile`);
      assert.equal(
        parsed.guidedMode,
        true,
        `guidedMode = ${JSON.stringify(corrupt)} should degrade to guided ON`,
      );
    }

    // A profile saved before the flag existed at all.
    const older = { ...base };
    delete older.guidedMode;
    assert.equal(parseProgress(older)?.guidedMode, true);
  });

  it('only ever reads a literal false as detective mode', () => {
    assert.equal(parseProgress({ ...playedProgress(), guidedMode: false })?.guidedMode, false);
  });

  it('keeps working when the stored JSON is rubbish', () => {
    const storage = createMemoryStorage();
    storage.setItem(progressKey('Ana', '3B'), 'not json {{{');
    assert.equal(loadProgress('Ana', '3B', storage).guidedMode, true);
  });
});
