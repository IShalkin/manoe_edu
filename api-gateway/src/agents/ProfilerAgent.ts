/**
 * Profiler Agent
 * 
 * Creates deep character profiles with psychology and arcs.
 * Active in: Characters, Narrator Design phases
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

    if (phase === GenerationPhase.CHARACTERS) {
      const parsed = this.parseJSONArray(response);
      const validated = this.validateOutput(parsed, CharactersArraySchema, runId);
      return { content: validated as Record<string, unknown>[] };
    }

    // For NARRATOR_DESIGN, return as-is (simple object)
    const content = this.parseJSON(response);
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

