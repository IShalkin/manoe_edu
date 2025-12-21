/**
 * ============================================================================
 * ARCHIVIST AGENT
 * ============================================================================
 * 
 * The Archivist is the CONTINUITY KEEPER of MANOE - like a script supervisor
 * on a film set who ensures that the coffee cup is in the same position
 * between takes. In long-form narrative generation, maintaining consistency
 * is CRITICAL and surprisingly difficult.
 * 
 * THE CONTEXT DRIFT PROBLEM:
 * --------------------------
 * In multi-agent systems with revision loops, a dangerous bug can occur:
 * 
 *   Scene 1: "The hero was wounded in the battle, blood seeping from his arm."
 *   Scene 5: "The hero raised both arms triumphantly, uninjured."
 *   
 * This happens because:
 *   1. LLMs have limited context windows
 *   2. Summarization chains may compress away important details
 *   3. Revision loops focus on specific issues, forgetting others
 * 
 * The Archivist SOLVES this by maintaining "Key Constraints" - canonical
 * facts that MUST be preserved across all scenes.
 * 
 * HOW THE ARCHIVIST WORKS:
 * ------------------------
 * 
 *   1. RAW FACTS COLLECTION
 *      As scenes are generated, agents extract "raw facts":
 *      - "Hero was wounded in battle" (Scene 1, from Writer)
 *      - "Villain revealed his true identity" (Scene 3, from Writer)
 *      - "Magic system requires blood sacrifice" (Scene 2, from Worldbuilder)
 * 
 *   2. PERIODIC CONSOLIDATION (Every 3 Scenes)
 *      The Archivist runs and processes raw facts:
 *      - IDENTIFY: Which facts are important enough to be constraints?
 *      - RESOLVE: If facts conflict, which is canonical? (latest wins)
 *      - DISCARD: Remove redundant or irrelevant facts
 *      - GENERATE: Create/update Key Constraints list
 * 
 *   3. KEY CONSTRAINTS OUTPUT
 *      Semantic key-value pairs that are included in all future prompts:
 *      - key: "hero_health_status", value: "Wounded in left arm", scene: 1
 *      - key: "villain_identity", value: "Revealed as king's brother", scene: 3
 * 
 * SEMANTIC KEYS (Important Design Decision):
 * ------------------------------------------
 * We use SEMANTIC KEYS instead of UUIDs for constraint addressing:
 * 
 *   GOOD: key="hero_health_status", value="Wounded"
 *   BAD:  key="constraint_abc123", value="Hero is wounded"
 * 
 * Why? Semantic keys make superseding DETERMINISTIC:
 *   - If Scene 5 says hero is healed, just update "hero_health_status"
 *   - No need for LLM to figure out which UUID supersedes which
 *   - Simpler, more reliable, cheaper
 * 
 * CHAIN OF THOUGHT (CoT) REASONING:
 * ---------------------------------
 * The Archivist's prompt uses CoT to ensure quality reasoning:
 * 
 *   "Process:
 *    1. IDENTIFY new facts that should become constraints
 *    2. RESOLVE conflicts (keep most recent by timestamp)
 *    3. DISCARD irrelevant or redundant facts
 *    4. GENERATE updated constraint list"
 * 
 * The output includes a "reasoning" field explaining decisions:
 *   {
 *     "key": "hero_health_status",
 *     "value": "Healed by magic in Scene 5",
 *     "reasoning": "Supersedes Scene 1 wound - explicitly healed"
 *   }
 * 
 * WHEN THE ARCHIVIST RUNS:
 * ------------------------
 * The Archivist runs ASYNCHRONOUSLY every 3 scenes:
 *   - Scene 1, 2, 3 → Archivist consolidates
 *   - Scene 4, 5, 6 → Archivist consolidates
 *   - etc.
 * 
 * It does NOT block scene generation - it runs in the background
 * and updates constraints for future scenes.
 * 
 * OUTPUT SCHEMA:
 * --------------
 * The Archivist outputs validated JSON:
 *   {
 *     "constraints": [
 *       { "key": "...", "value": "...", "sceneNumber": N, "reasoning": "..." }
 *     ],
 *     "conflicts_resolved": ["Resolved hero health: wound → healed"],
 *     "discarded_facts": ["Redundant: hero has blue eyes (already tracked)"]
 *   }
 * 
 * This is validated against ArchivistOutputSchema using Zod.
 * 
 * @see StorytellerOrchestrator.ts for when Archivist is called
 * @see AgentModels.ts for KeyConstraint and RawFact types
 * @see BaseAgent.ts for inherited functionality
 */

