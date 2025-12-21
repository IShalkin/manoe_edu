/**
 * ============================================================================
 * LLM PROVIDER MODELS AND TYPES
 * ============================================================================
 * 
 * This file defines the TYPE SYSTEM for LLM (Large Language Model) interactions.
 * It enables BYOK (Bring Your Own Key) support for multiple AI providers.
 * 
 * WHAT'S IN THIS FILE:
 * --------------------
 * 
 *   1. LLM PROVIDERS (LLMProvider enum)
 *      Supported AI providers:
 *      - OPENAI: GPT-4, GPT-5, O1, O3 models
 *      - ANTHROPIC: Claude 3, Claude 4 models
 *      - GEMINI: Google's Gemini Pro, Flash models
 *      - OPENROUTER: Meta-provider for 100+ models
 *      - DEEPSEEK: DeepSeek V3, R1 models
 *      - VENICE: Privacy-focused provider
 * 
 *   2. MESSAGE TYPES (MessageRole, ChatMessage)
 *      Standard chat message format:
 *      - SYSTEM: Instructions for the AI
 *      - USER: User's input/request
 *      - ASSISTANT: AI's response
 * 
 *   3. TOKEN USAGE (TokenUsage class)
 *      Tracks API usage for billing:
 *      - promptTokens: Input tokens
 *      - completionTokens: Output tokens
 *      - totalTokens: Sum of both
 * 
 *   4. LLM RESPONSE (LLMResponse class)
 *      Unified response format from any provider:
 *      - content: Generated text
 *      - model: Model used
 *      - provider: Which provider
 *      - usage: Token counts
 *      - latencyMs: Response time
 * 
 *   5. COMPLETION OPTIONS (CompletionOptions class)
 *      Request parameters for LLM calls:
 *      - messages: Chat history
 *      - model: Which model to use
 *      - provider: Which provider
 *      - apiKey: User's API key (BYOK)
 *      - temperature: Creativity (0-1)
 *      - maxTokens: Output limit
 *      - responseFormat: JSON or text
 * 
 *   6. GENERATION PHASES (GenerationPhase enum)
 *      The 12 phases of story generation:
 *      - GENESIS: Initial concept
 *      - CHARACTERS: Character profiles
 *      - NARRATOR_DESIGN: Narrative voice
 *      - WORLDBUILDING: Setting details
 *      - OUTLINING: Scene structure
 *      - ADVANCED_PLANNING: Detailed planning
 *      - DRAFTING: First draft
 *      - CRITIQUE: Evaluation
 *      - REVISION: Improvements
 *      - ORIGINALITY_CHECK: Cliche detection
 *      - IMPACT_ASSESSMENT: Emotional resonance
 *      - POLISH: Final refinement
 * 
 *   7. PHASE TOKEN LIMITS (PHASE_MAX_TOKENS)
 *      Dynamic token limits based on phase:
 *      - OUTLINING: 16384 (needs detailed scene plans)
 *      - DRAFTING: 16384 (full scene prose)
 *      - CRITIQUE: 6144 (shorter feedback)
 *      - etc.
 * 
 *      This is important because:
 *      - Different phases need different output sizes
 *      - Prevents wasting tokens on short responses
 *      - Ensures enough tokens for long outputs
 * 
 * BYOK (BRING YOUR OWN KEY):
 * --------------------------
 * Users provide their own API keys, which means:
 *   - No server-side key storage (security!)
 *   - Users pay for their own usage
 *   - Users choose their preferred provider
 *   - Fallback to env vars if no key provided
 * 
 * DEFAULT MODELS:
 * ---------------
 * The DEFAULT_MODELS constant defines recommended models per provider.
 * These are updated based on the project README.md Model Tiers.
 * 
 * IMPORTANT: Don't hardcode outdated models like "gpt-4o" or
 * "claude-3-5-sonnet-20241022" - always check README for current
 * recommendations.
 * 
 * @see LLMProviderService.ts for how these types are used
 * @see BaseAgent.ts for how agents make LLM calls
 */

import { Property, Required, Enum, Optional } from "@tsed/schema";

/**
 * Supported LLM providers
 */
export enum LLMProvider {
  OPENAI = "openai",
  ANTHROPIC = "anthropic",
  GEMINI = "gemini",
  OPENROUTER = "openrouter",
  DEEPSEEK = "deepseek",
  VENICE = "venice",
}

