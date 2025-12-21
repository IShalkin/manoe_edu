import { Controller, Get, QueryParams } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";

// Model definitions matching the Python orchestrator
const OPENAI_MODELS = {
  "gpt-4o": {
    name: "GPT-4o",
    description: "Most capable GPT-4 model, multimodal",
    contextWindow: 128000,
    maxOutput: 16384,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "gpt-4o-mini": {
    name: "GPT-4o Mini",
    description: "Smaller, faster, cheaper GPT-4o variant",
    contextWindow: 128000,
    maxOutput: 16384,
    recommendedFor: ["writer"],
  },
  "gpt-4-turbo": {
    name: "GPT-4 Turbo",
    description: "GPT-4 Turbo with vision capabilities",
    contextWindow: 128000,
    maxOutput: 4096,
    recommendedFor: ["architect", "critic"],
  },
  "gpt-3.5-turbo": {
    name: "GPT-3.5 Turbo",
    description: "Fast and cost-effective",
    contextWindow: 16385,
    maxOutput: 4096,
    recommendedFor: ["writer"],
  },
  "o1-preview": {
    name: "O1 Preview",
    description: "Advanced reasoning model",
    contextWindow: 128000,
    maxOutput: 32768,
    recommendedFor: ["architect", "strategist"],
  },
  "o1-mini": {
    name: "O1 Mini",
    description: "Smaller reasoning model",
    contextWindow: 128000,
    maxOutput: 65536,
    recommendedFor: ["strategist"],
  },
};

const OPENROUTER_MODELS = {
  "openai/gpt-4o": {
    name: "GPT-4o (via OpenRouter)",
    description: "OpenAI GPT-4o through OpenRouter",
    contextWindow: 128000,
    maxOutput: 16384,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "anthropic/claude-3.5-sonnet": {
    name: "Claude 3.5 Sonnet (via OpenRouter)",
    description: "Anthropic Claude 3.5 Sonnet through OpenRouter",
    contextWindow: 200000,
    maxOutput: 8192,
    recommendedFor: ["architect", "profiler", "critic", "writer"],
  },
  "anthropic/claude-3-opus": {
    name: "Claude 3 Opus (via OpenRouter)",
    description: "Anthropic Claude 3 Opus through OpenRouter",
    contextWindow: 200000,
    maxOutput: 4096,
    recommendedFor: ["architect", "critic"],
  },
  "google/gemini-pro-1.5": {
    name: "Gemini Pro 1.5 (via OpenRouter)",
    description: "Google Gemini Pro 1.5 through OpenRouter",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["strategist", "writer"],
  },
  "meta-llama/llama-3.1-405b-instruct": {
    name: "Llama 3.1 405B (via OpenRouter)",
    description: "Meta Llama 3.1 405B Instruct",
    contextWindow: 131072,
    maxOutput: 4096,
    recommendedFor: ["writer"],
  },
  "meta-llama/llama-3.1-70b-instruct": {
    name: "Llama 3.1 70B (via OpenRouter)",
    description: "Meta Llama 3.1 70B Instruct",
    contextWindow: 131072,
    maxOutput: 4096,
    recommendedFor: ["writer"],
  },
  "mistralai/mistral-large": {
    name: "Mistral Large (via OpenRouter)",
    description: "Mistral AI Large model",
    contextWindow: 128000,
    maxOutput: 4096,
    recommendedFor: ["writer", "profiler"],
  },
  "qwen/qwen-2.5-72b-instruct": {
    name: "Qwen 2.5 72B (via OpenRouter)",
    description: "Alibaba Qwen 2.5 72B Instruct",
    contextWindow: 131072,
    maxOutput: 8192,
    recommendedFor: ["writer", "profiler"],
  },
};

const GEMINI_MODELS = {
  "gemini-2.0-flash-exp": {
    name: "Gemini 2.0 Flash (Experimental)",
    description: "Latest Gemini 2.0 Flash experimental model",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["architect", "strategist", "writer"],
  },
  "gemini-1.5-pro": {
    name: "Gemini 1.5 Pro",
    description: "Most capable Gemini model with 1M context",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["architect", "profiler", "strategist", "critic"],
  },
  "gemini-1.5-flash": {
    name: "Gemini 1.5 Flash",
    description: "Fast and efficient Gemini model",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["writer"],
  },
  "gemini-1.5-flash-8b": {
    name: "Gemini 1.5 Flash 8B",
    description: "Smallest and fastest Gemini model",
    contextWindow: 1000000,
    maxOutput: 8192,
    recommendedFor: ["writer"],
  },
};

const CLAUDE_MODELS = {
  "claude-3-5-sonnet-20241022": {
    name: "Claude 3.5 Sonnet (Latest)",
    description: "Most intelligent Claude model, best for complex tasks",
    contextWindow: 200000,
    maxOutput: 8192,
    recommendedFor: ["architect", "profiler", "strategist", "critic", "writer"],
  },
  "claude-3-5-haiku-20241022": {
    name: "Claude 3.5 Haiku",
    description: "Fast and cost-effective Claude model",
    contextWindow: 200000,
    maxOutput: 8192,
    recommendedFor: ["writer"],
  },
  "claude-3-opus-20240229": {
    name: "Claude 3 Opus",
    description: "Most powerful Claude 3 model for complex reasoning",
    contextWindow: 200000,
    maxOutput: 4096,
    recommendedFor: ["architect", "critic"],
  },
  "claude-3-sonnet-20240229": {
    name: "Claude 3 Sonnet",
    description: "Balanced Claude 3 model",
    contextWindow: 200000,
    maxOutput: 4096,
    recommendedFor: ["profiler", "strategist"],
  },
  "claude-3-haiku-20240307": {
    name: "Claude 3 Haiku",
    description: "Fastest Claude 3 model",
    contextWindow: 200000,
    maxOutput: 4096,
    recommendedFor: ["writer"],
  },
};

@Controller("/models")
@Tags("Models")
@Description("LLM model information and configuration")
export class ModelsController {
  @Get("/")
  @Summary("Get all available models")
  @Description("List all available models grouped by provider")
  async getAllModels(): Promise<{
    openai: typeof OPENAI_MODELS;
    openrouter: typeof OPENROUTER_MODELS;
    gemini: typeof GEMINI_MODELS;
    claude: typeof CLAUDE_MODELS;
  }> {
    return {
      openai: OPENAI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS,
      claude: CLAUDE_MODELS,
    };
  }

  @Get("/providers")
  @Summary("Get available providers")
  @Description("List all supported LLM providers")
  async getProviders(): Promise<{
    providers: Array<{
      id: string;
      name: string;
      description: string;
      baseUrl: string;
    }>;
  }> {
    return {
      providers: [
        {
          id: "openai",
          name: "OpenAI",
          description: "OpenAI GPT models including GPT-4o and O1",
          baseUrl: "https://api.openai.com/v1",
        },
        {
          id: "openrouter",
          name: "OpenRouter",
          description: "Access multiple providers through one API",
          baseUrl: "https://openrouter.ai/api/v1",
        },
        {
          id: "gemini",
          name: "Google Gemini",
          description: "Google's Gemini models with 1M context",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta",
        },
        {
          id: "claude",
          name: "Anthropic Claude",
          description: "Anthropic's Claude models",
          baseUrl: "https://api.anthropic.com/v1",
        },
      ],
    };
  }

  @Get("/provider/:providerId")
  @Summary("Get models for a provider")
  @Description("List all models available for a specific provider")
  async getProviderModels(
    @QueryParams("providerId") providerId: string
  ): Promise<{ models: Record<string, unknown> }> {
    const providerModels: Record<string, Record<string, unknown>> = {
      openai: OPENAI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS,
      claude: CLAUDE_MODELS,
    };

    const models = providerModels[providerId];
    
    if (!models) {
      throw new Error(`Unknown provider: ${providerId}`);
    }

    return { models };
  }

  @Get("/recommended/:agentName")
  @Summary("Get recommended models for an agent")
  @Description("List models recommended for a specific agent role")
  async getRecommendedModels(
    @QueryParams("agentName") agentName: string
  ): Promise<{
    agent: string;
    recommendations: Record<string, string[]>;
  }> {
    const allModels = {
      openai: OPENAI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS,
      claude: CLAUDE_MODELS,
    };

    const recommendations: Record<string, string[]> = {};

    for (const [provider, models] of Object.entries(allModels)) {
      const recommended: string[] = [];
      for (const [modelId, modelInfo] of Object.entries(models)) {
        if ((modelInfo as { recommendedFor: string[] }).recommendedFor.includes(agentName.toLowerCase())) {
          recommended.push(modelId);
        }
      }
      if (recommended.length > 0) {
        recommendations[provider] = recommended;
      }
    }

    return {
      agent: agentName,
      recommendations,
    };
  }

  @Get("/agents")
  @Summary("Get agent roles")
  @Description("List all agent roles and their purposes")
  async getAgentRoles(): Promise<{
    agents: Array<{
      name: string;
      phase: string;
      description: string;
      defaultProvider: string;
      defaultModel: string;
    }>;
  }> {
    return {
      agents: [
        {
          name: "architect",
          phase: "Genesis",
          description: "Transforms seed ideas into structured narrative possibilities",
          defaultProvider: "openai",
          defaultModel: "gpt-4o",
        },
        {
          name: "profiler",
          phase: "Characters",
          description: "Creates psychologically deep character profiles",
          defaultProvider: "openai",
          defaultModel: "gpt-4o",
        },
        {
          name: "strategist",
          phase: "Outlining",
          description: "Creates detailed scene-by-scene plot outlines",
          defaultProvider: "openai",
          defaultModel: "gpt-4o",
        },
        {
          name: "writer",
          phase: "Drafting",
          description: "Transforms scene outlines into vivid prose",
          defaultProvider: "openai",
          defaultModel: "gpt-4o-mini",
        },
        {
          name: "critic",
          phase: "Critique",
          description: "Provides artistic critique of scene drafts",
          defaultProvider: "openai",
          defaultModel: "gpt-4o",
        },
      ],
    };
  }
}
