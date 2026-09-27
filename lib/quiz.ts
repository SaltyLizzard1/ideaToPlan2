// The quiz_results contract. One place, shared by every route, page and
// component that touches a quiz result.
//
// A row holds three things beyond id and site:
//   answers  jsonb  the six assessment fields, null on rows written before
//                   the two stage split
//   matches  jsonb  the ranked list. On new rows this is 7 ranking stubs
//                   (index, title, category, oneLiner). On old rows every
//                   entry is already a full match.
//   details  jsonb  one validated detail per match, keyed by the match's
//                   position in matches as a string. '{}' on old rows.
//
// mergeMatches spreads details over matches, so an old row comes back
// unchanged and every reader keeps working after the migration runs.
//
// The index of a match is always its position in the matches array. That is
// what client_reference_id carries and what keys details, so nothing else is
// allowed to define it.

export const MATCH_COUNT = 7;

export const RANKING_CATEGORIES = ['Business', 'Freelance', 'Remote Job'] as const;
export type RankingCategory = (typeof RANKING_CATEGORIES)[number];

export const SATURATION_LEVELS = ['Low', 'Medium', 'High'] as const;
export type Saturation = (typeof SATURATION_LEVELS)[number];

const MAX_TITLE = 300;
const MAX_ONE_LINER = 300;
const MAX_PROSE = 2000;
const MAX_ANSWER = 200;
const MIN_FIRST_STEPS = 4;
const MAX_FIRST_STEPS = 8;

// ── Answers ────────────────────────────────────────────────────────────────

export interface Answers {
  hardSkills: string[];
  softSkills: string[];
  workStyle: string[];
  values: string[];
  hoursPerWeek: string;
  incomeTarget: string;
}

// ── Matches ────────────────────────────────────────────────────────────────

export interface Ranking {
  index: number;
  title: string;
  category: RankingCategory;
  oneLiner: string;
}

export interface MatchDetail {
  title: string;
  category: RankingCategory;
  description: string;
  targetCustomer: string;
  industry: string;
  problem: string;
  revenueModel: string;
  whyYou: string;
  incomeRange: string;
  uniqueAngle: string;
  firstSteps: string[];
  saturation: Saturation;
  saturationNote: string;
}

export const DETAIL_FIELDS = [
  'title',
  'category',
  'description',
  'targetCustomer',
  'industry',
  'problem',
  'revenueModel',
  'whyYou',
  'incomeRange',
  'uniqueAngle',
  'firstSteps',
  'saturation',
  'saturationNote',
] as const;

// What every reader renders. Deliberately permissive: an old row carries a
// free text category and no oneLiner, a new row that has no detail yet
// carries only the ranking fields.
export interface MergedMatch {
  index: number;
  title: string;
  category?: string;
  oneLiner?: string;
  description?: string;
  targetCustomer?: string;
  industry?: string;
  problem?: string;
  revenueModel?: string;
  whyYou?: string;
  incomeRange?: string;
  uniqueAngle?: string;
  firstSteps?: string[];
  saturation?: string;
  saturationNote?: string;
}

// ── Validation ─────────────────────────────────────────────────────────────

export type Validated<T> = { ok: true; value: T } | { ok: false; reason: string };

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

// n8n's Respond to Webhook node returns its items as an array. A ranking
// response is an array in its own right, so only unwrap when the single
// element is an object that is clearly the envelope and not a match.
function unwrapEnvelope(data: unknown, key: string): unknown {
  if (
    Array.isArray(data) &&
    data.length === 1 &&
    typeof data[0] === 'object' &&
    data[0] !== null &&
    key in (data[0] as Record<string, unknown>)
  ) {
    return data[0];
  }
  return data;
}

function unwrapObject(data: unknown): unknown {
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === 'object' && data[0] !== null) {
    return data[0];
  }
  return data;
}

function readString(
  obj: Record<string, unknown>,
  field: string,
  max: number
): Validated<string> {
  const raw = obj[field];
  if (typeof raw !== 'string') return fail(`${field} is ${raw === undefined ? 'missing' : typeof raw}, expected string`);
  const value = raw.trim();
  if (value.length === 0) return fail(`${field} is empty`);
  if (value.length > max) return fail(`${field} is ${value.length} chars, max ${max}`);
  return { ok: true, value };
}

