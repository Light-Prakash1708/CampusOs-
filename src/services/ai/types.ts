/**
 * AI SERVICE LAYER — contracts
 * ---------------------------------------------------------------------------
 * All model access in CampusOS goes through this layer. No component or route
 * calls a model API directly. That gives us one place to enforce:
 *
 *   - grounding (answers must come from tool results, not model memory)
 *   - role-aware tool permissions
 *   - prompt-injection defence
 *   - token accounting and budget ceilings
 *   - provider swapping
 *
 * The `local` provider implements the same interface deterministically, so the
 * entire product works with no API key configured. It is clearly labelled in
 * the UI as the offline assistant — we never pretend it is a frontier model.
 */

export type AiFeature =
  | 'CAMPUS_ASSISTANT'
  | 'TEACHER_COPILOT'
  | 'STUDENT_ASSISTANT'
  | 'TIMETABLE_NL'
  | 'RESOURCE_GENERATION'
  | 'SKILL_GAP'
  | 'COMMUNICATION_DRAFT'
  | 'GRIEVANCE_CLASSIFY'
  | 'ANALYTICS_EXPLAIN'
  | 'ASSIGNMENT_ANALYSIS';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** A tool the model may call. Execution is always server-side and permission-checked. */
export interface AiTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Capability the caller must hold for this tool to be offered at all. */
  requiredPermission?: string;
  /**
   * True when the tool changes state. Mutating tools NEVER execute directly:
   * they produce an ai_actions proposal that a human approves.
   */
  mutating?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  /** Structured payload returned to the model. */
  content: unknown;
  /** Records used, surfaced to the user as citations. */
  citations?: Citation[];
  isError?: boolean;
}

export interface Citation {
  type: string;
  id?: string;
  label: string;
  href?: string;
}

export interface AiCompletionRequest {
  feature: AiFeature;
  system: string;
  messages: AiMessage[];
  tools?: AiTool[];
  maxTokens?: number;
  temperature?: number;
  /** When set, the provider must return JSON matching this schema. */
  responseSchema?: Record<string, unknown>;
}

export interface AiCompletionResponse {
  text: string;
  toolCalls: ToolCall[];
  /** Parsed object when responseSchema was supplied. */
  structured?: unknown;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
  stopReason: string;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** True when this provider is a real language model rather than the offline fallback. */
  readonly isLanguageModel: boolean;
  complete(request: AiCompletionRequest): Promise<AiCompletionResponse>;
}
