/**
 * ============================================================================
 * LANGFUSE SERVICE
 * ============================================================================
 * 
 * This service provides LLM OBSERVABILITY using Langfuse, enabling you to
 * trace, debug, and optimize AI agent interactions. Think of it as "DevTools
 * for LLMs" - you can see exactly what each agent is doing, how long it takes,
 * and how much it costs.
 * 
 * WHAT IS LANGFUSE?
 * -----------------
 * Langfuse is an open-source LLM observability platform that provides:
 *   - TRACING: See the full execution path of multi-agent workflows
 *   - PROMPT MANAGEMENT: Store and version prompts in a dashboard
 *   - COST TRACKING: Monitor API costs per run/agent
 *   - LATENCY MONITORING: Identify slow agents or API calls
 *   - EVALUATION: Score outputs for quality assessment
 * 
 * WHY OBSERVABILITY MATTERS:
 * --------------------------
 * In a multi-agent system like MANOE, debugging is HARD:
 *   - 9 agents making dozens of LLM calls
 *   - Complex dependencies between phases
 *   - Non-deterministic outputs
 * 
 * Langfuse helps by showing:
 *   - Which agent made which call
 *   - What prompts were sent
 *   - What responses came back
 *   - How long each step took
 *   - How much each run cost
 * 
 * TRACING HIERARCHY:
 * ------------------
 * 
 *   TRACE (one per generation run)
 *     └── SPAN (one per phase)
 *           └── GENERATION (one per LLM call)
 * 
 * Example:
 *   Trace: "MANOE Generation - Run abc123"
 *     ├── Span: "Genesis Phase"
 *     │     └── Generation: "Architect - gpt-4"
 *     ├── Span: "Characters Phase"
 *     │     └── Generation: "Profiler - claude-3"
 *     └── Span: "Drafting Phase"
 *           ├── Generation: "Writer - gpt-4" (draft)
 *           ├── Generation: "Critic - claude-3" (critique)
 *           └── Generation: "Writer - gpt-4" (revision)
 * 
 * PROMPT MANAGEMENT:
 * ------------------
 * Instead of hardcoding prompts in code, store them in Langfuse dashboard:
 * 
 *   1. CREATE: Add prompt "manoe-architect-v1" in Langfuse UI
 *   2. TAG: Add "production" label to the active version
 *   3. FETCH: Code calls getPrompt("manoe-architect-v1", { label: "production" })
 *   4. UPDATE: Create new version in UI, move "production" tag
 * 
 * Benefits:
 *   - Change prompts without code deployments
 *   - A/B test different prompt versions
 *   - Track which prompt version produced which output
 *   - Rollback to previous versions easily
 * 
 * CACHING:
 * --------
 * Prompts are cached for 5 minutes (PROMPT_CACHE_TTL_MS) to reduce latency.
 * Each prompt fetch adds 200-500ms latency, so caching is important for
 * performance. Cache is automatically invalidated after TTL expires.
 * 
 * USAGE EXAMPLE:
 * --------------
 *   // Start a trace for a generation run
 *   const traceId = langfuse.startTrace({
 *     projectId: "proj_123",
 *     runId: "run_456",
 *     phase: GenerationPhase.GENESIS,
 *   });
 * 
 *   // Track an LLM call
 *   langfuse.trackLLMCall(runId, "Architect", input, response);
 * 
 *   // Get a managed prompt
 *   const prompt = await langfuse.getCompiledPrompt(
 *     "manoe-architect-v1",
 *     { seedIdea: "A story about dragons" },
 *     { label: "production", fallback: "Default prompt..." }
 *   );
 * 
 *   // End the trace
 *   langfuse.endTrace(runId, { output: finalResult });
 * 
 * SELF-HOSTED:
 * ------------
 * MANOE uses a self-hosted Langfuse instance at https://langfuse.iliashalkin.com
 * This provides full control over data and avoids vendor lock-in.
 * 
 * @see StorytellerOrchestrator.ts for how tracing is integrated
 * @see BaseAgent.ts for how agents track their LLM calls
 */

import { Service } from "@tsed/di";
import { Langfuse } from "langfuse";
import { LLMProvider, LLMResponse, GenerationPhase } from "../models/LLMModels";

/**
 * Trace metadata
 */
export interface TraceMetadata {
  projectId: string;
  runId: string;
  phase: GenerationPhase;
  agentName?: string;
  userId?: string;
}

