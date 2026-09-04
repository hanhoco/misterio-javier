import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MISSIONS } from '../src/game/missions';
import {
  createProgress,
  missionProgress,
  recordAttempt,
  type GameProgress,
} from '../src/game/gameState';
import {
  createMemoryStorage,
  clearProgress,
  loadLastProfile,
  loadProgress,
  parseProgress,
  progressKey,
  saveLastProfile,
  saveProgress,
  type StorageLike,
} from '../src/game/progressStore';

/** A storage that fails on every operation, like a locked-down school browser. */
function hostileStorage(): StorageLike {
  return {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceededError');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
}

function playedProgress(): GameProgress {
  let progress = createProgress('Ana', '3B');
  progress = recordAttempt(progress, MISSIONS[0].id, { success: false });
  progress = recordAttempt(progress, MISSIONS[0].id, { success: true, precision: 'precise' });
  progress = recordAttempt(progress, MISSIONS[1].id, { success: true, precision: 'close' });
  return { ...progress, soundEnabled: true };
}

describe('progress round trip', () => {
  test('save then load returns the same progress', () => {
    const storage = createMemoryStorage();
    const progress = playedProgress();

    assert.equal(saveProgress(progress, storage), true);
    const loaded = loadProgress('Ana', '3B', storage);

    assert.deepEqual(loaded, progress);
  });

  test('the key ignores case and surrounding spaces on both parts', () => {
    assert.equal(progressKey('Ana', '3B'), progressKey('  ana ', ' 3b '));
    assert.notEqual(progressKey('Ana', '3B'), progressKey('Ana', '3C'));
    assert.notEqual(progressKey('Ana', '3B'), progressKey('Luis', '3B'));
  });

  test('a child resumes after a refresh even if they retype their name differently', () => {
    const storage = createMemoryStorage();
    saveProgress(playedProgress(), storage);

    const loaded = loadProgress('  ANA ', '3b', storage);
    assert.equal(missionProgress(loaded, MISSIONS[0].id).found, true);
    // The typed spelling wins, so the screen greets them the way they just typed it.
    assert.equal(loaded.name, '  ANA ');
  });

  test('two children in the same class do not see each other', () => {
    const storage = createMemoryStorage();
    saveProgress(playedProgress(), storage);

    const other = loadProgress('Luis', '3B', storage);
    assert.equal(other.name, 'Luis');
    assert.deepEqual(other.missions, {});
  });

  test('clearProgress forgets one profile and leaves the rest', () => {
    const storage = createMemoryStorage();
    saveProgress(playedProgress(), storage);
    saveProgress(createProgress('Luis', '3B'), storage);

    clearProgress('Ana', '3B', storage);
    assert.deepEqual(loadProgress('Ana', '3B', storage).missions, {});
    assert.equal(loadProgress('Luis', '3B', storage).name, 'Luis');
  });
});

describe('progress degrades to a fresh profile instead of throwing', () => {
  test('nothing stored yet', () => {
    const loaded = loadProgress('Ana', '3B', createMemoryStorage());
    assert.deepEqual(loaded, createProgress('Ana', '3B'));
  });

  test('the stored value is not JSON at all', () => {
    const storage = createMemoryStorage();
    storage.setItem(progressKey('Ana', '3B'), 'not json {{{');
    assert.deepEqual(loadProgress('Ana', '3B', storage), createProgress('Ana', '3B'));
  });

  test('the stored JSON is the wrong shape', () => {
    const storage = createMemoryStorage();
    for (const junk of ['null', '[]', '42', '"hola"', '{}', '{"version":99}']) {
      storage.setItem(progressKey('Ana', '3B'), junk);
      assert.deepEqual(
        loadProgress('Ana', '3B', storage),
        createProgress('Ana', '3B'),
        `junk: ${junk}`,
      );
    }
  });

  test('a truncated save is discarded rather than half applied', () => {
    const storage = createMemoryStorage();
    const full = JSON.stringify(playedProgress());
    storage.setItem(progressKey('Ana', '3B'), full.slice(0, Math.floor(full.length / 2)));
    assert.deepEqual(loadProgress('Ana', '3B', storage), createProgress('Ana', '3B'));
  });

  test('one unreadable mission entry is dropped, the rest survive', () => {
    const storage = createMemoryStorage();
    const progress = playedProgress();
    const tampered = {
      ...progress,
      missions: {
        ...progress.missions,
        [MISSIONS[2].id]: { found: 'yes', attempts: -3, precision: 'perfecto' },
      },
    };
    storage.setItem(progressKey('Ana', '3B'), JSON.stringify(tampered));

    const loaded = loadProgress('Ana', '3B', storage);
    assert.equal(missionProgress(loaded, MISSIONS[0].id).found, true);
    assert.equal(missionProgress(loaded, MISSIONS[2].id).found, false);
  });

  test('storage that throws on every call never breaks the game', () => {
    const storage = hostileStorage();
    assert.equal(saveProgress(playedProgress(), storage), false);
    assert.deepEqual(loadProgress('Ana', '3B', storage), createProgress('Ana', '3B'));
    assert.doesNotThrow(() => clearProgress('Ana', '3B', storage));
    assert.doesNotThrow(() => saveLastProfile({ name: 'Ana', classCode: '3B' }, storage));
    assert.equal(loadLastProfile(storage), null);
  });
});

describe('parseProgress', () => {
  test('accepts what saveProgress writes', () => {
    const progress = playedProgress();
    assert.deepEqual(parseProgress(JSON.parse(JSON.stringify(progress))), progress);
  });

  test('rejects anything that is not a progress object', () => {
    for (const junk of [null, undefined, 42, 'hola', [], {}, { version: 1 }]) {
      assert.equal(parseProgress(junk), null, `junk: ${JSON.stringify(junk)}`);
    }
  });

  test('repairs a nonsense mission index rather than trusting it', () => {
    const progress = { ...playedProgress(), currentMissionIndex: Number.NaN };
    const parsed = parseProgress(JSON.parse(JSON.stringify(progress)));
    assert.ok(parsed);
    assert.equal(parsed.currentMissionIndex, 0);
  });
});

describe('the last profile used', () => {
  test('round-trips so the profile screen can pre-fill', () => {
    const storage = createMemoryStorage();
    saveLastProfile({ name: 'Ana', classCode: '3B' }, storage);
    assert.deepEqual(loadLastProfile(storage), { name: 'Ana', classCode: '3B' });
  });

  test('is null when absent or corrupt', () => {
    const storage = createMemoryStorage();
    assert.equal(loadLastProfile(storage), null);
    saveLastProfile({ name: 'Ana', classCode: '3B' }, storage);
    storage.setItem('misterio-javier:v1:last-profile', '{{{');
    assert.equal(loadLastProfile(storage), null);
  });
});
