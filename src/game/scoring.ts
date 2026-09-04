/**
 * The points table. One place, one table, no other module invents a number.
 *
 * The brief is explicit that mistakes must cost almost nothing: the child is
 * learning a keyboard flow, not sitting an exam. So the penalty is five points
 * per extra attempt against a mission worth up to 325, and the mission score is
 * floored at zero. A child who needs ten tries still keeps most of the reward.
 *
 * Nothing here touches the DOM or imports a mission catalogue: it grades a
 * `MissionRewards` descriptor that the catalogue hands over, which is what lets
 * a new mission type be added as data instead of as a branch in this file.
 */

/**
 * How tightly the child cropped, coarsest to finest.
 *
 * The order is load bearing twice over: `resultCode.ts` stores the index in two
 * bits, and the teacher panel sorts by it. Append, never reorder.
 */
export const PRECISION_TIERS = ['none', 'wide', 'close', 'precise'] as const;

export type PrecisionTier = (typeof PRECISION_TIERS)[number];

/** Spanish labels for the teacher panel. */
export const PRECISION_TIER_LABELS: Record<PrecisionTier, string> = {
  none: 'sin recorte',
  wide: 'recorte amplio',
  close: 'recorte cercano',
  precise: 'recorte preciso',
};

/** The points table from the brief. */
export const POINTS = {
  /** Encontrar pista. */
  clueFound: 100,
  /** Realizar recorte. */
  cropTaken: 50,
  /** Pegar correctamente. */
  pastedCorrectly: 50,
  /** Recorte preciso. */
  preciseCrop: 25,
  /** Completar misión. */
  missionCompleted: 100,
} as const;

/** Deducted per extra attempt. Deliberately tiny. */
export const MISTAKE_PENALTY = 5;

/**
 * Which parts of the table a mission can pay out.
 *
 * A story mission pays all of them. The zoom drill pays none of them and is
 * worth only the completion bonus, because no crop and no paste happen in it.
 */
export interface MissionRewards {
  clueFound: boolean;
  cropTaken: boolean;
  pastedCorrectly: boolean;
  canBePrecise: boolean;
}

/** What actually happened on one mission. */
export interface MissionOutcome {
  /** True once the mission was completed successfully. */
  found: boolean;
  /** Paste (or key press) attempts spent on it. */
  attempts: number;
  precision: PrecisionTier;
}

/** The highest a mission with these rewards can pay, before any penalty. */
export function maxMissionScore(rewards: MissionRewards): number {
  let total = POINTS.missionCompleted;
  if (rewards.clueFound) total += POINTS.clueFound;
  if (rewards.cropTaken) total += POINTS.cropTaken;
  if (rewards.pastedCorrectly) total += POINTS.pastedCorrectly;
  if (rewards.canBePrecise) total += POINTS.preciseCrop;
  return total;
}

/**
 * Points earned on one mission.
 *
 * An unfinished mission is worth nothing rather than something negative: a
 * child who runs out of time should see zero, never a debt.
 */
export function scoreMission(rewards: MissionRewards, outcome: MissionOutcome): number {
  if (!outcome.found) return 0;

  let total = POINTS.missionCompleted;
  if (rewards.clueFound) total += POINTS.clueFound;
  if (rewards.cropTaken) total += POINTS.cropTaken;
  if (rewards.pastedCorrectly) total += POINTS.pastedCorrectly;
  if (rewards.canBePrecise && outcome.precision === 'precise') total += POINTS.preciseCrop;

  const extraAttempts = Math.max(0, outcome.attempts - 1);
  return Math.max(0, total - extraAttempts * MISTAKE_PENALTY);
}

/** Sum of `scoreMission` over a run. Both arrays are index aligned. */
export function totalScore(
  rewards: readonly MissionRewards[],
  outcomes: readonly MissionOutcome[],
): number {
  return rewards.reduce((sum, reward, index) => {
    const outcome = outcomes[index];
    return outcome ? sum + scoreMission(reward, outcome) : sum;
  }, 0);
}

/** The score a flawless run is worth, used by the teacher panel's percentage. */
export function maxTotalScore(rewards: readonly MissionRewards[]): number {
  return rewards.reduce((sum, reward) => sum + maxMissionScore(reward), 0);
}
