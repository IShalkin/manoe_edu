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
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"],
    },
  },
  middlewares: [
    cors({
      origin: process.env.CORS_ORIGIN || "*",
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
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

  @Configuration()
  protected settings: Configuration;

  $beforeRoutesInit(): void {
    // Handle CORS preflight requests explicitly before any routes
    const corsOrigin = process.env.CORS_ORIGIN || "*";
    
    this.app.use((req: any, res: any, next: any) => {
      // Set CORS headers for all requests
      res.header("Access-Control-Allow-Origin", corsOrigin);
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Access-Control-Max-Age", "86400");
      
      // Handle preflight requests immediately
      if (req.method === "OPTIONS") {
        return res.status(204).end();
      }
      
      next();
    });
  }

  $afterRoutesInit(): void {
    // Add any post-route initialization here
  }
}
