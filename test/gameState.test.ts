import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { MISSIONS, STORY_MISSIONS } from '../src/game/missions';
import {
  MAX_RECORDED_ATTEMPTS,
  completedCount,
  createProgress,
  firstUnfinishedIndex,
  goToMission,
  isGameComplete,
  isMissionUnlocked,
  missionProgress,
  progressPercent,
  progressScore,
  recordAttempt,
  storyFoundCount,
  totalAttempts,
  troubleMissions,
  unlockedPuzzlePieces,
  type GameProgress,
} from '../src/game/gameState';

function fresh(): GameProgress {
  return createProgress('Ana', '3B');
}

/** Completes missions 0..count-1 on the first try, precisely. */
function completeFirst(count: number): GameProgress {
  let progress = fresh();
  for (let index = 0; index < count; index += 1) {
    progress = recordAttempt(progress, MISSIONS[index].id, {
      success: true,
      precision: 'precise',
    });
  }
  return progress;
}

describe('unlocking', () => {
  test('only the first mission is open on a new profile', () => {
    const progress = fresh();
    assert.equal(isMissionUnlocked(progress, 0), true);
    for (let index = 1; index < MISSIONS.length; index += 1) {
      assert.equal(isMissionUnlocked(progress, index), false, `index ${index} was open`);
    }
  });

  test('missions unlock strictly in order, one at a time', () => {
    for (let done = 1; done <= MISSIONS.length; done += 1) {
      const progress = completeFirst(done);
      for (let index = 0; index < MISSIONS.length; index += 1) {
        assert.equal(
          isMissionUnlocked(progress, index),
          index <= done,
          `after ${done} completed, index ${index}`,
        );
      }
    }
  });

  test('a failed attempt unlocks nothing', () => {
    const progress = recordAttempt(fresh(), MISSIONS[0].id, { success: false });
    assert.equal(isMissionUnlocked(progress, 1), false);
    assert.equal(progress.currentMissionIndex, 0);
  });

  test('out of range indices are never unlocked', () => {
    const progress = completeFirst(MISSIONS.length);
    assert.equal(isMissionUnlocked(progress, -1), false);
    assert.equal(isMissionUnlocked(progress, MISSIONS.length), false);
  });

  test('goToMission refuses a locked mission and accepts an open one', () => {
    const progress = completeFirst(2);
    assert.equal(goToMission(progress, 1).currentMissionIndex, 1);
    assert.equal(goToMission(progress, MISSIONS.length - 1).currentMissionIndex, 2);
  });

  test('firstUnfinishedIndex points at the mission to resume', () => {
    assert.equal(firstUnfinishedIndex(fresh()), 0);
    assert.equal(firstUnfinishedIndex(completeFirst(4)), 4);
  });
});

describe('attempts', () => {
  test('each failed attempt increments the counter', () => {
    let progress = fresh();
    const id = MISSIONS[0].id;
    for (let expected = 1; expected <= 4; expected += 1) {
      progress = recordAttempt(progress, id, { success: false });
      assert.equal(missionProgress(progress, id).attempts, expected);
    }
    assert.equal(missionProgress(progress, id).found, false);
    assert.equal(totalAttempts(progress), 4);
  });

  test('the successful attempt counts too', () => {
    let progress = recordAttempt(fresh(), MISSIONS[0].id, { success: false });
    progress = recordAttempt(progress, MISSIONS[0].id, { success: true, precision: 'close' });
    assert.equal(missionProgress(progress, MISSIONS[0].id).attempts, 2);
    assert.equal(missionProgress(progress, MISSIONS[0].id).found, true);
    assert.equal(missionProgress(progress, MISSIONS[0].id).precision, 'close');
  });

  test('attempts saturate rather than overflow the four bits of the result code', () => {
    let progress = fresh();
    for (let i = 0; i < 40; i += 1) {
      progress = recordAttempt(progress, MISSIONS[0].id, { success: false });
    }
    assert.equal(missionProgress(progress, MISSIONS[0].id).attempts, MAX_RECORDED_ATTEMPTS);
  });

  test('an unknown mission id changes nothing', () => {
    const progress = fresh();
    assert.equal(recordAttempt(progress, 'no-such-mission', { success: true }), progress);
  });
});

describe('a found mission is frozen', () => {
  test('cannot be scored twice', () => {
    const id = MISSIONS[0].id;
    const once = recordAttempt(fresh(), id, { success: true, precision: 'precise' });
    const scoreOnce = progressScore(once);

    let twice = once;
    for (let i = 0; i < 5; i += 1) {
      twice = recordAttempt(twice, id, { success: true, precision: 'precise' });
    }

    assert.equal(progressScore(twice), scoreOnce);
    assert.equal(completedCount(twice), 1);
    assert.equal(twice, once, 'a frozen mission should return the same object');
  });

  test('a later failure cannot take a found mission away', () => {
    const id = MISSIONS[0].id;
    const found = recordAttempt(fresh(), id, { success: true, precision: 'precise' });
    const after = recordAttempt(found, id, { success: false });
    assert.equal(missionProgress(after, id).found, true);
    assert.equal(missionProgress(after, id).attempts, 1);
  });

  test('a precise find cannot be downgraded by a replay', () => {
    const id = MISSIONS[0].id;
    const precise = recordAttempt(fresh(), id, { success: true, precision: 'precise' });
    const replayed = recordAttempt(precise, id, { success: true, precision: 'wide' });
    assert.equal(missionProgress(replayed, id).precision, 'precise');
  });
});

describe('derived progress', () => {
  test('a new profile is at zero and not complete', () => {
    const progress = fresh();
    assert.equal(completedCount(progress), 0);
    assert.equal(storyFoundCount(progress), 0);
    assert.equal(progressPercent(progress), 0);
    assert.equal(progressScore(progress), 0);
    assert.equal(isGameComplete(progress), false);
    assert.deepEqual(unlockedPuzzlePieces(progress), []);
  });

  test('a full run reports 100 percent, fifteen clues and the perfect score', () => {
    const progress = completeFirst(MISSIONS.length);
    assert.equal(completedCount(progress), MISSIONS.length);
    assert.equal(storyFoundCount(progress), STORY_MISSIONS.length);
    assert.equal(progressPercent(progress), 100);
    assert.equal(isGameComplete(progress), true);
    assert.equal(progressScore(progress), 5375);
    assert.equal(unlockedPuzzlePieces(progress).length, 15);
    assert.deepEqual(troubleMissions(progress), []);
  });

  test('puzzle pieces unlock only for story missions that were found', () => {
    const progress = completeFirst(3);
    assert.deepEqual(unlockedPuzzlePieces(progress), [0, 1, 2]);
  });

  test('missions that took three or more attempts are flagged as trouble', () => {
    let progress = fresh();
    const id = MISSIONS[0].id;
    progress = recordAttempt(progress, id, { success: false });
    progress = recordAttempt(progress, id, { success: false });
    progress = recordAttempt(progress, id, { success: true, precision: 'close' });

    const trouble = troubleMissions(progress).map((mission) => mission.id);
    assert.ok(trouble.includes(id));
  });
});