/**
 * Generation metadata for tracking
 */
export interface GenerationMetadata {
  traceId: string;
  spanId?: string;
  name: string;
  model: string;
  provider: LLMProvider;
  input: unknown;
  output?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Prompt template from Langfuse
 */
export interface PromptTemplate {
  name: string;
  version: number;
  prompt: string;
  config?: Record<string, unknown>;
  labels?: string[];
}

/**
 * Prompt fetch options
 */
export interface PromptFetchOptions {
  version?: number;
  label?: string;
  useCache?: boolean;
}

/**
 * Active trace context
 */
interface TraceContext {
  traceId: string;
  trace: ReturnType<Langfuse["trace"]>;
  spans: Map<string, ReturnType<ReturnType<Langfuse["trace"]>["span"]>>;
}

/**
 * Cached prompt with TTL
 */
interface CachedPrompt {
  template: PromptTemplate;
  cachedAt: number;
}

@Service()
export class LangfuseService {
  private client: Langfuse | null = null;
  private activeTraces: Map<string, TraceContext> = new Map();
  private promptCache: Map<string, CachedPrompt> = new Map();

  /**
   * Prompt cache TTL in milliseconds (5 minutes)
   * Reduces latency by avoiding API calls on every request
   */
  private readonly PROMPT_CACHE_TTL_MS = 5 * 60 * 1000;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Langfuse client
   */
  private initialize(): void {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_HOST || "https://langfuse.iliashalkin.com";

    if (!publicKey || !secretKey) {
      console.warn("Langfuse: Missing API keys, tracing disabled");
      return;
    }

    this.client = new Langfuse({
      publicKey,
      secretKey,
      baseUrl,
    });

    console.log(`Langfuse connected to ${baseUrl}`);
  }

  /**
   * Check if Langfuse is enabled
   */
  get isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Start a new trace for a generation run
   * 
   * @param metadata - Trace metadata including projectId, runId, phase
   * @returns Trace ID
   */
  startTrace(metadata: TraceMetadata): string {
    if (!this.client) return metadata.runId;

    const trace = this.client.trace({
      id: metadata.runId,
      name: `MANOE Generation - ${metadata.phase}`,
      metadata: {
        projectId: metadata.projectId,
        phase: metadata.phase,
        agentName: metadata.agentName,
      },
      userId: metadata.userId,
      tags: ["manoe", metadata.phase],
    });

    this.activeTraces.set(metadata.runId, {
      traceId: metadata.runId,
      trace,
      spans: new Map(),
    });

    return metadata.runId;
  }

  /**
   * Start a span within a trace (for nested operations)
   * 
   * @param runId - The run/trace ID
   * @param spanName - Name of the span
   * @param metadata - Additional metadata
   * @returns Span ID
   */
  startSpan(
    runId: string,
    spanName: string,
    metadata?: Record<string, unknown>
  ): string {
    const context = this.activeTraces.get(runId);
    if (!context) return `${runId}-${spanName}`;

    const spanId = `${runId}-${spanName}-${Date.now()}`;
    const span = context.trace.span({
      name: spanName,
      metadata,
    });

    context.spans.set(spanId, span);
    return spanId;
  }

  /**
   * End a span
   * 
   * @param runId - The run/trace ID
   * @param spanId - The span ID to end
   * @param output - Output data
   */
  endSpan(
    runId: string,
    spanId: string,
    output?: Record<string, unknown>
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    const span = context.spans.get(spanId);
    if (span) {
      span.end({ output });
      context.spans.delete(spanId);
    }
  }

  /**
   * Track an LLM generation
   * 
   * @param metadata - Generation metadata
   */
  trackGeneration(metadata: GenerationMetadata): void {
    const context = this.activeTraces.get(metadata.traceId);
    if (!context) return;

    const parent = metadata.spanId 
      ? context.spans.get(metadata.spanId) 
      : context.trace;

    if (!parent) return;

    parent.generation({
      name: metadata.name,
      model: metadata.model,
      modelParameters: {
        provider: metadata.provider,
      },
      input: metadata.input,
      output: metadata.output,
      usage: metadata.usage ? {
        promptTokens: metadata.usage.promptTokens,
        completionTokens: metadata.usage.completionTokens,
        totalTokens: metadata.usage.totalTokens,
      } : undefined,
      metadata: {
        ...metadata.metadata,
        latencyMs: metadata.latencyMs,
      },
    });
  }

