import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createProgress, recordAttempt } from '../src/game/gameState';
import { MISSIONS } from '../src/game/missions';
import {
  createMemoryStorage,
  loadProgress,
  parseProgress,
  saveProgress,
} from '../src/game/progressStore';
import {
  WALKTHROUGH_STEPS,
  canAdvanceOn,
  createWalkthroughMachine,
  type WalkthroughStep,
} from '../src/ui/walkthrough';

/** A machine over the real tour, with every target reported as present. */
function fullTour(overrides: Partial<Parameters<typeof createWalkthroughMachine>[0]> = {}) {
  const seen: string[] = [];
  const ended: string[] = [];
  const machine = createWalkthroughMachine({
    isTargetPresent: () => true,
    onStep: (step) => seen.push(step.id),
    onEnd: (reason) => ended.push(reason),
    ...overrides,
  });
  machine.start();
  return { machine, seen, ended };
}

describe('walkthrough steps', () => {
  it('starts on the poster and ends on the progress rail', () => {
    assert.equal(WALKTHROUGH_STEPS[0].id, 'poster');
    assert.equal(WALKTHROUGH_STEPS[WALKTHROUGH_STEPS.length - 1].id, 'rail');
  });

  it('gives every step a unique id', () => {
    const ids = WALKTHROUGH_STEPS.map((step) => step.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  /**
   * One instruction per bubble. A seven year old reading three sentences on a
   * coach mark reads none of them, so the cap is enforced rather than intended.
   */
  it('keeps every bubble to one short instruction', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const words = step.text.trim().split(/\s+/).length;
      assert.ok(
        words >= 8 && words <= 16,
        `step ${step.id} is ${words} words: "${step.text}"`,
      );
    }
  });

  it('earns the zoom step instead of letting it be clicked past', () => {
    const zoom = WALKTHROUGH_STEPS.find((step) => step.id === 'zoom') as WalkthroughStep;
    assert.equal(zoom.trigger, 'zoom-in');
    assert.equal(zoom.buttonLabel, undefined, 'a gesture step must carry no button');
    assert.equal(canAdvanceOn(zoom, 'next'), false);
    assert.equal(canAdvanceOn(zoom, 'paste'), false);
    assert.equal(canAdvanceOn(zoom, 'zoom-in'), true);
  });

  it('earns the snip step instead of letting it be clicked past', () => {
    const snip = WALKTHROUGH_STEPS.find((step) => step.id === 'snip') as WalkthroughStep;
    assert.equal(snip.trigger, 'paste');
    assert.equal(snip.buttonLabel, undefined, 'a gesture step must carry no button');
    assert.equal(canAdvanceOn(snip, 'next'), false);
    assert.equal(canAdvanceOn(snip, 'zoom-in'), false);
    assert.equal(canAdvanceOn(snip, 'paste'), true);
  });
});

/**
 * THE RULE THIS FILE EXISTS FOR.
 *
 * `Windows + Shift + S` photographs the screen exactly as it is. A scrim over
 * the poster at that moment is not merely ugly in the child's evidence: it
 * lowers the HSV *value* of every pixel beneath it, and `sealDecoder.ts` throws
 * away anything under `MIN_VALUE = 0.45`. A seal photographed through a scrim
 * decodes as nothing at all - the exact false negative this project spent its
 * time eliminating.
 *
 * So the step where the snip happens declares no scrim, and nothing else may
 * quietly grow one back.
 */
describe('the snip step is never covered', () => {
  const snip = WALKTHROUGH_STEPS.find((step) => step.id === 'snip') as WalkthroughStep;

  it('declares no scrim on the step where the screenshot is taken', () => {
    assert.equal(snip.scrim, false);
  });

  it('spotlights nothing, so there is no hole and no ring over the poster', () => {
    assert.equal(snip.target, null);
  });

  it('is the only step that ends on a real paste', () => {
    const pasteSteps = WALKTHROUGH_STEPS.filter((step) => step.trigger === 'paste');
    assert.deepEqual(pasteSteps.map((step) => step.id), ['snip']);
  });

  it('is the only step without a scrim', () => {
    const bare = WALKTHROUGH_STEPS.filter((step) => !step.scrim);
    assert.deepEqual(bare.map((step) => step.id), ['snip']);
  });

  it('carries the one hard idea: the photo is of this window', () => {
    assert.equal(snip.diagram, true);
    assert.deepEqual([...(snip.keys ?? [])], ['Win', 'Shift', 'S']);
    assert.match(snip.text, /window/);
  });
});

describe('walkthrough machine', () => {
  it('walks the steps in order', () => {
    const { machine, seen, ended } = fullTour();

    assert.equal(machine.total(), WALKTHROUGH_STEPS.length);
    assert.equal(machine.current()?.id, 'poster');

    machine.fire('next');
    assert.equal(machine.current()?.id, 'steps');
    machine.fire('next');
    assert.equal(machine.current()?.id, 'zoom');
    machine.fire('zoom-in');
    assert.equal(machine.current()?.id, 'snip');
    machine.fire('paste');
    assert.equal(machine.current()?.id, 'evidence');
    machine.fire('auto');
    assert.equal(machine.current()?.id, 'rail');
    machine.fire('next');

    assert.equal(machine.current(), null);
    assert.equal(machine.isDone(), true);
    assert.deepEqual(ended, ['finished']);
    assert.deepEqual(seen, ['poster', 'steps', 'zoom', 'snip', 'evidence', 'rail']);
  });

  it('does not let a "Siguiente" click past the zoom step', () => {
    const { machine } = fullTour();
    machine.fire('next');
    machine.fire('next');
    assert.equal(machine.current()?.id, 'zoom');

    // The button is what a bored child presses. It must do nothing here.
    machine.fire('next');
    machine.fire('next');
    machine.fire('next');
    assert.equal(machine.current()?.id, 'zoom', 'the zoom step was clicked past');

    machine.fire('zoom-in');
    assert.equal(machine.current()?.id, 'snip');
  });

  it('does not let a "Siguiente" click past the snip step', () => {
    const { machine } = fullTour();
    machine.fire('next');
    machine.fire('next');
    machine.fire('zoom-in');
    assert.equal(machine.current()?.id, 'snip');

    machine.fire('next');
    machine.fire('zoom-in');
    assert.equal(machine.current()?.id, 'snip', 'the snip step was clicked past');

    machine.fire('paste');
    assert.equal(machine.current()?.id, 'evidence');
  });

  it('lets the button shortcut a step that would advance on its own anyway', () => {
    const { machine } = fullTour();
    machine.fire('next');
    machine.fire('next');
    machine.fire('zoom-in');
    machine.fire('paste');
    assert.equal(machine.current()?.id, 'evidence');

    machine.fire('next');
    assert.equal(machine.current()?.id, 'rail');
  });

  it('skips a step whose spotlight target is missing instead of throwing', () => {
    const { machine, seen } = fullTour({
      // The rail is the thing a narrow layout is most likely to drop.
      isTargetPresent: (selector: string) => selector !== '.rail',
    });

    assert.equal(machine.total(), WALKTHROUGH_STEPS.length - 1);
    machine.fire('next');
    machine.fire('next');
    machine.fire('zoom-in');
    machine.fire('paste');
    assert.equal(machine.current()?.id, 'evidence');
    machine.fire('auto');

    assert.equal(machine.current(), null, 'the missing step should have ended the tour');
    assert.deepEqual(seen, ['poster', 'steps', 'zoom', 'snip', 'evidence']);
  });

  it('keeps the snip step even when every element on screen is missing', () => {
    // `snip` has no target at all, so it is the one step a stripped-down screen
    // cannot lose - which is right: it is the step that teaches the hard idea.
    const { machine, seen } = fullTour({ isTargetPresent: () => false });
    assert.equal(machine.total(), 1);
    assert.equal(machine.current()?.id, 'snip');
    machine.fire('paste');
    assert.deepEqual(seen, ['snip']);
    assert.equal(machine.isDone(), true);
  });

  it('ends quietly rather than stranding a scrim when it has no steps at all', () => {
    const ended: string[] = [];
    const machine = createWalkthroughMachine({
      steps: [],
      isTargetPresent: () => true,
      onEnd: (reason) => ended.push(reason),
    });
    machine.start();

    assert.equal(machine.isDone(), true);
    assert.equal(machine.current(), null);
    assert.deepEqual(ended, ['finished']);
  });

  it('reports its position so the bubble can draw the right number of dots', () => {
    const { machine } = fullTour();
    assert.equal(machine.position(), 0);
    machine.fire('next');
    assert.equal(machine.position(), 1);
    assert.equal(machine.total(), WALKTHROUGH_STEPS.length);
  });

  it('stops on "Skip the guide" and reports that it was skipped, not finished', () => {
    const { machine, ended } = fullTour();
    machine.skip();

    assert.equal(machine.isDone(), true);
    assert.equal(machine.current(), null);
    assert.deepEqual(ended, ['skipped']);

    // A skipped tour is inert: a late paste must not restart anything.
    machine.fire('paste');
    assert.deepEqual(ended, ['skipped']);
  });
});

describe('the tutorial is off the startup path', () => {
  /*
   * A teacher tested the game with a class and asked for the practice section
   * taken off the start. These tests are what stops it creeping back: not one
   * of them checks a screen, they all check that there is no longer any stored
   * state a startup path could branch on.
   */

  it('gives a fresh profile no flag that could force the tutorial', () => {
    const fresh = createProgress('Ana', '3B') as unknown as Record<string, unknown>;

    assert.equal(
      'trainingCompleted' in fresh,
      false,
      'a first-run training flag is back; it is what put the tutorial before mission 1',
    );
    assert.equal(
      'walkthroughSeen' in fresh,
      false,
      'a first-run walkthrough flag is back; it is what put the tour before mission 1',
    );
  });

  it('starts a fresh profile on mission 1, with nothing found yet', () => {
    const fresh = createProgress('Ana', '3B');

    assert.equal(fresh.currentMissionIndex, 0);
    assert.equal(MISSIONS[0].kind, 'story', 'mission 1 is the first thing a child now meets');
    assert.deepEqual(fresh.missions, {});
  });

  it('loads a profile saved by the older build, and ignores its dead flags', () => {
    // Exactly the shape the shipped build wrote: real progress, plus the two
    // flags this build no longer has an opinion about.
    const storage = createMemoryStorage();
    let played = createProgress('Ana', '3B');
    played = recordAttempt(played, MISSIONS[0].id, { success: true, precision: 'precise' });
    const older = { ...played, trainingCompleted: true, walkthroughSeen: true };
    saveProgress(older as never, storage);

    const loaded = loadProgress('Ana', '3B', storage) as unknown as Record<string, unknown>;

    assert.equal(loaded.name, 'Ana', 'the old profile was thrown away');
    assert.deepEqual(
      (loaded.missions as Record<string, unknown>)[MISSIONS[0].id],
      { found: true, attempts: 1, precision: 'precise' },
      'the afternoon a child already played must survive the flag removal',
    );
    assert.equal('trainingCompleted' in loaded, false, 'a dead flag was read back in');
    assert.equal('walkthroughSeen' in loaded, false, 'a dead flag was read back in');
  });

  it('still degrades a genuinely corrupt profile rather than half-loading it', () => {
    const base = createProgress('Ana', '3B');

    // A dead flag holding rubbish is not a reason to lose the profile...
    for (const corrupt of [undefined, null, 0, 1, '', 'true', 'sí', {}, []]) {
      const parsed = parseProgress({ ...base, walkthroughSeen: corrupt, trainingCompleted: corrupt });
      assert.ok(parsed, `a dead flag holding ${JSON.stringify(corrupt)} killed the whole profile`);
    }

    // ...but a broken field the game does rely on still is.
    assert.equal(parseProgress({ ...base, missions: 'nope' }), null);
    assert.equal(parseProgress({ ...base, version: 99 }), null);
    assert.equal(parseProgress(null), null);
  });
});
