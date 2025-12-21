/**
 * ============================================================================
 * WRITER AGENT
 * ============================================================================
 * 
 * The Writer is the PROSE CRAFTSMAN of MANOE - the agent that transforms
 * outlines and plans into actual story text. It's like a novelist who takes
 * a screenplay and writes the full novel.
 * 
 * WHEN THE WRITER RUNS:
 * ---------------------
 * The Writer is active in three phases:
 * 
 *   1. DRAFTING PHASE
 *      - Input: Scene outline from Strategist
 *      - Output: First draft of scene prose
 *      - Goal: Create engaging narrative with proper pacing
 * 
 *   2. REVISION PHASE
 *      - Input: Draft + Critic's feedback
 *      - Output: Revised scene addressing issues
 *      - Goal: Improve based on specific critique points
 * 
 *   3. POLISH PHASE
 *      - Input: Approved draft
 *      - Output: Publication-ready prose
 *      - Goal: Final polish for flow, word choice, consistency
 * 
 * THE WRITER↔CRITIC LOOP:
 * -----------------------
 * The Writer works closely with the Critic in a revision loop:
 * 
 *   Writer drafts scene
 *        ↓
 *   Critic evaluates (approved? or needs revision?)
 *        ↓
 *   If needs revision: Writer revises based on feedback
 *        ↓
 *   Critic re-evaluates
 *        ↓
 *   (Maximum 2 iterations to prevent infinite loops)
 * 
 * This mimics the real editorial process where writers and editors
 * collaborate to improve the work.
 * 
 * KEY CONSTRAINTS:
 * ----------------
 * The Writer MUST respect Key Constraints - canonical facts that cannot
 * be violated. These are included in every prompt:
 * 
 *   "KEY CONSTRAINTS (MUST NOT VIOLATE):
 *    - hero_eye_color: Blue (Scene 1)
 *    - villain_motivation: Revenge for brother's death (Scene 2)"
 * 
 * This prevents "context drift" where the Writer might forget that
 * the hero has blue eyes and accidentally describe them as brown.
 * 
 * PROMPT MANAGEMENT:
 * ------------------
 * The Writer's system prompt is fetched from Langfuse:
 *   1. Try to get "manoe-writer-v1" from Langfuse (with "production" label)
 *   2. If unavailable, use hardcoded fallback prompt
 * 
 * This allows prompt tuning without code deployments.
 * 
 * USER PROMPT STRUCTURE:
 * ----------------------
 * The user prompt varies by phase:
 * 
 *   DRAFTING:
 *   "Write Scene 3: 'The Confrontation'
 *    Scene outline: {...}
 *    Requirements: [emotional beat, conflict, sensory details]
 *    KEY CONSTRAINTS: [...]
 *    Write the full scene prose."
 * 
 *   REVISION:
 *   "Revise Scene 3 based on critique feedback.
 *    Original draft: [...]
 *    Critique: [issues, revision requests]
 *    KEY CONSTRAINTS: [...]
 *    Write the revised scene."
 * 
 *   POLISH:
 *   "Polish Scene 3 for final publication quality.
 *    Current draft: [...]
 *    Polish for: [flow, word choice, voice, proofreading]"
 * 
 * GUARDRAILS:
 * -----------
 * The Writer's output is checked by guardrails:
 *   - ContentGuardrail: Ensures appropriate content
 *   - ConsistencyGuardrail: Checks against Key Constraints
 * 
 * Violations are logged to Langfuse for debugging.
 * 
 * CINEMATIC UI:
 * -------------
 * The Writer emits thoughts for the "Glass Brain" UI:
 *   - "Analyzing scene structure and character motivations..."
 *   - "Draft complete. Awaiting Critic's feedback."
 *   - "Revising based on critique feedback..."
 * 
 * This helps users understand what the Writer is doing.
 * 
 * @see CriticAgent.ts for the evaluation partner
 * @see StorytellerOrchestrator.ts for the revision loop implementation
 * @see BaseAgent.ts for inherited functionality
 */