  /**
   * Track an LLM response (convenience method)
   * 
   * @param runId - The run/trace ID
   * @param agentName - Name of the agent making the call
   * @param input - Input messages/prompt
   * @param response - LLM response
   * @param spanId - Optional parent span ID
   */
  trackLLMCall(
    runId: string,
    agentName: string,
    input: unknown,
    response: LLMResponse,
    spanId?: string
  ): void {
    this.trackGeneration({
      traceId: runId,
      spanId,
      name: `${agentName} - ${response.model}`,
      model: response.model,
      provider: response.provider,
      input,
      output: response.content,
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      },
      latencyMs: response.latencyMs,
    });
  }

  /**
   * End a trace
   * 
   * @param runId - The run/trace ID
   * @param output - Final output data
   */
  endTrace(runId: string, output?: Record<string, unknown>): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    // End all remaining spans
    for (const [spanId, span] of context.spans) {
      span.end();
    }

    // Update trace with final output
    context.trace.update({
      output,
    });

    this.activeTraces.delete(runId);
  }

  /**
   * Add an event to a trace
   * 
   * @param runId - The run/trace ID
   * @param eventName - Name of the event
   * @param metadata - Event metadata
   */
  addEvent(
    runId: string,
    eventName: string,
    metadata?: Record<string, unknown>
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    context.trace.event({
      name: eventName,
      metadata,
    });
  }

  /**
   * Score a trace (for quality evaluation)
   * 
   * @param runId - The run/trace ID
   * @param name - Score name (e.g., "quality", "coherence")
   * @param value - Score value (0-1)
   * @param comment - Optional comment
   */
  scoreTrace(
    runId: string,
    name: string,
    value: number,
    comment?: string
  ): void {
    const context = this.activeTraces.get(runId);
    if (!context) return;

    context.trace.score({
      name,
      value,
      comment,
    });
  }

  // ==================== PROMPT MANAGEMENT ====================

  /**
   * Default label for production prompts
   * Use versioned prompts with labels for LLMOps best practices
   */
  private readonly DEFAULT_PROMPT_LABEL = "production";

  /**
   * Get a prompt from Langfuse Prompt Management
   * 
   * Best Practice: Use labels (e.g., "production") instead of version numbers
   * This allows updating prompts in Langfuse dashboard without code changes
   * 
   * @param promptName - Name of the prompt in Langfuse (e.g., "manoe-architect-v1")
   * @param options - Fetch options (version, label, useCache)
   * @returns Prompt template or null if not found
   * 
   * @example
   * // Fetch production-tagged prompt (recommended)
   * const prompt = await langfuse.getPrompt("manoe-architect-v1", { label: "production" });
   * 
   * // Fetch specific version
   * const prompt = await langfuse.getPrompt("manoe-architect-v1", { version: 3 });
   */
  async getPrompt(
    promptName: string,
    options: PromptFetchOptions = {}
  ): Promise<PromptTemplate | null> {
    if (!this.client) {
      console.warn(`Langfuse: Cannot fetch prompt "${promptName}" - client not initialized`);
      return null;
    }

    const { version, label = this.DEFAULT_PROMPT_LABEL, useCache = true } = options;

    // Build cache key based on version or label
    const cacheKey = version 
      ? `${promptName}:v${version}` 
      : `${promptName}:${label}`;

    // Check cache first with TTL validation
    if (useCache && this.promptCache.has(cacheKey)) {
      const cached = this.promptCache.get(cacheKey)!;
      const age = Date.now() - cached.cachedAt;
      
      if (age < this.PROMPT_CACHE_TTL_MS) {
        // Cache hit - saves 200-500ms latency per request
        return cached.template;
      } else {
        // Cache expired - remove stale entry
        this.promptCache.delete(cacheKey);
        console.log(`Langfuse: Cache expired for prompt "${promptName}" (age: ${Math.round(age / 1000)}s)`);
      }
    }

    try {
      // Fetch prompt with version or label
      // If version is specified, use it; otherwise use label
      const prompt = version
        ? await this.client.getPrompt(promptName, version)
        : await this.client.getPrompt(promptName, undefined, { label });
      
      if (!prompt) {
        console.warn(`Langfuse: Prompt "${promptName}" (${version ? `v${version}` : label}) not found`);
        return null;
      }

      const template: PromptTemplate = {
        name: promptName,
        version: prompt.version,
        prompt: prompt.prompt,
        config: prompt.config as Record<string, unknown> | undefined,
        labels: prompt.labels,
      };

      // Cache the prompt with timestamp for TTL
      this.promptCache.set(cacheKey, {
        template,
        cachedAt: Date.now(),
      });

      console.log(`Langfuse: Loaded prompt "${promptName}" v${prompt.version} [${prompt.labels?.join(", ") || "no labels"}] (cached for ${this.PROMPT_CACHE_TTL_MS / 1000}s)`);

      return template;
    } catch (error) {
      console.error(`Langfuse: Error fetching prompt "${promptName}":`, error);
      return null;
    }
  }

  /**
   * Compile a prompt template with variables
   * 
   * @param template - Prompt template string with {{variable}} placeholders
   * @param variables - Variables to substitute
   * @returns Compiled prompt string
   */
  compilePrompt(
    template: string,
    variables: Record<string, string>
  ): string {
    let compiled = template;

    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g");
      compiled = compiled.replace(placeholder, value);
    }

    return compiled;
  }

  /**
   * Get and compile a prompt in one call
   * 
   * Best Practice: Always provide a fallback for resilience
   * 
   * @param promptName - Name of the prompt in Langfuse
   * @param variables - Variables to substitute
   * @param options - Fetch options and fallback
   * @returns Compiled prompt string
   * 
   * @example
   * const prompt = await langfuse.getCompiledPrompt(
   *   "manoe-architect-v1",
   *   { seedIdea: "A story about..." },
   *   { label: "production", fallback: "Default prompt..." }
   * );
   */
  async getCompiledPrompt(
    promptName: string,
    variables: Record<string, string>,
    options: PromptFetchOptions & { fallback?: string } = {}
  ): Promise<string> {
    const { fallback, ...fetchOptions } = options;
    const template = await this.getPrompt(promptName, fetchOptions);

    if (!template) {
      if (fallback) {
        console.warn(`Langfuse: Using fallback for prompt "${promptName}"`);
        return this.compilePrompt(fallback, variables);
      }
      throw new Error(`Prompt "${promptName}" not found and no fallback provided`);
    }

    return this.compilePrompt(template.prompt, variables);
  }

  /**
   * Clear prompt cache
   */
  clearPromptCache(): void {
    this.promptCache.clear();
  }

  /**
   * Flush all pending events to Langfuse
   */
  async flush(): Promise<void> {
    if (this.client) {
      await this.client.flushAsync();
    }
  }

  /**
   * Shutdown Langfuse client
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdownAsync();
      this.client = null;
    }
  }
}

/**
 * Agent prompt names in Langfuse
 * 
 * Naming convention: {project}-{agent}-v{version}
 * Use "production" label in Langfuse dashboard to mark active prompts
 * 
 * LLMOps Best Practice:
 * 1. Create prompt in Langfuse: "manoe-architect-v1"
 * 2. Tag it with "production" label
 * 3. Code fetches by name + label (not version number)
 * 4. To update: create new version, move "production" tag
 */
