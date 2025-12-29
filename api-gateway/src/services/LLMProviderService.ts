/**
 * LLM Provider Service
 * Unified model client adapter supporting multiple LLM providers (BYOK)
 * 
 * Supports:
 * - OpenAI (GPT-5.2, GPT-5, O3, etc.)
 * - Anthropic Claude (Opus 4.5, Sonnet 4, etc.)
 * - Google Gemini (Gemini 3 Pro, Flash, etc.)
 * - OpenRouter (access to all models)
 * - DeepSeek (V3, R1)
 * - Venice AI (Dolphin Mistral, Llama 4 Maverick)
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

/**
 * Model context length limits (total tokens including prompt + completion)
 * Used to cap max_tokens to avoid exceeding model limits
 */
const MODEL_CONTEXT_LENGTHS: Record<string, number> = {
  // GPT-4 variants
  "gpt-4": 8192,
  "gpt-4-0314": 8192,
  "gpt-4-0613": 8192,
  "gpt-4-32k": 32768,
  "gpt-4-32k-0314": 32768,
  "gpt-4-32k-0613": 32768,
  "gpt-4-turbo": 128000,
  "gpt-4-turbo-preview": 128000,
  "gpt-4-1106-preview": 128000,
  "gpt-4-0125-preview": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  // GPT-3.5 variants
  "gpt-3.5-turbo": 16385,
  "gpt-3.5-turbo-16k": 16385,
  "gpt-3.5-turbo-1106": 16385,
  "gpt-3.5-turbo-0125": 16385,
  // Default for unknown models (assume large context)
  "default": 128000,
};

/**
 * Get the context length for a model, with fallback to default
 */
function getModelContextLength(model: string): number {
  // Check for exact match first
  if (MODEL_CONTEXT_LENGTHS[model]) {
    return MODEL_CONTEXT_LENGTHS[model];
  }
  // Check for prefix matches (e.g., "gpt-4o-2024-05-13" matches "gpt-4o")
  for (const [key, value] of Object.entries(MODEL_CONTEXT_LENGTHS)) {
    if (key !== "default" && model.startsWith(key)) {
      return value;
    }
  }
  return MODEL_CONTEXT_LENGTHS["default"];
}

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
    console.log(`[LLMProviderService] Starting ${options.provider} completion with model ${options.model}`);

    let response: LLMResponse;

    try {
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
      console.log(`[LLMProviderService] ${options.provider} completion finished in ${response.latencyMs}ms, tokens: ${response.usage?.totalTokens ?? 0}`);
      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[LLMProviderService] ${options.provider} completion failed after ${elapsed}ms:`, error instanceof Error ? error.message : error);
      throw error;
    }
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
      timeout: 120000, // 2 minute timeout
    });

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: options.model,
      messages: this.formatMessagesForOpenAI(options.messages),
      temperature: options.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      // Get model context length and cap max_tokens to leave room for prompt
      // Estimate prompt tokens (rough estimate: 4 chars per token)
      const estimatedPromptTokens = Math.ceil(
        options.messages.reduce((acc, msg) => acc + msg.content.length, 0) / 4
      );
      const modelContextLength = getModelContextLength(options.model);
      // Leave at least 500 tokens buffer for safety, and ensure we don't exceed context
      const maxAllowedTokens = Math.max(500, modelContextLength - estimatedPromptTokens - 500);
      const cappedMaxTokens = Math.min(options.maxTokens, maxAllowedTokens);
      
      console.log(`[LLMProviderService] Model ${options.model} context: ${modelContextLength}, estimated prompt: ${estimatedPromptTokens}, requested: ${options.maxTokens}, capped to: ${cappedMaxTokens}`);
      
      // Newer models (gpt-5.x, o1, o3) use max_completion_tokens instead of max_tokens
      const usesNewTokenParam = options.model.startsWith("gpt-5") || 
                                 options.model.startsWith("o1") || 
                                 options.model.startsWith("o3");
      if (usesNewTokenParam) {
        (requestParams as unknown as Record<string, unknown>).max_completion_tokens = cappedMaxTokens;
      } else {
        requestParams.max_tokens = cappedMaxTokens;
      }
    }

    // Only add response_format for models that support it
    // gpt-4-0613 and older models don't support response_format
    const supportsJsonMode = options.model.includes("turbo") || 
                              options.model.includes("gpt-4o") ||
                              options.model.includes("gpt-4-1106") ||
                              options.model.includes("gpt-4-0125") ||
                              options.model.includes("gpt-3.5-turbo-1106") ||
                              options.model.startsWith("gpt-5") ||
                              options.model.startsWith("o1") ||
                              options.model.startsWith("o3");
    
    if (options.responseFormat?.type === "json_object" && supportsJsonMode) {
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
      timeout: 120000, // 2 minute timeout
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
      timeout: 120000, // 2 minute timeout
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
      timeout: 120000, // 2 minute timeout
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
      timeout: 120000, // 2 minute timeout
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
