/**
 * Worldbuilder Agent
 * 
 * Develops setting, geography, cultures, and world rules.
 * Active in: Worldbuilding phase
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { WorldbuildingSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class WorldbuilderAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.WORLDBUILDER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options);

    // Emit thought for Cinematic UI
    await this.emitThought(runId, "Building world rules and establishing setting...", "neutral");

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      GenerationPhase.WORLDBUILDING
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, WorldbuildingSchema, runId);
    return { content: validated as Record<string, unknown> };
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.WORLDBUILDER;
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
      characters: JSON.stringify(context.state.characters || []),
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
    return `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: ${variables.narrative || "No narrative yet"}
Characters: ${variables.characters || "No characters yet"}`;
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
    options: GenerationOptions
  ): string {
    return `Create a rich, detailed world for the story.

Include:
1. Geography and locations (key settings)
2. Time period and technology level
3. Social structures and power dynamics
4. Cultural elements (customs, beliefs, taboos)
5. Economic systems
6. Magic/technology rules (if applicable)
7. History and lore
8. Sensory details (sights, sounds, smells)

Output as JSON with nested objects for each category.`;
  }
}