function readStringArray(
  obj: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
  maxItemLength: number
): Validated<string[]> {
  const raw = obj[field];
  if (!Array.isArray(raw)) return fail(`${field} is ${raw === undefined ? 'missing' : typeof raw}, expected array`);
  if (raw.length < min || raw.length > max) {
    return fail(`${field} has ${raw.length} items, expected ${min} to ${max}`);
  }
  const value: string[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== 'string') return fail(`${field}[${i}] is ${typeof item}, expected string`);
    const trimmed = item.trim();
    if (trimmed.length === 0) return fail(`${field}[${i}] is empty`);
    if (trimmed.length > maxItemLength) {
      return fail(`${field}[${i}] is ${trimmed.length} chars, max ${maxItemLength}`);
    }
    value.push(trimmed);
  }
  return { ok: true, value };
}

/**
 * The six assessment fields, allowlisted. Only this shape is sent to the
 * ranking webhook and only this shape is stored, never the raw request body.
 */
export function readAnswers(body: unknown): Validated<Answers> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return fail('body is not an object');
  }
  const obj = body as Record<string, unknown>;

  const hardSkills = readStringArray(obj, 'hardSkills', 1, 30, MAX_ANSWER);
  if (!hardSkills.ok) return hardSkills;
  const softSkills = readStringArray(obj, 'softSkills', 1, 30, MAX_ANSWER);
  if (!softSkills.ok) return softSkills;
  const workStyle = readStringArray(obj, 'workStyle', 1, 10, MAX_ANSWER);
  if (!workStyle.ok) return workStyle;
  const values = readStringArray(obj, 'values', 1, 10, MAX_ANSWER);
  if (!values.ok) return values;
  const hoursPerWeek = readString(obj, 'hoursPerWeek', 50);
  if (!hoursPerWeek.ok) return hoursPerWeek;
  const incomeTarget = readString(obj, 'incomeTarget', 50);
  if (!incomeTarget.ok) return incomeTarget;

  return {
    ok: true,
    value: {
      hardSkills: hardSkills.value,
      softSkills: softSkills.value,
      workStyle: workStyle.value,
      values: values.value,
      hoursPerWeek: hoursPerWeek.value,
      incomeTarget: incomeTarget.value,
    },
  };
}

/**
 * The ranking webhook response. Exactly MATCH_COUNT entries, indices 0 to
 * MATCH_COUNT - 1 with none missing and none repeated. Returned sorted by
 * index, so the array position and the index always agree.
 */
export function readRankings(data: unknown): Validated<Ranking[]> {
  const root = unwrapEnvelope(data, 'rankings');
  let list: unknown;
  if (Array.isArray(root)) {
    list = root;
  } else if (typeof root === 'object' && root !== null) {
    list = (root as Record<string, unknown>).rankings;
  }
  if (!Array.isArray(list)) return fail('no rankings array in response');
  if (list.length !== MATCH_COUNT) return fail(`${list.length} rankings, expected exactly ${MATCH_COUNT}`);

  const seen = new Set<number>();
  const rankings: Ranking[] = [];

  for (const [i, entry] of list.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return fail(`rankings[${i}] is not an object`);
    }
    const obj = entry as Record<string, unknown>;

    const index = obj.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index > MATCH_COUNT - 1) {
      return fail(`rankings[${i}].index is ${JSON.stringify(index)}, expected an integer 0 to ${MATCH_COUNT - 1}`);
    }
    if (seen.has(index)) return fail(`rankings[${i}].index ${index} is repeated`);
    seen.add(index);

    const title = readString(obj, 'title', MAX_TITLE);
    if (!title.ok) return fail(`rankings[${i}].${title.reason}`);
    const oneLiner = readString(obj, 'oneLiner', MAX_ONE_LINER);
    if (!oneLiner.ok) return fail(`rankings[${i}].${oneLiner.reason}`);

    const category = obj.category;
    if (typeof category !== 'string' || !RANKING_CATEGORIES.includes(category as RankingCategory)) {
      return fail(
        `rankings[${i}].category is ${JSON.stringify(category)}, expected one of ${RANKING_CATEGORIES.join(', ')}`
      );
    }

    rankings.push({ index, title: title.value, category: category as RankingCategory, oneLiner: oneLiner.value });
  }

  rankings.sort((a, b) => a.index - b.index);
  return { ok: true, value: rankings };
}

