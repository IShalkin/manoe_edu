/**
 * Profiler Agent
 * 
 * Creates deep character profiles with psychology and arcs.
 * Active in: Characters, Narrator Design phases
 * 
 * EDUCATIONAL NOTE: Error Handling in LLM-Based Agents
 * =====================================================
 * 
 * This agent demonstrates several important patterns for production LLM applications:
 * 
 * 1. GRACEFUL VALIDATION FAILURE HANDLING
 *    When LLM output doesn't match our schema, we have options:
 *    - Strict: Throw error and stop (bad UX, wastes LLM call)
 *    - Lenient: Log warning and continue with raw data (better UX)
 *    - Retry: Ask LLM to fix its output (expensive, slow)
 *    
 *    This agent uses the lenient approach with try/catch around validation.
 * 
 * 2. DETAILED LOGGING FOR DEBUGGING
 *    LLM applications are notoriously hard to debug because:
 *    - Outputs are non-deterministic
 *    - Errors can happen at multiple stages (parsing, validation, storage)
 *    - Issues may only appear with certain inputs
 *    
 *    We log at each step: LLM response → JSON parsing → validation → emission
 * 
 * 3. EVENT EMISSION FOR REAL-TIME UI
 *    The agent emits events via Redis Streams for the frontend to display:
 *    - emitThought(): Status updates ("Analyzing characters...")
 *    - emitMessage(): Actual generated content for display
 *    
 *    This enables "Cinematic UI" where users see agent progress in real-time.
 * 
 * 4. PHASE-BASED BEHAVIOR
 *    The same agent can behave differently based on the generation phase.
 *    This allows code reuse while supporting different workflows.
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { CharactersArraySchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class ProfilerAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.PROFILER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Emit thought for Cinematic UI
    if (phase === GenerationPhase.CHARACTERS) {
      await this.emitThought(runId, "Analyzing character psychology and motivations...", "neutral");
    } else if (phase === GenerationPhase.NARRATOR_DESIGN) {
      await this.emitThought(runId, "Designing narrative voice and perspective...", "neutral");
    }

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    // EDUCATIONAL NOTE: Detailed Logging for LLM Debugging
    // Each log statement helps trace where issues occur in the pipeline
    console.log(`[profiler] LLM response received, length: ${response.length}, runId: ${runId}`);

    if (phase === GenerationPhase.CHARACTERS) {
      console.log(`[profiler] Parsing JSON array from response, runId: ${runId}`);
      const parsed = this.parseJSONArray(response);
      console.log(`[profiler] Parsed ${Array.isArray(parsed) ? parsed.length : 0} characters, runId: ${runId}`);
      
      // EDUCATIONAL NOTE: Graceful Validation with Try/Catch
      // =====================================================
      // Instead of letting validation errors crash the pipeline,
      // we catch them and continue with the raw parsed data.
      // This is the "lenient" approach - better UX at the cost of
      // potentially malformed data. The alternative would be to
      // retry the LLM call with a more specific prompt.
      try {
        const validated = this.validateOutput(parsed, CharactersArraySchema, runId);
        console.log(`[profiler] Validation passed, emitting message, runId: ${runId}`);
        // Emit the actual generated content for the frontend to display
        await this.emitMessage(runId, { characters: validated }, phase);
        console.log(`[profiler] Message emitted, emitting thought, runId: ${runId}`);
        await this.emitThought(runId, "Character profiles complete. Ready for worldbuilding.", "neutral", AgentType.WORLDBUILDER);
        console.log(`[profiler] Thought emitted, returning content, runId: ${runId}`);
        return { content: validated as Record<string, unknown>[] };
      } catch (validationError) {
        // EDUCATIONAL NOTE: Graceful Degradation
        // When validation fails, we log the error but continue with raw data.
        // This prevents the entire generation from failing due to minor
        // schema mismatches (e.g., LLM returned "Protagonist" instead of "protagonist")
        console.error(`[profiler] Validation failed:`, validationError);
        console.log(`[profiler] Emitting raw content without validation, runId: ${runId}`);
        await this.emitMessage(runId, { characters: parsed }, phase);
        await this.emitThought(runId, "Character profiles complete (validation skipped). Ready for worldbuilding.", "neutral", AgentType.WORLDBUILDER);
        return { content: parsed as Record<string, unknown>[] };
      }
    }

    // For NARRATOR_DESIGN, return as-is (simple object)
    const content = this.parseJSON(response);
    // Emit the actual generated content for the frontend to display
    await this.emitMessage(runId, content as Record<string, unknown>, phase);
    return { content: content as Record<string, unknown> };
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.PROFILER;
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
    };

    if (this.langfuse.isEnabled) {
      try {
        return await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: ${variables.narrative || "No narrative yet"}`;
  }

  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    if (phase === GenerationPhase.CHARACTERS) {
      return `Based on the narrative concept, create detailed character profiles.

For each character include:
1. Name and role (protagonist, antagonist, supporting)
2. Archetype and subversion
3. Core motivation and desire
4. Psychological wound and inner trap
5. Character arc trajectory
6. Backstory highlights
7. Visual signature and mannerisms
8. Voice and speech patterns
9. Relationships to other characters

Create at least 3-5 main characters.
Output as JSON array with character objects.`;
    }

    if (phase === GenerationPhase.NARRATOR_DESIGN) {
      return `Design the narrative voice and perspective for the story.

Output as JSON with fields: voice, perspective, tone, style.`;
    }

    throw new Error(`ProfilerAgent not configured for phase: ${phase}`);
  }
}

