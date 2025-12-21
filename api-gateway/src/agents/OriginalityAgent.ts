/**
 * Originality Agent
 * 
 * Detects cliches and ensures narrative uniqueness.
 * Active in: Originality Check phase
 */

import { AgentType } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { OriginalityReportSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class OriginalityAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.ORIGINALITY, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;

    const systemPrompt = await this.getSystemPrompt(context, options);
    const userPrompt = this.buildUserPrompt(context, options);

    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      GenerationPhase.ORIGINALITY_CHECK
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, OriginalityReportSchema, runId);
    return { content: validated as Record<string, unknown> };
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.ORIGINALITY;

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
    return `You are the Originality Checker, a detector of cliches and tropes.
Your role is to identify overused elements and suggest unique alternatives.`;
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

    return `Check Scene ${sceneNum} for originality:

${(draft as Record<string, unknown>).content}

Identify:
1. Cliches and overused tropes
2. Predictable plot elements
3. Generic character moments
4. Unoriginal dialogue patterns

Output JSON with:
- originality_score: number (1-10)
- cliches_found: string[]
- suggestions: string[] (unique alternatives)`;
  }
}

