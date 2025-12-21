/**
 * ============================================================================
 * LLM PROVIDER SERVICE
 * ============================================================================
 * 
 * This service provides a UNIFIED INTERFACE to multiple LLM (Large Language Model)
 * providers. It's the "translator" that lets the rest of the application talk to
 * any AI model without knowing the specific API details.
 * 
 * BYOK (BRING YOUR OWN KEY) MODEL:
 * --------------------------------
 * Users provide their own API keys for LLM providers. This means:
 *   - No server-side API key storage (security!)
 *   - Users pay for their own API usage
 *   - Users can choose their preferred provider/model
 *   - Fallback to environment variables if no key provided
 * 
 * SUPPORTED PROVIDERS:
 * --------------------
 * 
 *   1. OPENAI (api.openai.com)
 *      - Models: GPT-4, GPT-4-turbo, GPT-5, O1, O3
 *      - Uses official OpenAI SDK
 *      - Newer models use max_completion_tokens instead of max_tokens
 * 
 *   2. ANTHROPIC (api.anthropic.com)
 *      - Models: Claude 3 Opus, Claude 3 Sonnet, Claude 4
 *      - Uses official Anthropic SDK
 *      - System message handled separately from chat messages
 * 
 *   3. GOOGLE GEMINI (generativelanguage.googleapis.com)
 *      - Models: Gemini Pro, Gemini Flash, Gemini 3
 *      - Uses Google AI SDK
 *      - Messages combined into single prompt
 * 
 *   4. OPENROUTER (openrouter.ai)
 *      - Meta-provider: Access to 100+ models from various providers
 *      - OpenAI-compatible API
 *      - Useful for trying different models without multiple accounts
 * 
 *   5. DEEPSEEK (api.deepseek.com)
 *      - Models: DeepSeek V3, DeepSeek R1
 *      - OpenAI-compatible API
 *      - Good for cost-effective generation
 * 
 *   6. VENICE AI (api.venice.ai)
 *      - Models: Dolphin Mistral, Llama variants
 *      - OpenAI-compatible API
 *      - Privacy-focused provider
 * 
 * UNIFIED RESPONSE FORMAT:
 * ------------------------
 * All providers return the same LLMResponse structure:
 *   {
 *     content: string,      // The generated text
 *     model: string,        // Model used
 *     provider: LLMProvider,// Provider enum
 *     usage: TokenUsage,    // Token counts for billing
 *     finishReason: string, // Why generation stopped
 *     latencyMs?: number    // Response time
 *   }
 * 
 * RETRY LOGIC:
 * ------------
 * createCompletionWithRetry() handles transient errors:
 *   - Rate limits (429)
 *   - Server errors (500, 502, 503, 504)
 *   - Timeouts
 *   - Uses exponential backoff: 1s, 2s, 4s
 *   - Maximum 3 retries by default
 * 
 * SECURITY:
 * ---------
 *   - API keys are NEVER logged
 *   - Placeholder keys are rejected (prevents accidental commits)
 *   - Keys are trimmed and validated before use
 * 
 * USAGE EXAMPLE:
 * --------------
 *   const response = await llmProvider.createCompletionWithRetry({
 *     messages: [
 *       { role: 'system', content: 'You are a helpful assistant.' },
 *       { role: 'user', content: 'Write a story about a dragon.' }
 *     ],
 *     model: 'gpt-4',
 *     provider: LLMProvider.OPENAI,
 *     apiKey: userProvidedKey,
 *     temperature: 0.7,
 *     maxTokens: 4096,
 *   });
 * 
 * @see LLMModels.ts for type definitions
 * @see BaseAgent.ts for how agents use this service
 */

import { Service } from "@tsed/di";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  LLMProvider,
  LLMResponse,
  CompletionOptions,
  ChatMessage,
  MessageRole,
  TokenUsage,
} from "../models/LLMModels";

/**
 * Provider base URLs
 */
const PROVIDER_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  venice: "https://api.venice.ai/api/v1",
};

@Service()
export class LLMProviderService {
  /**
   * Create a chat completion using the specified provider
   * 
   * @param options - Completion options including messages, model, provider, and API key
   * @returns Unified LLM response
   */
  async createCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const startTime = Date.now();

