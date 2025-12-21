/**
 * ============================================================================
 * BASE AGENT CLASS
 * ============================================================================
 * 
 * This is the FOUNDATION for all AI agents in MANOE. Every specialized agent
 * (Architect, Writer, Critic, etc.) extends this class to inherit common
 * functionality. Think of it as the "DNA" that all agents share.
 * 
 * DESIGN PATTERN: Template Method
 * --------------------------------
 * BaseAgent defines the skeleton of agent operations:
 *   1. Get system prompt (from Langfuse or fallback)
 *   2. Build user prompt (phase-specific)
 *   3. Call LLM with retry logic
 *   4. Parse and validate response
 *   5. Apply guardrails
 *   6. Emit events for UI
 * 
 * Subclasses override execute() to implement specific behavior.
 * 
 * WHAT EACH AGENT INHERITS:
 * -------------------------
 * 
 *   1. callLLM() - Make LLM API calls with automatic retry
 *      - Handles provider selection (OpenAI, Anthropic, etc.)
 *      - Tracks calls in Langfuse for observability
 *      - Applies phase-specific token limits
 * 
 *   2. parseJSON() / parseJSONArray() - Parse LLM responses
 *      - Handles markdown code blocks (```json ... ```)
 *      - Graceful fallback for malformed JSON
 * 
 *   3. validateOutput() - Validate against Zod schemas
 *      - Type-safe output validation
 *      - Logs validation errors to Langfuse
 * 
 *   4. applyGuardrails() - Content safety checks
 *      - ContentGuardrail: Check for inappropriate content
 *      - ConsistencyGuardrail: Check against Key Constraints
 * 
 *   5. emitThought() / emitDialogue() - Cinematic UI events
 *      - "Glass Brain" visualization of agent thinking
 *      - Agent-to-agent communication display
 * 
 * DEPENDENCY INJECTION:
 * ---------------------
 * Agents receive their dependencies via constructor:
 *   - llmProvider: For making LLM API calls
 *   - langfuse: For tracing and prompt management
 *   - contentGuardrail: Optional content safety checker
 *   - consistencyGuardrail: Optional constraint checker
 *   - redisStreams: For emitting real-time events
 * 
 * This makes agents testable (can inject mocks) and flexible.
 * 
 * AGENT TYPES:
 * ------------
 * All 9 agent types extend BaseAgent:
 *   - ARCHITECT: Designs narrative structure
 *   - PROFILER: Creates character profiles
 *   - WORLDBUILDER: Builds world elements
 *   - STRATEGIST: Plans scene structure
 *   - WRITER: Generates prose
 *   - CRITIC: Evaluates and critiques
 *   - ORIGINALITY: Checks for cliches
 *   - IMPACT: Assesses emotional resonance
 *   - ARCHIVIST: Maintains continuity
 * 
 * CINEMATIC UI ("Glass Brain"):
 * -----------------------------
 * The emitThought() and emitDialogue() methods enable a unique UI feature
 * where users can watch agents "think" and "talk" to each other:
 * 
 *   emitThought(runId, "Analyzing character motivations...", "neutral")
 *   → Shows thought bubble above Writer agent
 * 
 *   emitDialogue(runId, AgentType.CRITIC, "This scene needs more tension", "suggestion")
 *   → Shows message arrow from Writer to Critic
 * 
 * This creates an engaging, transparent experience where users understand
 * what the AI is doing at each step.
 * 
 * GUARDRAILS:
 * -----------
 * Two types of guardrails protect output quality:
 * 
 *   1. ContentGuardrail
 *      - Checks for inappropriate/harmful content
 *      - Returns severity levels (low, medium, high)
 *      - Logs violations to Langfuse
 * 
 *   2. ConsistencyGuardrail
 *      - Checks content against Key Constraints
 *      - Prevents "context drift" (forgetting established facts)
 *      - Example: Catches if hero's eye color changes mid-story
 * 
 * @see AgentFactory.ts for how agents are instantiated
 * @see StorytellerOrchestrator.ts for how agents are called
 * @see WriterAgent.ts, CriticAgent.ts, etc. for implementations
 */

import { AgentType, GenerationState, MessageType, KeyConstraint } from "../models/AgentModels";
import { GenerationPhase, ChatMessage, MessageRole, getMaxTokensForPhase, LLMProvider } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { AgentContext, AgentOutput, GenerationOptions, LLMConfiguration } from "./types";
import { z } from "zod";
import { ValidationError } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail, GuardrailResult } from "../guardrails";

/**
 * Abstract base class for all agents
 */
export abstract class BaseAgent {
  protected redisStreams?: RedisStreamsService;

  constructor(
    protected agentType: AgentType,
    protected llmProvider: LLMProviderService,
    protected langfuse: LangfuseService,
    protected contentGuardrail?: ContentGuardrail,
    protected consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    this.redisStreams = redisStreams;
  }

