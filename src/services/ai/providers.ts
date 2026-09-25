import 'server-only';
import type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiProvider,
  ToolCall,
} from './types';

/**
 * PROVIDERS
 * ---------------------------------------------------------------------------
 * `AnthropicProvider` talks to the Claude Messages API.
 * `LocalProvider`     is a deterministic, offline provider used when no API key
 *                     is configured. It is NOT a language model: it performs
 *                     rule-based intent detection so that every feature in
 *                     CampusOS remains usable (and testable, and demonstrable
 *                     without network access). The UI labels it explicitly.
 */

/* ----------------------------- Anthropic ---------------------------------- */

class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  readonly isLanguageModel = true;
  readonly model: string;

  constructor(private apiKey: string, model?: string) {
    this.model = model ?? process.env.AI_MODEL ?? 'claude-sonnet-4-6';
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: request.maxTokens ?? Number(process.env.AI_MAX_TOKENS ?? 4096),
      system: request.system,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    if (request.temperature !== undefined) body.temperature = request.temperature;

    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Anthropic API error ${response.status}: ${detail.slice(0, 400)}`);
    }

    const json = (await response.json()) as {
      content: { type: string; text?: string; id?: string; name?: string; input?: unknown }[];
      usage: { input_tokens: number; output_tokens: number };
      stop_reason: string;
    };

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of json.content) {
      if (block.type === 'text' && block.text) text += block.text;
      if (block.type === 'tool_use' && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        });
      }
    }

    let structured: unknown;
    if (request.responseSchema && text) {
      structured = tryParseJson(text);
    }

    return {
      text,
      toolCalls,
      structured,
      usage: { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens },
      model: this.model,
      provider: this.name,
      stopReason: json.stop_reason,
    };
  }
}

/* ------------------------------- Local ------------------------------------ */

/**
 * Deterministic offline provider.
 *
 * It reads the user's message, matches it against a small intent table, and
 * emits the corresponding tool call. When tool results are already present in
 * the conversation it renders them into a readable answer.
 *
 * This is honest about what it is: no invented facts, no pretend reasoning.
 * If it cannot match an intent it says so and suggests what it can do.
 */
class LocalProvider implements AiProvider {
  readonly name = 'local';
  readonly model = 'campusos-offline-v1';
  readonly isLanguageModel = false;

  async complete(request: AiCompletionRequest): Promise<AiCompletionResponse> {
    const last = [...request.messages].reverse().find((m) => m.role === 'user');
    const query = (last?.content ?? '').toLowerCase();
    const available = new Set((request.tools ?? []).map((t) => t.name));

    // If the conversation already carries tool output, summarise it.
    const toolOutput = request.messages.find((m) => m.content.startsWith('[TOOL_RESULTS]'));
    if (toolOutput) {
      return this.respond(renderToolResults(toolOutput.content), []);
    }

    /**
     * Intent table, most specific first. Patterns use stems without a trailing
     * word boundary so that inflections match too ("underutilised",
     * "utilisation", "conflicting"). Order matters: room *utilisation* must be
     * tested before the generic "room" availability pattern.
     */
    const intents: { match: RegExp; tool: string; input?: Record<string, unknown> }[] = [
      { match: /(underutilis|underutiliz|under-utilis|under-utiliz|utilisation|utilization|room usage|empty room|unused room)/, tool: 'get_room_utilization' },
      { match: /(conflict|clash|double.?book|overlap)/, tool: 'find_schedule_conflicts' },
      { match: /(workload|teaching hour|overload|contracted)/, tool: 'analyze_workload' },
      { match: /(grievance|complaint|\bcase\b|readdressal|\bsla\b|escalat)/, tool: 'get_grievances' },
      { match: /(attendance|\bpresent\b|\babsent\b|shortage|at risk)/, tool: 'get_attendance' },
      { match: /(assignment|submission|\bdue\b|deadline|homework|grading)/, tool: 'get_assignments' },
      { match: /(skill|career|employab|\bgap\b|readiness)/, tool: 'get_skill_profile' },
      { match: /(resource|notes|material|slides|question bank)/, tool: 'search_resources' },
      { match: /(announce|notice|circular|acknowledg)/, tool: 'get_announcements' },
      { match: /(chang|moved|cancel|why did|what.s new)/, tool: 'get_recent_changes' },
      { match: /(free room|available room|book a room|which room)/, tool: 'get_room_availability' },
      { match: /(tomorrow|today|next class|schedule|timetable|\bclasses\b|\blecture)/, tool: 'get_schedule' },
    ];

    for (const intent of intents) {
      if (intent.match.test(query) && available.has(intent.tool)) {
        return this.respond('', [
          { id: `local_${Date.now()}`, name: intent.tool, input: intent.input ?? {} },
        ]);
      }
    }

    const toolList = (request.tools ?? [])
      .slice(0, 6)
      .map((t) => `• ${describeTool(t.name)}`)
      .join('\n');

    return this.respond(
      `I could not match that to something I can look up.\n\nThis deployment is running the **offline assistant** (no language-model API key is configured), so I answer only from your institution's records using a fixed set of lookups.\n\nHere is what I can do right now:\n${toolList}\n\nTry asking about your schedule, attendance, assignments, or recent changes.`,
      [],
    );
  }

  private respond(text: string, toolCalls: ToolCall[]): AiCompletionResponse {
    return {
      text,
      toolCalls,
      usage: { inputTokens: 0, outputTokens: 0 },
      model: this.model,
      provider: this.name,
      stopReason: toolCalls.length ? 'tool_use' : 'end_turn',
    };
  }
}