    let response: LLMResponse;

    switch (options.provider) {
      case LLMProvider.OPENAI:
        response = await this.openAICompletion(options);
        break;
      case LLMProvider.ANTHROPIC:
        response = await this.anthropicCompletion(options);
        break;
      case LLMProvider.GEMINI:
        response = await this.geminiCompletion(options);
        break;
      case LLMProvider.OPENROUTER:
        response = await this.openRouterCompletion(options);
        break;
      case LLMProvider.DEEPSEEK:
        response = await this.deepSeekCompletion(options);
        break;
      case LLMProvider.VENICE:
        response = await this.veniceCompletion(options);
        break;
      default:
        throw new Error(`Unsupported provider: ${options.provider}`);
    }

    response.latencyMs = Date.now() - startTime;
    return response;
  }

  /**
   * Common placeholder keys that should be rejected
   */
  private static readonly PLACEHOLDER_KEYS = [
    "test-key",
    "your-api-key",
    "api-key-here",
    "placeholder",
    "xxx",
  ];

  /**
   * Get API key with fallback to environment variable
   * BYOK (Bring Your Own Key) takes precedence over env fallback
   * 
   * Security: API keys are never logged or included in error messages
   */
  private getApiKey(provider: LLMProvider, requestApiKey?: string): string {
    // Trim and validate request API key (BYOK)
    const trimmedKey = requestApiKey?.trim();
    if (trimmedKey && trimmedKey.length > 10) {
      // Reject common placeholder keys (case-insensitive)
      const lowerKey = trimmedKey.toLowerCase();
      const isPlaceholder = LLMProviderService.PLACEHOLDER_KEYS.some(
        (placeholder) => lowerKey === placeholder || lowerKey.includes(placeholder)
      );
      if (!isPlaceholder) {
        return trimmedKey;
      }
    }

    // Fallback to environment variables
    const envKeys: Record<string, string | undefined> = {
      [LLMProvider.OPENAI]: process.env.OPENAI_API_KEY,
      [LLMProvider.ANTHROPIC]: process.env.ANTHROPIC_API_KEY,
      [LLMProvider.GEMINI]: process.env.GOOGLE_API_KEY,
      [LLMProvider.OPENROUTER]: process.env.OPENROUTER_API_KEY,
      [LLMProvider.DEEPSEEK]: process.env.DEEPSEEK_API_KEY,
      [LLMProvider.VENICE]: process.env.VENICE_API_KEY,
    };

    const envKey = envKeys[provider];
    if (envKey) {
      return envKey;
    }

    throw new Error(
      `No API key provided for ${provider}. Either pass apiKey in request or set environment variable.`
    );
  }

  /**
   * OpenAI completion
   */
  private async openAICompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.OPENAI, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.openai,
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
      temperature: options.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      // Newer models (gpt-5.x, o1, o3) use max_completion_tokens instead of max_tokens
      const usesNewTokenParam = options.model.startsWith("gpt-5") || 
                                 options.model.startsWith("o1") || 
                                 options.model.startsWith("o3");
      if (usesNewTokenParam) {
        (requestParams as unknown as Record<string, unknown>).max_completion_tokens = options.maxTokens;
      } else {
        requestParams.max_tokens = options.maxTokens;
      }
    }

    if (options.responseFormat?.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestParams);

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: options.model,
      provider: LLMProvider.OPENAI,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: response.choices[0]?.finish_reason ?? "stop",
    };
  }

  /**
   * Anthropic Claude completion
   */
  private async anthropicCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.ANTHROPIC, options.apiKey);
    const client = new Anthropic({
      apiKey,
    });

    // Extract system message
    let systemMessage = "";
    const chatMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of options.messages) {
      if (msg.role === MessageRole.SYSTEM) {
        systemMessage = msg.content;
      } else {
        chatMessages.push({
          role: msg.role === MessageRole.USER ? "user" : "assistant",
          content: msg.content,
        });
      }
    }

    // Add JSON instruction if response_format is json
    if (options.responseFormat?.type === "json_object") {
      systemMessage += "\n\nYou MUST respond with valid JSON only, no other text.";
    }

    const response = await client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      system: systemMessage,
      messages: chatMessages,
      temperature: options.temperature ?? 0.7,
    });

    const content = response.content[0]?.type === "text" 
      ? response.content[0].text 
      : "";

    return {
      content,
      model: options.model,
      provider: LLMProvider.ANTHROPIC,
      usage: {
        promptTokens: response.usage?.input_tokens ?? 0,
        completionTokens: response.usage?.output_tokens ?? 0,
        totalTokens: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
      },
      finishReason: response.stop_reason ?? "stop",
    };
  }

  /**
   * Google Gemini completion
   */
  private async geminiCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.GEMINI, options.apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: options.model });

    // Build prompt from messages
    let systemContent = "";
    let userContent = "";

    for (const msg of options.messages) {
      if (msg.role === MessageRole.SYSTEM) {
        systemContent = msg.content;
      } else if (msg.role === MessageRole.USER) {
        userContent = msg.content;
      } else if (msg.role === MessageRole.ASSISTANT) {
        userContent += `\n\nAssistant: ${msg.content}`;
      }
    }

    let fullPrompt = `${systemContent}\n\n---\n\n${userContent}`;

    // Add JSON instruction if response_format is json
    if (options.responseFormat?.type === "json_object") {
      fullPrompt += "\n\nYou MUST respond with valid JSON only, no other text.";
    }

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens,
      },
    });

    const response = result.response;
    const content = response.text() ?? "";

    return {
      content,
      model: options.model,
      provider: LLMProvider.GEMINI,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
      finishReason: "stop",
    };
  }

  /**
   * OpenRouter completion (OpenAI-compatible API)
   */
  private async openRouterCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.OPENROUTER, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.openrouter,
      defaultHeaders: {
        "HTTP-Referer": "https://manoe.iliashalkin.com",
        "X-Title": "MANOE",
      },
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
      temperature: options.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      requestParams.max_tokens = options.maxTokens;
    }

    if (options.responseFormat?.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestParams);

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: options.model,
      provider: LLMProvider.OPENROUTER,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: response.choices[0]?.finish_reason ?? "stop",
    };
  }

  /**
   * DeepSeek completion (OpenAI-compatible API)
   */
  private async deepSeekCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.DEEPSEEK, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.deepseek,
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
      temperature: options.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      requestParams.max_tokens = options.maxTokens;
    }

    if (options.responseFormat?.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestParams);

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: options.model,
      provider: LLMProvider.DEEPSEEK,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: response.choices[0]?.finish_reason ?? "stop",
    };
  }

  /**
   * Venice AI completion (OpenAI-compatible API)
   */
  private async veniceCompletion(options: CompletionOptions): Promise<LLMResponse> {
    const apiKey = this.getApiKey(LLMProvider.VENICE, options.apiKey);
    const client = new OpenAI({
      apiKey,
      baseURL: PROVIDER_BASE_URLS.venice,
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
      temperature: options.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      requestParams.max_tokens = options.maxTokens;
    }

    if (options.responseFormat?.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestParams);

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: options.model,
      provider: LLMProvider.VENICE,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: response.choices[0]?.finish_reason ?? "stop",
    };
  }

  /**
   * Format messages for OpenAI-compatible APIs
   */
  private formatMessagesForOpenAI(
    messages: ChatMessage[]
  ): OpenAI.ChatCompletionMessageParam[] {
    return messages.map((msg) => ({
      role: msg.role as "system" | "user" | "assistant",
      content: msg.content,
    }));
  }

  /**
   * Check if an error is retryable (rate limit, server error, timeout)
   */
  isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Rate limit errors
      if (message.includes("rate limit") || message.includes("429")) {
        return true;
      }
      
      // Server errors
      if (message.includes("500") || message.includes("502") || 
          message.includes("503") || message.includes("504")) {
        return true;
      }
      
      // Timeout errors
      if (message.includes("timeout") || message.includes("timed out")) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Create completion with automatic retry for transient errors
   */
  async createCompletionWithRetry(
    options: CompletionOptions,
    maxRetries: number = 3,
    baseDelayMs: number = 1000
  ): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await this.createCompletion(options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (!this.isRetryableError(error) || attempt === maxRetries - 1) {
          throw lastError;
        }

        // Exponential backoff
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError ?? new Error("Max retries exceeded");
  }
}
