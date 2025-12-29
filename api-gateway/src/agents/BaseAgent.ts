/**
 * Base Agent Class
 * 
 * Abstract base class for all agents in the MANOE system.
 * Provides common functionality for LLM calls, JSON parsing, and Langfuse tracing.
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
   * Emit agent message event with actual generated content
   * This sends the LLM-generated content to the frontend for display in agent cards
   */
  protected async emitMessage(
    runId: string,
    content: string | Record<string, unknown>,
    phase: GenerationPhase
  ): Promise<void> {
    if (this.redisStreams) {
      // Convert content to string if it's an object
      const contentStr = typeof content === "string" ? content : JSON.stringify(content, null, 2);
      // Truncate for logging but send full content
      const logContent = contentStr.length > 200 ? contentStr.substring(0, 200) + "..." : contentStr;
      console.log(`[${this.agentType}] Emitting message:`, logContent, `runId: ${runId}`);
      try {
        const eventId = await this.redisStreams.publishEvent(runId, "agent_message", {
          agent: this.agentType,
          content: contentStr,
          phase,
        });
        console.log(`[${this.agentType}] Published message event with ID:`, eventId);
      } catch (error) {
        console.error(`[${this.agentType}] Error publishing message event:`, error);
      }
    } else {
      console.warn(`[${this.agentType}] RedisStreams not available, cannot emit message`);
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

