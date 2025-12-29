/**
 * Impact Agent
 * 
 * Evaluates emotional resonance and reader engagement.
 * Active in: Impact Assessment phase
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ImpactReportSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class ImpactAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.IMPACT, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options);

    // Emit thought for Cinematic UI
    await this.emitThought(runId, "Evaluating emotional resonance and reader engagement...", "neutral");

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      GenerationPhase.IMPACT_ASSESSMENT
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, ImpactReportSchema, runId);
    
    // Emit the actual generated content for the frontend to display
    await this.emitMessage(runId, validated as Record<string, unknown>, GenerationPhase.IMPACT_ASSESSMENT);
    
    const impactScore = (validated as { impact_score?: number }).impact_score ?? 0;
    if (impactScore >= 8) {
      await this.emitThought(runId, "High emotional impact achieved!", "excited");
    } else if (impactScore >= 5) {
      await this.emitThought(runId, "Moderate impact. Room for improvement.", "neutral");
    } else {
      await this.emitThought(runId, "Low impact detected. Revision recommended.", "concerned");
    }
    
    return { content: validated as Record<string, unknown> };
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.IMPACT;

    if (this.langfuse.isEnabled) {
      try {
        return await this.langfuse.getCompiledPrompt(
          promptName,
          {},
          { fallback: this.getFallbackPrompt() }
        );
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.getFallbackPrompt();
  }

  private getFallbackPrompt(): string {
    return `You are the Impact Assessor, an expert in emotional resonance.
Your role is to evaluate how effectively the prose engages readers emotionally.`;
  }

  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): string {
    const sceneNum = context.state.currentScene;
    const draft = context.state.drafts.get(sceneNum);

    if (!draft) {
      throw new Error(`No draft found for scene ${sceneNum}`);
    }

    return `Assess emotional impact of Scene ${sceneNum}:

${(draft as Record<string, unknown>).content}

Evaluate:
1. Emotional resonance
2. Reader engagement
3. Character connection
4. Tension and stakes
5. Payoff satisfaction

Output JSON with:
- impact_score: number (1-10)
- emotional_beats: string[]
- engagement_level: "high" | "medium" | "low"
- recommendations: string[]`;
  }
}

