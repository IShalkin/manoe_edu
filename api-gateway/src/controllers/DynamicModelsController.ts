import { Controller, Post, BodyParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";

interface DynamicModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

interface FetchModelsRequest {
  provider: string;
  api_key: string;
}

interface FetchModelsResponse {
  success: boolean;
  models?: DynamicModel[];
  error?: string;
}

interface OpenAIModelsResponse {
  data: Array<{ id: string }>;
}

interface OpenRouterModelsResponse {
  data: Array<{ id: string; name?: string; context_length?: number; description?: string }>;
}

interface GeminiModelsResponse {
  models: Array<{ name: string; displayName?: string; inputTokenLimit?: number; description?: string; supportedGenerationMethods?: string[] }>;
}

interface DeepSeekModelsResponse {
  data: Array<{ id: string; owned_by?: string }>;
}

interface VeniceModelsResponse {
  data: Array<{ id: string; name?: string; context_length?: number }>;
}

@Controller("/models")
@Tags("Dynamic Models")
@Description("Dynamic model fetching from provider APIs")
export class DynamicModelsController {
  @Post("/")
  @Summary("Fetch models from provider API")
  @Description("Fetches available models from a provider using the provided API key")
  @Returns(200)
  async fetchModels(
    @BodyParams() body: FetchModelsRequest
  ): Promise<FetchModelsResponse> {
    const { provider, api_key } = body;

    if (!provider || !api_key) {
      return {
        success: false,
        error: "Provider and API key are required",
      };
    }

    try {
      const models = await this.fetchModelsFromProvider(provider, api_key);
      return {
        success: true,
        models,
      };
    } catch (error) {
      console.error(`[DynamicModelsController] Error fetching models for ${provider}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch models",
      };
    }
  }

  private async fetchModelsFromProvider(provider: string, apiKey: string): Promise<DynamicModel[]> {
    switch (provider.toLowerCase()) {
      case "openai":
        return this.fetchOpenAIModels(apiKey);
      case "openrouter":
        return this.fetchOpenRouterModels(apiKey);
      case "anthropic":
        return this.fetchAnthropicModels(apiKey);
      case "gemini":
        return this.fetchGeminiModels(apiKey);
      case "deepseek":
        return this.fetchDeepSeekModels(apiKey);
      case "venice":
        return this.fetchVeniceModels(apiKey);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  private async fetchOpenAIModels(apiKey: string): Promise<DynamicModel[]> {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

        const data = await response.json() as OpenAIModelsResponse;
    
        // Filter to only include chat models (gpt-*, o1-*, chatgpt-*)
        const chatModels = data.data.filter((model) => 
          model.id.startsWith("gpt-") || 
          model.id.startsWith("o1-") || 
          model.id.startsWith("o3-") ||
          model.id.startsWith("chatgpt-")
        );

        return chatModels.map((model) => ({
      id: model.id,
      name: this.formatModelName(model.id),
      context_length: this.getOpenAIContextLength(model.id),
    }));
  }

  private async fetchOpenRouterModels(apiKey: string): Promise<DynamicModel[]> {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
    }

        const data = await response.json() as OpenRouterModelsResponse;
    
        return data.data.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      context_length: model.context_length,
      description: model.description,
    }));
  }

  private async fetchAnthropicModels(apiKey: string): Promise<DynamicModel[]> {
    // Anthropic doesn't have a public models list API, so we return known models
    // We validate the API key by making a minimal request
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });

    // If we get 401, the key is invalid
    if (response.status === 401) {
      throw new Error("Invalid Anthropic API key");
    }

    // Return known Claude models
    return [
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (Latest)", context_length: 200000 },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", context_length: 200000 },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus", context_length: 200000 },
      { id: "claude-3-sonnet-20240229", name: "Claude 3 Sonnet", context_length: 200000 },
      { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku", context_length: 200000 },
    ];
  }

  private async fetchGeminiModels(apiKey: string): Promise<DynamicModel[]> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${error}`);
    }

        const data = await response.json() as GeminiModelsResponse;
    
        // Filter to only include generative models
        const generativeModels = data.models.filter((model) =>
          model.supportedGenerationMethods?.includes("generateContent")
        );

        return generativeModels.map((model) => ({
      id: model.name.replace("models/", ""),
      name: model.displayName || model.name,
      context_length: model.inputTokenLimit,
      description: model.description,
    }));
  }

  private async fetchDeepSeekModels(apiKey: string): Promise<DynamicModel[]> {
    const response = await fetch("https://api.deepseek.com/models", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
    }

      const data = await response.json() as DeepSeekModelsResponse;
    
      return data.data.map((model) => ({
        id: model.id,
        name: this.formatModelName(model.id),
        context_length: 64000, // DeepSeek default
      }));
    }

    private async fetchVeniceModels(apiKey: string): Promise<DynamicModel[]> {
      const response = await fetch("https://api.venice.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Venice API error: ${response.status} - ${error}`);
      }

      const data = await response.json() as VeniceModelsResponse;
    
      return data.data.map((model) => ({
      id: model.id,
      name: model.name || model.id,
      context_length: model.context_length,
    }));
  }

  private formatModelName(modelId: string): string {
    return modelId
      .split("-")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private getOpenAIContextLength(modelId: string): number {
    const contextLengths: Record<string, number> = {
      "gpt-4o": 128000,
      "gpt-4o-mini": 128000,
      "gpt-4-turbo": 128000,
      "gpt-4": 8192,
      "gpt-3.5-turbo": 16385,
      "o1-preview": 128000,
      "o1-mini": 128000,
      "o3-mini": 200000,
    };

    // Check for exact match first
    if (contextLengths[modelId]) {
      return contextLengths[modelId];
    }

    // Check for prefix match
    for (const [prefix, length] of Object.entries(contextLengths)) {
      if (modelId.startsWith(prefix)) {
        return length;
      }
    }

    return 128000; // Default for newer models
  }
}
