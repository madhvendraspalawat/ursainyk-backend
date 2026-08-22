// @ursainyk/engine-scoring — PURE functions only. No I/O.
// Explainable "CIBIL-like" candidate score: 0–900, preset-driven weights
// (docs/DELIVERABLES.md). Deterministic: same profile + same weights = same
// score, always — recorded scores must be recomputable.

export interface ScoringWeights {
  qualification: number;
  education: number;
  totalExp: number;
  relevantExp: number;
  language: number;
  locationFlexibility: number;
}

export interface ScoringProfile {
  qualification?: string | null;
  educationLevel?: string | null;
  totalExpMonths?: number | null;
  relevantExpMonths?: number | null;
  languages?: string[] | null;
  locationFlexible?: boolean | null;
}

export interface ScoreBreakdown {
  /** Per-dimension: attained points out of that dimension's weight. */
  [dimension: string]: { points: number; outOf: number };
}

export interface ScoreResult {
  /** 0–900, integer. */
  score: number;
  breakdown: ScoreBreakdown;
}

const MAX_SCORE = 900;
/** Months of experience that earn full marks. */
const FULL_TOTAL_EXP_MONTHS = 60;
const FULL_RELEVANT_EXP_MONTHS = 36;
/** Languages that earn full marks (Kannada/Hindi/English launch set). */
const FULL_LANGUAGES = 2;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Dimension attainment in [0,1] — the explainable part. */
export function attainment(profile: ScoringProfile): Record<keyof ScoringWeights, number> {
  return {
    qualification: profile.qualification?.trim() ? 1 : 0,
    education: profile.educationLevel?.trim() ? 1 : 0,
    totalExp: clamp01((profile.totalExpMonths ?? 0) / FULL_TOTAL_EXP_MONTHS),
    relevantExp: clamp01((profile.relevantExpMonths ?? 0) / FULL_RELEVANT_EXP_MONTHS),
    language: clamp01((profile.languages?.length ?? 0) / FULL_LANGUAGES),
    locationFlexibility: profile.locationFlexible ? 1 : 0,
  };
}

export function computeScore(profile: ScoringProfile, weights: ScoringWeights): ScoreResult {
  const attained = attainment(profile);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('weights must sum to a positive number');

  const breakdown: ScoreBreakdown = {};
  let earned = 0;
  for (const key of Object.keys(weights) as (keyof ScoringWeights)[]) {
    const outOf = (weights[key] / totalWeight) * MAX_SCORE;
    const points = attained[key] * outOf;
    breakdown[key] = { points: Math.round(points), outOf: Math.round(outOf) };
    earned += points;
  }
  return { score: Math.round(earned), breakdown };
}
