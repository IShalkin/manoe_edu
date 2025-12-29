import { Configuration, Inject } from "@tsed/di";
import { PlatformApplication } from "@tsed/common";
import "@tsed/platform-express";
import "@tsed/socketio";
import "@tsed/swagger";
import * as bodyParser from "body-parser";
import compress from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import methodOverride from "method-override";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Import controllers
import { ProjectController } from "./controllers/ProjectController";
import { GenerationController } from "./controllers/GenerationController";
import { MemoryController } from "./controllers/MemoryController";
import { ModelsController } from "./controllers/ModelsController";
import { HealthController } from "./controllers/HealthController";
import { OrchestrationController } from "./controllers/OrchestrationController";
import { StateController } from "./controllers/StateController";
import { TracesController } from "./controllers/TracesController";
import { ResearchController } from "./controllers/ResearchController";
import { DynamicModelsController } from "./controllers/DynamicModelsController";

// Import services for state recovery
import { StorytellerOrchestrator } from "./services/StorytellerOrchestrator";

const rootDir = __dirname;

@Configuration({
  rootDir,
  acceptMimes: ["application/json"],
  httpPort: process.env.PORT || 3000,
  httpsPort: false,
  mount: {
    "/api": [
      ProjectController,
      GenerationController,
      MemoryController,
      ModelsController,
      HealthController,
    ],
                "/orchestrate": [
                  OrchestrationController,
                  StateController,
                  TracesController,
                  ResearchController,
                  DynamicModelsController,
                ],
  },
  swagger: [
    {
      path: "/docs",
      specVersion: "3.0.3",
      spec: {
        info: {
          title: "MANOE API Gateway",
          version: "1.0.0",
          description: `
# MANOE - Multi-Agent Narrative Orchestration Engine

TypeScript/Ts.ED API Gateway for AI-powered narrative generation.

## Features
- **Multi-Agent Orchestration**: 9 specialized AI agents (Architect, Profiler, Worldbuilder, etc.)
- **Real-time SSE Streaming**: Server-Sent Events for live generation updates
- **LLM Provider Abstraction**: Support for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Venice
- **Vector Memory**: Qdrant-based semantic search for characters and worldbuilding
- **Observability**: Langfuse integration for tracing and prompt management

## Authentication
All endpoints require a valid API key passed via the \`x-api-key\` header or Bearer token.

## Rate Limiting
- Standard endpoints: 100 requests/minute
- Generation endpoints: 10 requests/minute
          `,
        },
        tags: [
          { name: "Orchestration", description: "Narrative generation orchestration" },
          { name: "Projects", description: "Project management" },
          { name: "Generation", description: "Legacy generation endpoints" },
          { name: "Memory", description: "Vector memory operations" },
          { name: "Models", description: "LLM model information" },
          { name: "Health", description: "Health check endpoints" },
        ],
      },
    },
  ],
  socketIO: {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: string | boolean) => void) => {
        const corsOriginEnv = process.env.CORS_ORIGIN || "*";
        if (corsOriginEnv === "*") {
          callback(null, true);
          return;
        }
        const whitelist = corsOriginEnv.split(",").map(s => s.trim());
        if (!origin || whitelist.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      methods: ["GET", "POST"],
    },
  },
  middlewares: [
    cors({
      origin: (origin, callback) => {
        const corsOriginEnv = process.env.CORS_ORIGIN || "*";
        
        if (corsOriginEnv === "*") {
          callback(null, "*");
          return;
        }
        
        const whitelist = corsOriginEnv.split(",").map(s => s.trim());
        
        if (!origin || whitelist.includes(origin)) {
          // For requests without Origin header, return first whitelisted origin
          // This allows server-to-server calls while maintaining CORS security
          callback(null, origin || whitelist[0]);
        } else {
          callback(new Error(`Origin ${origin} not allowed by CORS`));
        }
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "x-api-key"],
      exposedHeaders: ["Content-Length", "X-Request-Id"],
      preflightContinue: false,
      optionsSuccessStatus: 204,
    }),
    cookieParser(),
    compress(),
    methodOverride(),
    bodyParser.json(),
    bodyParser.urlencoded({ extended: true }),
  ],
  exclude: ["**/*.spec.ts"],
})
export class Server {
  @Inject()
  protected app: PlatformApplication;

  @Inject()
  protected orchestrator: StorytellerOrchestrator;

  @Configuration()
  protected settings: Configuration;

  $beforeRoutesInit(): void {
    // CORS is now handled entirely by the cors() middleware in the middlewares array
    // This prevents duplicate CORS headers which cause browser errors
    // See: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS/Errors/CORSMultipleAllowOriginNotAllowed
  }

  async $afterRoutesInit(): Promise<void> {
    // Restore any interrupted runs from previous shutdown
    // This ensures active generation runs survive container restarts
    console.log("Server: Initializing state recovery...");
    try {
      const restoredCount = await this.orchestrator.restoreAllInterruptedRuns();
      if (restoredCount > 0) {
        console.log(`Server: Restored ${restoredCount} interrupted generation runs`);
      } else {
        console.log("Server: No interrupted runs to restore");
      }
    } catch (error) {
      console.error("Server: Failed to restore interrupted runs:", error);
      // Don't fail startup if recovery fails - just log the error
    }

    // Register graceful shutdown handler
    this.registerShutdownHandler();
  }

  /**
   * Register handler for graceful shutdown
   * Saves active run states to Supabase before process exit
   */
  private registerShutdownHandler(): void {
    const shutdown = async (signal: string) => {
      console.log(`Server: Received ${signal}, initiating graceful shutdown...`);
      try {
        const savedCount = await this.orchestrator.gracefulShutdown(30000);
        console.log(`Server: Graceful shutdown complete. Saved ${savedCount} runs.`);
        process.exit(0);
      } catch (error) {
        console.error("Server: Error during graceful shutdown:", error);
        process.exit(1);
      }
    };

    // Handle various shutdown signals
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
    
    console.log("Server: Graceful shutdown handler registered");
  }
}