  /**
   * Call LLM with retry logic
   */
  protected async callLLM(
    runId: string,
    systemPrompt: string,
    userPrompt: string,
    llmConfig: LLMConfiguration,
    phase: GenerationPhase
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: MessageRole.SYSTEM, content: systemPrompt },
      { role: MessageRole.USER, content: userPrompt },
    ];

    const spanId = this.langfuse.startSpan(runId, `${this.agentType}_call`, { phase });

    try {
      const response = await this.llmProvider.createCompletionWithRetry({
        messages,
        model: llmConfig.model,
        provider: llmConfig.provider as LLMProvider,
        apiKey: llmConfig.apiKey,
        temperature: llmConfig.temperature ?? 0.7,
        maxTokens: getMaxTokensForPhase(phase),
        responseFormat: userPrompt.includes("Output as JSON") || userPrompt.includes("Output JSON")
          ? { type: "json_object" }
          : undefined,
      });

      // Track in Langfuse
      this.langfuse.trackLLMCall(runId, this.agentType, messages, response, spanId);
      this.langfuse.endSpan(runId, spanId, { content: response.content.substring(0, 500) });

      return response.content;
    } catch (error) {
      this.langfuse.endSpan(runId, spanId, { error: String(error) });
      throw error;
    }
  }

  /**
   * Parse JSON from LLM response
   * Handles markdown code blocks and various JSON formats
   */
  protected parseJSON(response: string): Record<string, unknown> {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(response);
    } catch (error) {
      console.warn(`[${this.agentType}] Failed to parse JSON response:`, error);
      return { raw: response };
    }
  }

  /**
   * Parse JSON array from LLM response
   * Handles various array formats
   */
  protected parseJSONArray(response: string): Record<string, unknown>[] {
    const parsed = this.parseJSON(response);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.characters && Array.isArray(parsed.characters)) {
      return parsed.characters as Record<string, unknown>[];
    }
    return [parsed];
  }

  /**
   * Build constraints block for prompts
   */
  protected buildConstraintsBlock(constraints: { key: string; value: string; sceneNumber: number }[]): string {
    if (constraints.length === 0) {
      return "No constraints established yet.";
    }

    return constraints
      .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
      .join("\n");
  }

  /**
   * Validate output against Zod schema
   * Logs validation errors to Langfuse and throws ValidationError
   */
  protected validateOutput<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    runId: string
  ): T {
    const result = schema.safeParse(data);
    if (!result.success) {
      // Log validation error to Langfuse
      this.langfuse.addEvent(runId, "validation_error", {
        agent: this.agentType,
        errors: result.error.errors,
        data: JSON.stringify(data).substring(0, 500), // Truncate for logging
      });
      throw new ValidationError(result.error, this.agentType);
    }
    return result.data;
  }

  /**
   * Apply guardrails to content
   * Returns array of guardrail results
   */
  protected async applyGuardrails(
    content: string,
    constraints: KeyConstraint[],
    runId: string
  ): Promise<GuardrailResult[]> {
    const results: GuardrailResult[] = [];

    // Apply content guardrail if available
    if (this.contentGuardrail) {
      const contentResult = await this.contentGuardrail.check(content);
      results.push(contentResult);
      
      if (!contentResult.passed) {
        this.langfuse.addEvent(runId, "guardrail_violation", {
          agent: this.agentType,
          type: "content",
          violations: contentResult.violations,
          severity: contentResult.severity,
        });
      }
    }

    // Apply consistency guardrail if available
    if (this.consistencyGuardrail && constraints.length > 0) {
      const consistencyResult = await this.consistencyGuardrail.check(content, constraints);
      results.push(consistencyResult);
      
      if (!consistencyResult.passed) {
        this.langfuse.addEvent(runId, "guardrail_violation", {
          agent: this.agentType,
          type: "consistency",
          violations: consistencyResult.violations,
          severity: consistencyResult.severity,
        });
      }
    }

    return results;
  }

  /**
   * Emit agent thought event (for Cinematic UI)
   */
  protected async emitThought(
    runId: string,
    thought: string,
    sentiment: "neutral" | "agree" | "disagree" | "excited" | "concerned" = "neutral",
    targetAgent?: AgentType
  ): Promise<void> {
    if (this.redisStreams) {
      console.log(`[${this.agentType}] Emitting thought:`, thought, `runId: ${runId}`);
      try {
        const eventId = await this.redisStreams.publishEvent(runId, "agent_thought", {
          agent: this.agentType,
          thought,
          sentiment,
          targetAgent,
        });
        console.log(`[${this.agentType}] Published event with ID:`, eventId);
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing thought event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit thought`);
    }
  }

  /**
   * Emit agent dialogue event (for Cinematic UI)
   */
  protected async emitDialogue(
    runId: string,
    to: AgentType,
    message: string,
    dialogueType: "question" | "objection" | "approval" | "suggestion" = "suggestion"
  ): Promise<void> {
    if (this.redisStreams) {
      console.log(`[${this.agentType}] Emitting dialogue to ${to}:`, message, `runId: ${runId}`);
      try {
        const eventId = await this.redisStreams.publishEvent(runId, "agent_dialogue", {
          from: this.agentType,
          to,
          message,
          dialogueType,
        });
        console.log(`[${this.agentType}] Published dialogue event with ID:`, eventId);
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing dialogue event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit dialogue`);
    }
  }

  /**
   * Abstract method to be implemented by each agent
   */
  abstract execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput>;
}

