import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  KEY_DRILL_REWARDS,
  MISSION_REWARDS,
  PASTE_DRILL_REWARDS,
  STORY_REWARDS,
} from '../src/game/missions';
import {
  MISTAKE_PENALTY,
  POINTS,
  maxMissionScore,
  maxTotalScore,
  scoreMission,
  totalScore,
  type MissionOutcome,
} from '../src/game/scoring';

const perfect: MissionOutcome = { found: true, attempts: 1, precision: 'precise' };
const close: MissionOutcome = { found: true, attempts: 1, precision: 'close' };
const missed: MissionOutcome = { found: false, attempts: 6, precision: 'none' };

describe('scoring table', () => {
  test('matches the points listed in the brief', () => {
    assert.equal(POINTS.clueFound, 100);
    assert.equal(POINTS.cropTaken, 50);
    assert.equal(POINTS.pastedCorrectly, 50);
    assert.equal(POINTS.preciseCrop, 25);
    assert.equal(POINTS.missionCompleted, 100);
  });

  test('a perfect story mission is worth 325', () => {
    assert.equal(scoreMission(STORY_REWARDS, perfect), 325);
  });

  test('a story mission found without a precise crop is worth 300', () => {
    assert.equal(scoreMission(STORY_REWARDS, close), 300);
    assert.equal(scoreMission(STORY_REWARDS, { ...close, precision: 'wide' }), 300);
  });

  test('extra attempts cost five points each and nothing more', () => {
    assert.equal(scoreMission(STORY_REWARDS, { ...perfect, attempts: 2 }), 320);
    assert.equal(scoreMission(STORY_REWARDS, { ...perfect, attempts: 5 }), 305);
    assert.equal(MISTAKE_PENALTY, 5);
  });

  test('a mission score never goes negative', () => {
    assert.equal(scoreMission(STORY_REWARDS, { ...perfect, attempts: 500 }), 0);
  });

  test('an unfinished mission is worth zero, never a debt', () => {
    assert.equal(scoreMission(STORY_REWARDS, missed), 0);
  });

  test('a paste drill is worth 200 and a key drill 100', () => {
    assert.equal(scoreMission(PASTE_DRILL_REWARDS, close), 200);
    // A drill cannot be "precise": the precise bonus must not leak into it.
    assert.equal(scoreMission(PASTE_DRILL_REWARDS, perfect), 200);
    assert.equal(scoreMission(KEY_DRILL_REWARDS, close), 100);
  });

  test('maxMissionScore agrees with a flawless outcome', () => {
    assert.equal(maxMissionScore(STORY_REWARDS), scoreMission(STORY_REWARDS, perfect));
    assert.equal(maxMissionScore(PASTE_DRILL_REWARDS), scoreMission(PASTE_DRILL_REWARDS, close));
    assert.equal(maxMissionScore(KEY_DRILL_REWARDS), scoreMission(KEY_DRILL_REWARDS, close));
  });
});

describe('scoring a whole run', () => {
  test('a flawless run of the shipped catalogue totals 5375', () => {
    const outcomes = MISSION_REWARDS.map(() => perfect);
    assert.equal(totalScore(MISSION_REWARDS, outcomes), 5375);
    assert.equal(maxTotalScore(MISSION_REWARDS), 5375);
  });

  test('a run found first try but never precise totals 5000', () => {
    const outcomes = MISSION_REWARDS.map(() => close);
    assert.equal(totalScore(MISSION_REWARDS, outcomes), 5000);
  });

  test('a run where nothing was found is worth zero', () => {
    const outcomes = MISSION_REWARDS.map(() => missed);
    assert.equal(totalScore(MISSION_REWARDS, outcomes), 0);
  });

  test('missing outcomes are simply not counted', () => {
    assert.equal(totalScore(MISSION_REWARDS, [perfect]), 325);
  });
});