import { AgentType, RawFact, KeyConstraint } from "../models/AgentModels";
import { GenerationPhase } from "../models/LLMModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService, AGENT_PROMPTS } from "../services/LangfuseService";
import { BaseAgent } from "./BaseAgent";
import { AgentContext, AgentOutput, GenerationOptions } from "./types";
import { ArchivistOutputSchema } from "../schemas/AgentSchemas";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";
import { RedisStreamsService } from "../services/RedisStreamsService";

export class ArchivistAgent extends BaseAgent {
  constructor(
    llmProvider: LLMProviderService,
    langfuse: LangfuseService,
    contentGuardrail?: ContentGuardrail,
    consistencyGuardrail?: ConsistencyGuardrail,
    redisStreams?: RedisStreamsService
  ) {
    super(AgentType.ARCHIVIST, llmProvider, langfuse, contentGuardrail, consistencyGuardrail, redisStreams);
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
      GenerationPhase.DRAFTING // Archivist runs during drafting phase
    );

    const parsed = this.parseJSON(response);
    const validated = this.validateOutput(parsed, ArchivistOutputSchema, runId);
    
    // Extract key constraints from response
    const constraints = this.extractConstraints(validated as Record<string, unknown>, state.currentScene);

    return {
      content: validated as Record<string, unknown>,
      rawFacts: constraints.map(c => ({
        fact: `${c.key}: ${c.value}`,
        source: AgentType.ARCHIVIST,
        sceneNumber: c.sceneNumber,
        timestamp: new Date().toISOString(),
      })),
    };
  }

  /**
   * Extract key constraints from Archivist validated response
   */
  private extractConstraints(
    validated: { constraints?: Array<{ key: string; value: string; sceneNumber: number; reasoning?: string }> },
    sceneNumber: number
  ): KeyConstraint[] {
    const constraints: KeyConstraint[] = [];

    if (validated.constraints && Array.isArray(validated.constraints)) {
      for (const constraint of validated.constraints) {
        constraints.push({
          key: constraint.key,
          value: constraint.value,
          source: AgentType.ARCHIVIST,
          sceneNumber: constraint.sceneNumber || sceneNumber,
          timestamp: new Date().toISOString(),
          reasoning: constraint.reasoning,
        });
      }
    }

    return constraints;
  }

  private async getSystemPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): Promise<string> {
    const promptName = AGENT_PROMPTS.ARCHIVIST;

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
    return `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`;
  }

  private buildUserPrompt(
    context: AgentContext,
    options: GenerationOptions
  ): string {
    const state = context.state;
    const upToScene = state.currentScene;
    const rawFacts = state.rawFactsLog.filter(f => f.sceneNumber <= upToScene);
    const existingConstraints = state.keyConstraints;

    return `Process raw facts and generate/update key constraints up to Scene ${upToScene}.

Raw facts collected:
${rawFacts.map(f => `- ${f.fact} (Scene ${f.sceneNumber}, from ${f.source})`).join("\n")}

Existing constraints:
${existingConstraints.map(c => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`).join("\n")}

Process:
1. Identify new facts that should become constraints
2. Resolve conflicts (keep most recent by timestamp)
3. Discard irrelevant or redundant facts
4. Generate updated constraint list

Output JSON with:
- constraints: array of {key, value, sceneNumber, reasoning}
- conflicts_resolved: string[]
- discarded_facts: string[]`;
  }
}