function describeTool(name: string): string {
  const map: Record<string, string> = {
    get_schedule: 'Show your timetable for a day or the week',
    get_attendance: 'Report your attendance, including subjects at risk',
    get_assignments: 'List assignments and their deadlines',
    get_recent_changes: 'Explain what changed recently and why',
    find_schedule_conflicts: 'Scan the timetable for clashes',
    get_room_utilization: 'Report how heavily rooms are used',
    analyze_workload: 'Compare faculty workload against the department average',
    get_grievances: 'Show readdressal cases and SLA status',
    get_skill_profile: 'Show your skill profile and gap to a target role',
    search_resources: 'Search the institution’s academic resources',
    get_announcements: 'Show notices addressed to you',
    get_room_availability: 'Find free rooms in a period',
  };
  return map[name] ?? name;
}

/**
 * Renders tool output as readable prose.
 *
 * The offline provider has no language model, so formatting happens here — one
 * formatter per tool. It states plainly what the data shows and nothing more;
 * it never extrapolates beyond the returned rows.
 */
function renderToolResults(raw: string): string {
  let payload: { tool: string; result: Record<string, unknown> }[];
  try {
    payload = JSON.parse(raw.replace('[TOOL_RESULTS]', '').trim());
  } catch {
    return raw.replace('[TOOL_RESULTS]', '').trim();
  }

  const sections = payload.map(({ tool, result }) => format(tool, result ?? {}));
  return sections.join('\n\n');
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A negative remaining-hours figure means the deadline has already passed. */
function slaLabel(c: any): string {
  if (c.slaBreached) return ' — PAST DEADLINE';
  if (c.slaHoursRemaining === null || c.slaHoursRemaining === undefined) return '';
  const h = Number(c.slaHoursRemaining);
  if (h < 0) return ` — overdue by ${Math.abs(h)}h`;
  if (h < 24) return ` — ${h}h left`;
  return ` — ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'} left`;
}

function format(tool: string, r: any): string {
  const n = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

  switch (tool) {
    case 'get_room_utilization': {
      const rooms: any[] = r.rooms ?? [];
      if (rooms.length === 0) return 'No rooms are recorded.';
      const under = (r.underusedRooms ?? []) as any[];
      const lines = [
        `Overall room utilisation is ${r.overallUtilizationPercent}% across ${rooms.length} rooms and ${r.totalTeachingSlots} teaching periods a week.`,
      ];
      if (under.length > 0) {
        lines.push(
          `Under 40% utilisation: ${under.map((u) => `${u.code} (${u.utilizationPercent}%)`).join(', ')}.`,
        );
      } else {
        lines.push('No room is below 40% utilisation.');
      }
      const busiest = [...rooms].sort((a, b) => n(b.utilizationPercent) - n(a.utilizationPercent))[0];
      if (busiest) lines.push(`Busiest is ${busiest.code} at ${busiest.utilizationPercent}%.`);
      if (r.consolidationHint) lines.push(String(r.consolidationHint));
      return lines.join('\n');
    }

    case 'find_schedule_conflicts': {
      if (r.note) return String(r.note);
      const total = n(r.total);
      if (total === 0) return 'No conflicts. Every room, faculty member and section is clash-free in the published timetable.';
      const items: any[] = r.conflicts ?? [];
      return [
        `${total} conflict${total === 1 ? '' : 's'} in the published timetable:`,
        ...items.slice(0, 8).map((c) => `• ${c.message} (${c.timeLabel}, ${c.affectedStudents} students affected)`),
      ].join('\n');
    }

    case 'analyze_workload': {
      const faculty: any[] = r.faculty ?? [];
      if (faculty.length === 0) return 'No workload records have been computed yet.';
      if (faculty.length === 1) {
        const f = faculty[0];
        return [
          `${f.name} is at ${f.totalHoursPerWeek} hours a week (${f.status.toLowerCase()}).`,
          `Teaching ${f.breakdown.teaching}, labs ${f.breakdown.lab}, assessment ${f.breakdown.assessment}, administrative ${f.breakdown.administrative}.`,
          f.departmentAverage !== null ? `The department average is ${f.departmentAverage} hours.` : '',
        ].filter(Boolean).join('\n');
      }
      const over = faculty.filter((f) => f.status === 'HIGH' || f.status === 'CRITICAL');
      const lines = [`${faculty.length} faculty have workload records.`];
      if (over.length === 0) {
        lines.push('Nobody is above their contracted load.');
      } else {
        lines.push(`${over.length} above contracted load:`);
        over.slice(0, 8).forEach((f) =>
          lines.push(`• ${f.name} — ${f.totalHoursPerWeek} hrs/week (${Math.round(n(f.utilisationPercent))}% of contract, dept avg ${f.departmentAverage ?? 'n/a'})`),
        );
      }
      return lines.join('\n');
    }

    case 'get_schedule': {
      const classes: any[] = r.classes ?? [];
      if (classes.length === 0) return `Nothing is scheduled for ${r.scope === 'week' ? 'this week' : String(r.scope).toLowerCase()}.`;
      const byDay = new Map<string, any[]>();
      for (const c of classes) {
        const list = byDay.get(c.day) ?? [];
        list.push(c);
        byDay.set(c.day, list);
      }
      const out: string[] = [];
      for (const [day, list] of byDay) {
        out.push(`${day.charAt(0)}${day.slice(1).toLowerCase()}:`);
        list.forEach((c) =>
          out.push(`• ${c.time} — ${c.subject} (${c.section}) in ${c.room}${c.faculty ? ` with ${c.faculty}` : ''}`),
        );
      }
      return out.join('\n');
    }

    case 'get_attendance': {
      if (r.error) return String(r.error);
      const subjects: any[] = r.subjects ?? [];
      if (subjects.length === 0) return 'No attendance has been recorded yet.';
      const lines = [`Your overall attendance is ${r.overallPercentage}% (the requirement is ${r.requiredMinimum}%).`];
      const below = subjects.filter((s) => s.belowRequirement);
      if (below.length > 0) {
        lines.push(`Below the requirement in ${below.length} subject${below.length === 1 ? '' : 's'}:`);
        below.forEach((s) => lines.push(`• ${s.subject} — ${s.percentage}% (${s.attended} of ${s.held})`));
      } else {
        lines.push('You are above the requirement in every subject.');
      }
      const tight = subjects.filter((s) => !s.belowRequirement && n(s.canStillMiss) <= 2);
      tight.forEach((s) => lines.push(`• ${s.subject}: you can miss only ${s.canStillMiss} more class${n(s.canStillMiss) === 1 ? '' : 'es'}.`));
      return lines.join('\n');
    }

    case 'get_assignments': {
      const items: any[] = r.assignments ?? [];
      if (items.length === 0) return 'There are no assignments to show.';
      return [
        `${items.length} assignment${items.length === 1 ? '' : 's'}:`,
        ...items.slice(0, 12).map((a) => {
          const due = a.dueAt ? new Date(a.dueAt).toDateString() : 'no deadline';
          if (a.pending !== undefined) return `• ${a.title} (${a.subjectCode} ${a.sectionCode}) — ${a.pending} of ${a.total} awaiting evaluation, due ${due}`;
          return `• ${a.title} (${a.subject}) — ${String(a.status).toLowerCase().replace('_', ' ')}, due ${due}`;
        }),
      ].join('\n');
    }

    case 'get_recent_changes': {
      const changes: any[] = r.changes ?? [];
      if (changes.length === 0) return 'Nothing has changed recently that affects you.';
      return [
        `${changes.length} recent change${changes.length === 1 ? '' : 's'}:`,
        ...changes.slice(0, 10).map((c) => `• ${c.title} — ${c.change}${c.reason ? ` (reason: ${c.reason})` : ''}, changed by ${c.changedBy}`),
      ].join('\n');
    }

    case 'get_grievances': {
      const cases: any[] = r.cases ?? [];
      if (cases.length === 0) return 'There are no cases to show.';
      const breached = cases.filter((c) => c.slaBreached);
      const lines = [`${cases.length} case${cases.length === 1 ? '' : 's'}:`];
      cases.slice(0, 10).forEach((c) =>
        lines.push(
          `• ${c.caseNumber} — ${c.subject} (${c.category}, ${String(c.status).toLowerCase().replace('_', ' ')})${
            slaLabel(c)
          }`,
        ),
      );
      const overdue = cases.filter((c) => c.slaBreached || (c.slaHoursRemaining !== null && n(c.slaHoursRemaining) < 0));
      if (overdue.length > 0) {
        lines.push(`${overdue.length} of these are past their resolution deadline.`);
      }
      return lines.join('\n');
    }

    case 'get_skill_profile': {
      if (r.error) return String(r.error);
      const lines: string[] = [];
      const strongest: any[] = r.strongest ?? [];
      if (strongest.length) {
        lines.push(`Strongest skills: ${strongest.map((s) => `${s.skill} (${s.proficiency}%)`).join(', ')}.`);
      }
      if (r.careerGoal) {
        const g = r.careerGoal;
        lines.push(`Target role: ${g.title}. Readiness ${g.readiness}%, meeting ${g.metRequirements} of ${g.totalRequirements} requirements.`);
        const gaps = (g.gaps ?? []).filter((x: any) => n(x.gap) > 0).slice(0, 5);
        if (gaps.length) {
          lines.push('Largest gaps:');
          gaps.forEach((x: any) => lines.push(`• ${x.skill} — at ${x.current}%, needs ${x.required}%`));
        } else {
          lines.push('You meet every recorded requirement for this role.');
        }
      } else {
        lines.push('No career goal is set, so no gap analysis is available.');
      }
      return lines.join('\n');
    }

    case 'search_resources': {
      const results: any[] = r.results ?? [];
      if (results.length === 0) return r.note ? String(r.note) : `Nothing matched “${r.query}”.`;
      return [
        `${results.length} resource${results.length === 1 ? '' : 's'} matched “${r.query}”:`,
        ...results.map((x) => `• ${x.title}${x.subject ? ` (${x.subject})` : ''} — ${x.type.toLowerCase()}`),
      ].join('\n');
    }

    case 'get_announcements': {
      const notices: any[] = r.notices ?? [];
      if (notices.length === 0) return 'You have no notices.';
      const pending = notices.filter((x) => x.acknowledgementOutstanding);
      const lines = [`${notices.length} notice${notices.length === 1 ? '' : 's'}:`];
      notices.slice(0, 8).forEach((x) =>
        lines.push(`• ${x.title} (${String(x.priority).toLowerCase()})${x.acknowledgementOutstanding ? ' — needs your acknowledgement' : ''}`),
      );
      if (pending.length > 0) lines.push(`${pending.length} still need${pending.length === 1 ? 's' : ''} your acknowledgement.`);
      return lines.join('\n');
    }

    case 'get_room_availability': {
      const free: any[] = r.freeRooms ?? [];
      if (r.note) return String(r.note);
      if (free.length === 0) return 'No rooms are free in that period.';
      return [
        `${free.length} room${free.length === 1 ? '' : 's'} free${r.day !== 'any' ? ` on ${String(r.day).toLowerCase()}` : ''}${r.period !== 'any' ? `, period ${r.period}` : ''}:`,
        ...free.slice(0, 12).map((x) => `• ${x.code} — ${String(x.type).toLowerCase()}, seats ${x.capacity}`),
      ].join('\n');
    }

    case 'get_at_risk_students': {
      const students: any[] = r.students ?? [];
      if (students.length === 0) return 'No students are below the attendance requirement.';
      return [
        `${r.count} student record${n(r.count) === 1 ? '' : 's'} below the attendance requirement:`,
        ...students.slice(0, 15).map((s) => `• ${s.name} (${s.rollNumber}, ${s.section}) — ${s.subject} at ${s.attendance}% (${s.attended}/${s.held})`),
      ].join('\n');
    }

    default: {
      if (r.error) return String(r.error);
      return JSON.stringify(r, null, 2);
    }
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function tryParseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/* ------------------------------ selection --------------------------------- */

let cached: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  if (cached) return cached;

  const configured = (process.env.AI_PROVIDER ?? 'local').toLowerCase();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (configured === 'anthropic') {
    if (!apiKey) {
      // Fail visibly in logs but keep the product working.
      console.warn(
        '[campusos:ai] AI_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty — falling back to the offline provider.',
      );
      cached = new LocalProvider();
      return cached;
    }
    cached = new AnthropicProvider(apiKey);
    return cached;
  }

  cached = new LocalProvider();
  return cached;
}

/** Test seam. */
export function __setAiProvider(provider: AiProvider | null) {
  cached = provider;
}

export { AnthropicProvider, LocalProvider };
