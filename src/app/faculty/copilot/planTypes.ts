/** The structured lesson plan shape produced by `generateLessonPlan`. */
export interface LessonPlanContent {
  objectives?: string[];
  structure?: { minutes: number; activity: string }[];
  keyExamples?: { title: string; detail: string }[];
  misconceptions?: string[];
  quiz?: { q: string; a: string }[];
  homework?: string;
  remedial?: string;
  /** Present when the offline scaffold produced this rather than a model. */
  _generator?: string;
  _note?: string;
}

/** Narrows an unknown JSON blob to the plan shape without inventing fields. */
export function asPlanContent(value: unknown): LessonPlanContent {
  if (typeof value !== 'object' || value === null) return {};
  const raw = value as Record<string, unknown>;

  const strings = (input: unknown): string[] | undefined =>
    Array.isArray(input) ? input.filter((x): x is string => typeof x === 'string') : undefined;

  const structure = Array.isArray(raw.structure)
    ? raw.structure
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          minutes: Number(x.minutes) || 0,
          activity: typeof x.activity === 'string' ? x.activity : '',
        }))
        .filter((x) => x.activity)
    : undefined;

  const keyExamples = Array.isArray(raw.keyExamples)
    ? raw.keyExamples
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          title: typeof x.title === 'string' ? x.title : '',
          detail: typeof x.detail === 'string' ? x.detail : '',
        }))
        .filter((x) => x.title || x.detail)
    : undefined;

  const quiz = Array.isArray(raw.quiz)
    ? raw.quiz
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          q: typeof x.q === 'string' ? x.q : '',
          a: typeof x.a === 'string' ? x.a : '',
        }))
        .filter((x) => x.q)
    : undefined;

  return {
    objectives: strings(raw.objectives),
    structure,
    keyExamples,
    misconceptions: strings(raw.misconceptions),
    quiz,
    homework: typeof raw.homework === 'string' ? raw.homework : undefined,
    remedial: typeof raw.remedial === 'string' ? raw.remedial : undefined,
    _generator: typeof raw._generator === 'string' ? raw._generator : undefined,
    _note: typeof raw._note === 'string' ? raw._note : undefined,
  };
}