import { AgentType, KeyConstraint } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class WriterAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.WRITER, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
  }

  async execute(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<AgentOutput> {
    const { runId, state } = context;
    const phase = state.phase;

    // Get system prompt from Langfuse or fallback
    const systemPrompt = await this.getSystemPrompt(context, options);

    // Build user prompt based on phase
    const userPrompt = this.buildUserPrompt(context, options, phase);

    // Emit thought for Cinematic UI
    if (phase === GenerationPhase.DRAFTING) {
      await this.emitThought(runId, "Analyzing scene structure and character motivations...", "neutral");
    } else if (phase === GenerationPhase.REVISION) {
      await this.emitThought(runId, "Revising based on critique feedback...", "neutral", AgentType.CRITIC);
    }

    // Call LLM
    const response = await this.callLLM(
      runId,
      systemPrompt,
      userPrompt,
      options.llmConfig,
      phase
    );

    // Apply guardrails for prose content
    if (phase === GenerationPhase.DRAFTING || 
        phase === GenerationPhase.REVISION || 
        phase === GenerationPhase.POLISH) {
      // Apply guardrails
      await this.applyGuardrails(response, state.keyConstraints, runId);
      
      // Emit completion thought
      if (phase === GenerationPhase.DRAFTING) {
        await this.emitThought(runId, "Draft complete. Awaiting Critic's feedback.", "neutral", AgentType.CRITIC);
      }
      
      return { content: response };
    }

    // For other phases, parse as JSON
    const content = this.parseJSON(response);
    return { content: content as Record<string, unknown> };
  }

  /**
   * Get system prompt from Langfuse or fallback
   */
  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.WRITER;
    const constraintsBlock = this.buildConstraintsBlock(context.state.keyConstraints);
    
    const variables: Record<string, string> = {
      narrative: JSON.stringify(context.state.narrative || {}),
      characters: JSON.stringify(context.state.characters || []),
      keyConstraints: constraintsBlock,
    };

    if (this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(variables) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${this.agentType}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(variables);
  }

  /**
   * Get fallback prompt
   */
  private getFallbackPrompt(variables: Record<string, string>): string {
    return `You are the Writer, a skilled prose craftsman.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.
Key Constraints: ${variables.keyConstraints || "No constraints established yet."}`;
  }

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(variables: Record<string, string>): string {
    let prompt = this.getFallbackPrompt(variables);
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }
    return prompt;
  }

  /**
   * Build user prompt based on phase
   */
  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions,
    phase: GenerationPhase
  ): string {
    const state = context.state;
    const constraintsBlock = this.buildConstraintsBlock(state.keyConstraints);

    if (phase === GenerationPhase.DRAFTING) {
      // This will be called from Orchestrator with scene-specific data
      // For now, return a generic prompt structure
      // Orchestrator will pass scene details via metadata
      const sceneNum = state.currentScene;
      const outline = state.outline as Record<string, unknown>;
      const scenes = (outline?.scenes as unknown[]) || [];
      const sceneOutline = scenes[sceneNum - 1] as Record<string, unknown> || {};
      const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);

      return `Write Scene ${sceneNum}: "${sceneTitle}"

Scene outline:
${JSON.stringify(sceneOutline, null, 2)}

Requirements:
- Follow the emotional beat and conflict specified
- Maintain character voices and consistency
- Include sensory details and atmosphere
- End with the specified hook
- Target word count: ${sceneOutline.wordCount ?? 1500} words

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}

Write the full scene prose.`;
    }

    if (phase === GenerationPhase.REVISION) {
      // This will be called from Orchestrator with critique feedback
      const sceneNum = state.currentScene;
      const draft = state.drafts.get(sceneNum);
      const critiques = state.critiques.get(sceneNum) || [];
      const latestCritique = critiques[critiques.length - 1] as Record<string, unknown> || {};

      if (!draft) {
        throw new Error(`No draft found for scene ${sceneNum}`);
      }

      return `Revise Scene ${sceneNum} based on critique feedback.

Original draft:
${(draft as Record<string, unknown>).content}

Critique feedback:
Issues: ${JSON.stringify(latestCritique.issues || [])}
Revision requests: ${JSON.stringify(latestCritique.revisionRequests || [])}

KEY CONSTRAINTS (MUST NOT VIOLATE):
${constraintsBlock}

Write the revised scene, addressing all feedback while maintaining what works.`;
    }

    if (phase === GenerationPhase.POLISH) {
      const sceneNum = state.currentScene;
      const draft = state.drafts.get(sceneNum);

      if (!draft) {
        throw new Error(`No draft found for scene ${sceneNum}`);
      }

      return `Polish Scene ${sceneNum} for final publication quality.

Current draft:
${(draft as Record<string, unknown>).content}

Polish for:
- Sentence flow and rhythm
- Word choice precision
- Consistency in voice
- Final proofreading

Output the polished scene prose.`;
    }

    throw new Error(`WriterAgent not configured for phase: ${phase}`);
  }
}

