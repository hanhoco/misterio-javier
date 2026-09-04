import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PARK_TARGETS } from '../src/poster/parkPosterData';
import {
  COPY_DRILL_SEAL_CODE,
  CROP_DRILL_SEAL_CODE,
  DRILL_MISSIONS,
  MISSIONS,
  PUZZLE_PIECE_COUNT,
  STORY_MISSIONS,
  TRAINING_MISSION,
  TRAINING_SEAL_CODE,
  findMission,
} from '../src/game/missions';

describe('mission catalogue', () => {
  test('has exactly one story mission per park target', () => {
    assert.equal(STORY_MISSIONS.length, 15);
    assert.equal(STORY_MISSIONS.length, PARK_TARGETS.length);

    assert.deepEqual(
      new Set(STORY_MISSIONS.map((mission) => mission.targetId)),
      new Set(PARK_TARGETS.map((target) => target.id)),
    );
  });

  test('orders the missions biggest object first', () => {
    // The kite is the smallest of the fifteen and used to be mission one, so
    // children met the hardest target before they had learned the gesture. The
    // first mission has to be the easiest object to hit; difficulty comes later.
    const areaOf = (targetId: string): number => {
      const target = PARK_TARGETS.find((candidate) => candidate.id === targetId);
      assert.ok(target, `no park target named ${targetId}`);
      return target.width * target.height;
    };

    const areas = STORY_MISSIONS.map((mission) => areaOf(mission.targetId));
    for (let i = 1; i < areas.length; i += 1) {
      assert.ok(
        areas[i] <= areas[i - 1],
        `mission ${i + 1} (${STORY_MISSIONS[i].targetId}) is bigger than the one before it`,
      );
    }

    assert.equal(STORY_MISSIONS[0].targetId, 'school');
    assert.equal(STORY_MISSIONS[STORY_MISSIONS.length - 1].targetId, 'kite');
  });

  test('every story mission carries a distinct seal code, matching its target', () => {
    const codes = STORY_MISSIONS.map((mission) => mission.sealCode);
    assert.equal(new Set(codes).size, STORY_MISSIONS.length);

    for (const mission of STORY_MISSIONS) {
      const target = PARK_TARGETS.find((candidate) => candidate.id === mission.targetId);
      assert.ok(target, `no park target for ${mission.targetId}`);
      assert.equal(mission.sealCode, target.sealCode);
    }
  });

  test('story missions are numbered 1..15 and own one puzzle piece each', () => {
    assert.equal(PUZZLE_PIECE_COUNT, 15);
    STORY_MISSIONS.forEach((mission, index) => {
      assert.equal(mission.storyNumber, index + 1);
      assert.equal(mission.puzzlePieceIndex, index);
    });
    assert.equal(
      new Set(STORY_MISSIONS.map((mission) => mission.puzzlePieceIndex)).size,
      15,
    );
  });

  test('mission ids are unique and orders are consecutive from zero', () => {
    assert.equal(new Set(MISSIONS.map((mission) => mission.id)).size, MISSIONS.length);
    MISSIONS.forEach((mission, index) => assert.equal(mission.order, index));
  });

  test('the three drills are interleaved, never two in a row', () => {
    assert.equal(DRILL_MISSIONS.length, 3);
    assert.deepEqual(
      DRILL_MISSIONS.map((mission) => mission.drill),
      ['zoom', 'crop', 'copy'],
    );
    assert.equal(MISSIONS.length, STORY_MISSIONS.length + DRILL_MISSIONS.length);

    for (let index = 1; index < MISSIONS.length; index += 1) {
      const previous = MISSIONS[index - 1];
      const current = MISSIONS[index];
      assert.ok(
        previous.kind === 'story' || current.kind === 'story',
        `two drills in a row at index ${index}`,
      );
    }
  });

  test('practice seals never collide with a story seal', () => {
    const storyCodes = new Set(STORY_MISSIONS.map((mission) => mission.sealCode));
    for (const code of [TRAINING_SEAL_CODE, CROP_DRILL_SEAL_CODE, COPY_DRILL_SEAL_CODE]) {
      assert.equal(storyCodes.has(code), false, `practice code ${code} collides`);
    }
    assert.equal(new Set([TRAINING_SEAL_CODE, CROP_DRILL_SEAL_CODE, COPY_DRILL_SEAL_CODE]).size, 3);
  });

  test('every paste drill declares the seal its picture carries', () => {
    for (const drill of DRILL_MISSIONS) {
      if (drill.drill === 'zoom') {
        assert.equal(drill.sealCode, undefined);
        continue;
      }
      assert.equal(typeof drill.sealCode, 'number');
      assert.equal(typeof drill.shape, 'string');
      assert.equal(typeof drill.shapeName, 'string');
    }
  });

  test('the training mission has the six steps of the brief and is not scored', () => {
    assert.equal(TRAINING_MISSION.steps.length, 6);
    assert.equal(findMission(TRAINING_MISSION.id), undefined);
    assert.equal(TRAINING_MISSION.steps[TRAINING_MISSION.steps.length - 1].trigger, 'paste');
  });

  /**
   * The "Crop here" marker is pinned to the bottom-right corner of the
   * poster stage, and that is only safe because no park target reaches it. If
   * a sixteenth target is ever measured into that corner, the marker starts
   * covering a clue and this test is the thing that says so.
   */
  test('the bottom-right corner of the poster is clear of every target', () => {
    const corner = { x: 0.84, y: 0.86 };
    const trespassers = PARK_TARGETS.filter(
      (target) =>
        target.normalized.x + target.normalized.width > corner.x &&
        target.normalized.y + target.normalized.height > corner.y,
    ).map((target) => target.id);

    assert.deepEqual(
      trespassers,
      [],
      'a target now sits under the "Crop here" marker; move the marker',
    );
  });

  test('every mission the child plays has an objective and a title', () => {
    for (const mission of MISSIONS) {
      assert.ok(mission.objective.length > 0);
      assert.ok(mission.title.length > 0);
    }
  });
});