/**
 * The detail webhook response. All 13 fields, and the title must come back
 * unchanged so a detail can never be filed against the wrong match.
 */
export function readDetail(data: unknown, expectedTitle: string): Validated<MatchDetail> {
  const root = unwrapObject(data);
  if (typeof root !== 'object' || root === null || Array.isArray(root)) {
    return fail('detail is not an object');
  }
  const obj = root as Record<string, unknown>;

  for (const field of DETAIL_FIELDS) {
    if (!(field in obj)) return fail(`${field} is missing`);
  }

  const title = readString(obj, 'title', MAX_TITLE);
  if (!title.ok) return title;
  if (title.value !== expectedTitle.trim()) {
    return fail(`title is ${JSON.stringify(title.value)}, expected ${JSON.stringify(expectedTitle.trim())}`);
  }

  const category = obj.category;
  if (typeof category !== 'string' || !RANKING_CATEGORIES.includes(category as RankingCategory)) {
    return fail(`category is ${JSON.stringify(category)}, expected one of ${RANKING_CATEGORIES.join(', ')}`);
  }

  const saturation = obj.saturation;
  if (typeof saturation !== 'string' || !SATURATION_LEVELS.includes(saturation as Saturation)) {
    return fail(`saturation is ${JSON.stringify(saturation)}, expected one of ${SATURATION_LEVELS.join(', ')}`);
  }

  const prose: Record<string, string> = {};
  for (const field of [
    'description',
    'targetCustomer',
    'industry',
    'problem',
    'revenueModel',
    'whyYou',
    'incomeRange',
    'uniqueAngle',
    'saturationNote',
  ]) {
    const read = readString(obj, field, MAX_PROSE);
    if (!read.ok) return read;
    prose[field] = read.value;
  }

  const firstSteps = readStringArray(obj, 'firstSteps', MIN_FIRST_STEPS, MAX_FIRST_STEPS, MAX_PROSE);
  if (!firstSteps.ok) return firstSteps;

  return {
    ok: true,
    value: {
      title: title.value,
      category: category as RankingCategory,
      description: prose.description,
      targetCustomer: prose.targetCustomer,
      industry: prose.industry,
      problem: prose.problem,
      revenueModel: prose.revenueModel,
      whyYou: prose.whyYou,
      incomeRange: prose.incomeRange,
      uniqueAngle: prose.uniqueAngle,
      firstSteps: firstSteps.value,
      saturation: saturation as Saturation,
      saturationNote: prose.saturationNote,
    },
  };
}

// ── Merging ────────────────────────────────────────────────────────────────

/**
 * Spread the stored details over the stored matches. The index is the array
 * position, so old rows (full matches, details '{}') come back as they were.
 */
export function mergeMatches(matches: unknown, details: unknown): MergedMatch[] {
  if (!Array.isArray(matches)) return [];
  const byIndex =
    typeof details === 'object' && details !== null && !Array.isArray(details)
      ? (details as Record<string, unknown>)
      : {};

  return matches.map((entry, i) => {
    const ranking = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const detail = byIndex[String(i)];
    const merged = typeof detail === 'object' && detail !== null ? { ...ranking, ...detail } : { ...ranking };
    return { ...merged, index: i, title: typeof merged.title === 'string' ? merged.title : '' } as MergedMatch;
  });
}

/**
 * True when a match has a body to show. False for a ranking stub that is
 * still waiting on its detail, which is what puts a skeleton on the card.
 */
export function isDetailed(match: MergedMatch | undefined): boolean {
  return !!match && typeof match.description === 'string' && match.description.length > 0;
}