/**
 * Chat message role
 */
export enum MessageRole {
  SYSTEM = "system",
  USER = "user",
  ASSISTANT = "assistant",
}

/**
 * Chat message structure
 */
export class ChatMessage {
  @Required()
  @Enum(MessageRole)
  role: MessageRole;

  @Required()
  @Property()
  content: string;
}

/**
 * Token usage statistics
 */
export class TokenUsage {
  @Property()
  promptTokens: number = 0;

  @Property()
  completionTokens: number = 0;

  @Property()
  totalTokens: number = 0;
}

/**
 * Unified response from any LLM provider
 */
export class LLMResponse {
  @Required()
  @Property()
  content: string;

  @Required()
  @Property()
  model: string;

  @Required()
  @Enum(LLMProvider)
  provider: LLMProvider;

  @Required()
  @Property()
  usage: TokenUsage;

  @Property()
  finishReason: string = "stop";

  @Optional()
  @Property()
  latencyMs?: number;
}

/**
 * LLM completion request options
 */
export class CompletionOptions {
  @Required()
  @Property()
  messages: ChatMessage[];

  @Required()
  @Property()
  model: string;

  @Required()
  @Enum(LLMProvider)
  provider: LLMProvider;

  @Required()
  @Property()
  apiKey: string;

  @Optional()
  @Property()
  temperature?: number = 0.7;

  @Optional()
  @Property()
  maxTokens?: number;

  @Optional()
  @Property()
  responseFormat?: { type: "json_object" | "text" };
}

/**
 * Provider-specific configuration
 */
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organizationId?: string;
}

/**
 * Generation phase enum matching Python orchestrator
 */
export enum GenerationPhase {
  GENESIS = "genesis",
  CHARACTERS = "characters",
  NARRATOR_DESIGN = "narrator_design",
  WORLDBUILDING = "worldbuilding",
  OUTLINING = "outlining",
  ADVANCED_PLANNING = "advanced_planning",
  DRAFTING = "drafting",
  CRITIQUE = "critique",
  REVISION = "revision",
  ORIGINALITY_CHECK = "originality_check",
  IMPACT_ASSESSMENT = "impact_assessment",
  POLISH = "polish",
}

/**
 * Dynamic max_tokens limits based on phase/task type
 * These are tuned for the expected output size of each phase
 */
export const PHASE_MAX_TOKENS: Record<GenerationPhase, number> = {
  [GenerationPhase.OUTLINING]: 16384,
  [GenerationPhase.DRAFTING]: 16384,
  [GenerationPhase.REVISION]: 16384,
  [GenerationPhase.POLISH]: 12288,
  [GenerationPhase.WORLDBUILDING]: 12288,
  [GenerationPhase.CHARACTERS]: 10240,
  [GenerationPhase.GENESIS]: 8192,
  [GenerationPhase.IMPACT_ASSESSMENT]: 8192,
  [GenerationPhase.NARRATOR_DESIGN]: 6144,
  [GenerationPhase.ADVANCED_PLANNING]: 8192,
  [GenerationPhase.CRITIQUE]: 6144,
  [GenerationPhase.ORIGINALITY_CHECK]: 4096,
};

export const DEFAULT_MAX_TOKENS = 8192;

/**
 * Get appropriate max_tokens limit based on current phase
 */
export function getMaxTokensForPhase(phase?: GenerationPhase): number {
  if (!phase) return DEFAULT_MAX_TOKENS;
  return PHASE_MAX_TOKENS[phase] ?? DEFAULT_MAX_TOKENS;
}

/**
 * Default models for each provider (December 2025)
 * Based on README.md Model Tiers
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  [LLMProvider.OPENAI]: "gpt-5.2",
  [LLMProvider.ANTHROPIC]: "claude-opus-4.5",
  [LLMProvider.GEMINI]: "gemini-3-pro",
  [LLMProvider.OPENROUTER]: "google/gemini-3-pro",
  [LLMProvider.DEEPSEEK]: "deepseek-v3",
  [LLMProvider.VENICE]: "dolphin-mistral-24b",
};

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): string {
  return DEFAULT_MODELS[provider] ?? DEFAULT_MODELS[LLMProvider.OPENAI];
}