export const AGENT_PROMPTS = {
  ARCHITECT: "manoe-architect-v1",
  PROFILER: "manoe-profiler-v1",
  WORLDBUILDER: "manoe-worldbuilder-v1",
  STRATEGIST: "manoe-strategist-v1",
  WRITER: "manoe-writer-v1",
  CRITIC: "manoe-critic-v1",
  ORIGINALITY: "manoe-originality-v1",
  IMPACT: "manoe-impact-v1",
  ARCHIVIST: "manoe-archivist-v1",
} as const;

/**
 * Phase prompt names in Langfuse
 * Same naming convention as agent prompts
 */
export const PHASE_PROMPTS = {
  GENESIS: "manoe-phase-genesis-v1",
  CHARACTERS: "manoe-phase-characters-v1",
  NARRATOR_DESIGN: "manoe-phase-narrator-design-v1",
  WORLDBUILDING: "manoe-phase-worldbuilding-v1",
  OUTLINING: "manoe-phase-outlining-v1",
  ADVANCED_PLANNING: "manoe-phase-advanced-planning-v1",
  DRAFTING: "manoe-phase-drafting-v1",
  CRITIQUE: "manoe-phase-critique-v1",
  REVISION: "manoe-phase-revision-v1",
  ORIGINALITY_CHECK: "manoe-phase-originality-check-v1",
  IMPACT_ASSESSMENT: "manoe-phase-impact-assessment-v1",
  POLISH: "manoe-phase-polish-v1",
} as const;
