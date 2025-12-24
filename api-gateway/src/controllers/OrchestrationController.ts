/**
 * ============================================================================
 * ORCHESTRATION CONTROLLER
 * ============================================================================
 * 
 * This is the HTTP API LAYER for MANOE - the entry point where frontend
 * requests come in and generation results go out. It's like a receptionist
 * who takes requests and coordinates with the back office (orchestrator).
 * 
 * ASYNC GENERATION PATTERN:
 * -------------------------
 * Story generation takes minutes, so we use an ASYNC pattern:
 * 
 *   1. Client → POST /generate
 *      - Starts generation in background
 *      - Returns immediately with runId (202 Accepted)
 * 
 *   2. Client → GET /stream/:runId (SSE)
 *      - Opens Server-Sent Events connection
 *      - Receives real-time progress updates
 *      - Stays open until generation completes
 * 
 * This is better than:
 *   - Long-polling (wasteful, high latency)
 *   - WebSockets (overkill for one-way data)
 *   - Synchronous request (would timeout)
 * 
 * API ENDPOINTS:
 * --------------
 * 
 *   POST /generate
 *   - Start a new generation run
 *   - Body: { projectId, seedIdea, llmConfig, mode }
 *   - Returns: { runId, streamUrl }
 * 
 *   GET /stream/:runId
 *   - SSE endpoint for real-time events
 *   - Events: phase_start, agent_complete, scene_draft_complete, etc.
 *   - Heartbeat every 15s to prevent proxy timeouts
 * 
 *   GET /status/:runId
 *   - Get current run status
 *   - Returns: { phase, currentScene, totalScenes, isPaused, isCompleted }
 * 
 *   POST /pause/:runId
 *   - Pause a running generation
 * 
 *   POST /resume/:runId
 *   - Resume a paused generation
 * 
 *   POST /cancel/:runId
 *   - Cancel and cleanup a generation
 * 
 * SSE (SERVER-SENT EVENTS):
 * -------------------------
 * The /stream endpoint uses SSE for real-time updates:
 * 
 *   Browser:
 *   const eventSource = new EventSource('/stream/run-123');
 *   eventSource.onmessage = (e) => {
 *     const event = JSON.parse(e.data);
 *     console.log(event.type, event.data);
 *   };
 * 
 *   Server sends:
 *   data: {"type":"phase_start","data":{"phase":"genesis"}}\n\n
 *   data: {"type":"agent_complete","data":{"agent":"architect"}}\n\n
 *   : heartbeat\n\n  (comment, keeps connection alive)
 * 
 * HTTP/2 COMPATIBILITY:
 * ---------------------
 * Important: We DON'T set "Connection: keep-alive" header because
 * it's forbidden in HTTP/2 and causes ERR_HTTP2_PROTOCOL_ERROR.
 * The connection stays open naturally with SSE.
 * 
 * LEGACY PYTHON FORMAT:
 * ---------------------
 * The controller supports both formats for backward compatibility:
 * 
 *   New (TypeScript):
 *   { projectId, seedIdea, llmConfig: { provider, model, apiKey } }
 * 
 *   Legacy (Python):
 *   { supabase_project_id, seed_idea, provider, model, api_key }
 * 
 * This allows gradual migration from Python to TypeScript orchestrator.
 * 
 * DTOs (DATA TRANSFER OBJECTS):
 * -----------------------------
 * Request/response classes with Ts.ED decorators:
 *   - @Required(): Field must be present
 *   - @Description(): OpenAPI documentation
 *   - @Example(): Example value for docs
 *   - @Groups("internal"): Hide from public API docs
 * 
 * These generate automatic OpenAPI/Swagger documentation.
 * 
 * @see StorytellerOrchestrator.ts for the actual generation logic
 * @see RedisStreamsService.ts for event streaming
 * @see useGenerationStream.ts (frontend) for SSE consumption
 */

import { Controller, Post, Get, PathParams, BodyParams, QueryParams, Req, Res, AcceptMime, $log } from "@tsed/common";
import { 
  Description, 
  Returns, 
  Summary, 
  Tags, 
  Example,
  Title,
  Groups,
  Required,
  Property,
  Enum,
} from "@tsed/schema";
import { Inject } from "@tsed/di";
import { Request, Response } from "express";
import { StorytellerOrchestrator, GenerationOptions, RunStatus, LLMConfiguration } from "../services/StorytellerOrchestrator";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { LLMProvider, GenerationPhase } from "../models/LLMModels";

// ==================== DTOs ====================

/**
 * LLM Configuration DTO
 * Uses @Groups to separate public and internal fields
 */
class LLMConfigDTO {
  @Required()
  @Enum(LLMProvider)
  @Description("LLM provider to use")
  @Example("openai")
  provider: LLMProvider;

  @Required()
  @Description("Model name (e.g., gpt-4-turbo, claude-3-opus)")
  @Example("gpt-4-turbo")
  model: string;

  @Required()
  @Groups("internal")
  @Description("API key for the provider (BYOK - Bring Your Own Key)")
  apiKey: string;

  @Property()
  @Description("Temperature for generation (0-2)")
  @Example(0.7)
  temperature?: number;
}

/**
 * Generation Request DTO - supports both new TypeScript format and legacy Python format
 */
class GenerateRequestDTO {
  // New TypeScript format
  @Property()
  @Description("Project ID from Supabase")
  @Example("550e8400-e29b-41d4-a716-446655440000")
  projectId?: string;

  @Property()
  @Description("Seed idea for the narrative")
  @Example("A story about a detective who can see ghosts")
  seedIdea?: string;

  @Property()
  @Description("LLM configuration")
  llmConfig?: LLMConfigDTO;

  @Property()
  @Enum("full", "branching")
  @Description("Generation mode: 'full' for complete story, 'branching' for interactive")
  @Example("full")
  mode?: "full" | "branching";

  @Property()
  @Groups("internal")
  @Description("Additional settings")
  settings?: Record<string, unknown>;

  // Legacy Python format (snake_case)
  @Property()
  @Description("Supabase project ID (legacy)")
  supabase_project_id?: string;

  @Property()
  @Description("Seed idea (legacy)")
  seed_idea?: string;

  @Property()
  @Description("LLM provider (legacy)")
  provider?: string;

  @Property()
  @Description("LLM model (legacy)")
  model?: string;

  @Property()
  @Description("API key (legacy)")
  api_key?: string;

  @Property()
  @Description("Generation mode (legacy)")
  generation_mode?: "full" | "branching";
}

/**
 * Generation Response DTO - includes both camelCase and snake_case for compatibility
 */
class GenerateResponseDTO {
  @Required()
  @Description("Unique run identifier")
  @Example("run-550e8400-e29b-41d4-a716-446655440000")
  runId: string;

  @Required()
  @Description("Unique run identifier (legacy)")
  @Example("run-550e8400-e29b-41d4-a716-446655440000")
  run_id: string;

  @Required()
  @Description("Success status")
  @Example(true)
  success: boolean;

  @Required()
  @Description("Status message")
  @Example("Generation started")
  message: string;

  @Required()
  @Description("SSE stream URL for real-time updates")
  @Example("/orchestrate/stream/run-550e8400-e29b-41d4-a716-446655440000")
  streamUrl: string;
}

/**
 * Run Status DTO (public view)
 */
class RunStatusDTO {
  @Required()
  @Description("Unique run identifier")
  runId: string;

  @Required()
  @Description("Project ID")
  projectId: string;

  @Required()
  @Enum(GenerationPhase)
  @Description("Current generation phase")
  phase: GenerationPhase;

  @Required()
  @Description("Current scene number being processed")
  currentScene: number;

  @Required()
  @Description("Total number of scenes")
  totalScenes: number;

  @Required()
  @Description("Whether the run is paused")
  isPaused: boolean;

  @Required()
  @Description("Whether the run is completed")
  isCompleted: boolean;

  @Property()
  @Description("Error message if generation failed")
  error?: string;

  @Required()
  @Description("When the run started")
  startedAt: string;

  @Required()
  @Description("Last update timestamp")
  updatedAt: string;
}

/**
 * SSE Event structure documentation
 */
class SSEEventDTO {
  @Required()
  @Description("Event ID from Redis Stream")
  @Example("1702834567890-0")
  id: string;

  @Required()
  @Description("Event type: phase_start, phase_complete, agent_message, ERROR, heartbeat")
  @Example("phase_start")
  type: string;

  @Required()
  @Description("Run ID this event belongs to")
  runId: string;

  @Required()
  @Description("ISO timestamp")
  timestamp: string;

  @Required()
  @Description("Event-specific data payload")
  data: Record<string, unknown>;
}

// ==================== Controller ====================

@Controller("/")
@Tags("Orchestration")
@Description(`
Narrative generation orchestration endpoints.

**Architecture:**
- Pure TypeScript orchestrator (no Python dependency)
- 9 specialized AI agents (Architect, Profiler, Worldbuilder, Strategist, Writer, Critic, Originality, Impact, Archivist)
- Phase-based generation: Genesis → Characters → Worldbuilding → Outlining → Drafting → Polish
- Real-time SSE streaming via Redis Streams
- Langfuse observability with Prompt Management

**Flow:**
1. POST /orchestrate/generate - Start generation (returns 202 + runId)
2. GET /orchestrate/stream/:runId - Subscribe to SSE events
3. GET /orchestrate/status/:runId - Check run status
4. POST /orchestrate/pause/:runId - Pause generation
5. POST /orchestrate/resume/:runId - Resume generation
6. POST /orchestrate/cancel/:runId - Cancel generation
`)
export class OrchestrationController {
  @Inject()
  private orchestrator: StorytellerOrchestrator;

  @Inject()
  private redisStreams: RedisStreamsService;

  /**
   * Start a new narrative generation
   */
  @Post("/generate")
  @Summary("Start narrative generation")
  @Description(`
Initiates a new narrative generation run. Returns immediately with a run ID.

**Important:** This is an async operation. Use the returned streamUrl to subscribe to real-time events.

**SSE Event Types:**
- \`generation_started\` - Generation has begun
- \`phase_start\` - New phase started (genesis, characters, etc.)
- \`phase_complete\` - Phase completed with artifacts
- \`agent_message\` - Agent produced output
- \`scene_draft_start\` - Scene drafting started
- \`scene_draft_complete\` - Scene draft ready
- \`ERROR\` - Terminal error (stop listening)
- \`generation_completed\` - All done
- \`heartbeat\` - Keep-alive (every 15s)
  `)
  @Returns(202, GenerateResponseDTO)
  @Returns(400)
  @Returns(500)
  async startGeneration(
    @BodyParams() @Groups("!internal") request: GenerateRequestDTO
  ): Promise<GenerateResponseDTO> {
    // Support both new TypeScript format and legacy Python format
    const projectId = request.projectId || request.supabase_project_id || `generated-${Date.now()}`;
    const seedIdea = request.seedIdea || request.seed_idea || "";
    const provider = request.llmConfig?.provider || request.provider as LLMProvider;
    const model = request.llmConfig?.model || request.model || "";
    const apiKey = request.llmConfig?.apiKey || request.api_key || "";
    const mode = request.mode || request.generation_mode || "full";

    // #region debug instrumentation
    fetch("http://127.0.0.1:7242/ingest/4ed3716a-6e81-4213-8ba0-e923964d0642", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-run",
        hypothesisId: "H1",
        location: "OrchestrationController.ts:startGeneration:entry",
        message: "startGeneration entry",
        data: {
          provider,
          model,
          mode,
          hasApiKey: !!apiKey,
          hasLlmConfig: !!request.llmConfig,
          bodyKeys: Object.keys(request || {}),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    // Force immediate output to ensure logs are visible
    process.stdout.write(`[OrchestrationController] startGeneration called, projectId: ${projectId}, provider: ${provider}\n`);
    $log.info(`[OrchestrationController] startGeneration called, projectId: ${projectId}, seedIdea: ${seedIdea?.substring(0, 50)}...`);
    
    const options: GenerationOptions = {
      projectId,
      seedIdea,
      llmConfig: {
        provider,
        model,
        apiKey,
        temperature: request.llmConfig?.temperature,
      },
      mode,
      settings: request.settings,
    };

    // #region debug instrumentation
    fetch("http://127.0.0.1:7242/ingest/4ed3716a-6e81-4213-8ba0-e923964d0642", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-run",
        hypothesisId: "H1",
        location: "OrchestrationController.ts:startGeneration:options",
        message: "startGeneration options",
        data: {
          projectId,
          mode,
          provider,
          model,
          hasApiKey: !!apiKey,
          hasSettings: !!options.settings,
          hasSeed: !!seedIdea,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    try {
      process.stdout.write(`[OrchestrationController] calling orchestrator.startGeneration, projectId: ${options.projectId}\n`);
      $log.info(`[OrchestrationController] startGeneration: calling orchestrator.startGeneration, projectId: ${options.projectId}`);
      const runId = await this.orchestrator.startGeneration(options);
      process.stdout.write(`[OrchestrationController] orchestrator.startGeneration returned runId: ${runId}\n`);
      $log.info(`[OrchestrationController] startGeneration: orchestrator.startGeneration returned runId: ${runId}`);

      return {
        runId,
        run_id: runId,
        success: true,
        message: "Generation started",
        streamUrl: `/stream/${runId}`,
      };
    } catch (error) {
      // #region debug instrumentation
      fetch("http://127.0.0.1:7242/ingest/4ed3716a-6e81-4213-8ba0-e923964d0642", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "pre-run",
          hypothesisId: "H2",
          location: "OrchestrationController.ts:startGeneration:error",
          message: "startGeneration error",
          data: {
            errorMessage: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw error;
    }
  }

  /**
   * SSE Stream endpoint for real-time events
   */
  @Get("/stream/:runId")
  @AcceptMime("text/event-stream", "application/json", "*/*")
  @Summary("Subscribe to generation events (SSE)")
  @Description(`
Server-Sent Events (SSE) endpoint for real-time generation updates.

**Connection Headers:**
\`\`\`
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no (for Nginx)
\`\`\`

**Event Format:**
\`\`\`
event: phase_start
data: {"phase": "genesis", "timestamp": "..."}

event: ERROR
data: {"error": "...", "phase": "drafting", "recoverable": false}
\`\`\`

**Important:**
- Heartbeat events sent every 15 seconds to prevent proxy timeouts
- Check for \`ERROR\` event type to detect failures
- \`generation_completed\` signals successful completion
  `)
  @Returns(200)
  @Returns(404)
  async streamEvents(
    @PathParams("runId") runId: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Check if run exists
    const status = this.orchestrator.getRunStatus(runId);
    if (!status) {
      res.status(404).json({ error: "Run not found" });
      return;
    }

    // Set SSE headers - HTTP/2 compatible (no Connection header!)
    // Connection header is forbidden in HTTP/2 and causes ERR_HTTP2_PROTOCOL_ERROR
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering
    res.setHeader("Content-Encoding", "identity"); // Prevent compression which breaks SSE
    res.flushHeaders();

    // Send initial connection event (no event: header so onmessage receives it)
    res.write(`data: ${JSON.stringify({ type: "connected", runId, status: status.phase })}\n\n`);

    // Handle client disconnect
    let isConnected = true;
    req.on("close", () => {
      isConnected = false;
    });

    // Set up heartbeat to prevent idle timeout (Cloudflare/nginx may close idle connections)
    const heartbeatInterval = setInterval(() => {
      if (isConnected) {
        res.write(`: heartbeat\n\n`); // SSE comment, ignored by EventSource but keeps connection alive
      }
    }, 15000); // Every 15 seconds

    // First, send all existing events from the stream (catch up)
    // Track the last event ID to avoid race condition when switching to live streaming
    const lastEventId = "0";
    try {
      const existingEvents = await this.redisStreams.getEvents(runId, "0", 1000);
      console.log(`[OrchestrationController] Sending ${existingEvents.length} existing events for runId: ${runId}`);
      const cinematicCount = existingEvents.filter(e => e.type === "agent_thought" || e.type === "agent_dialogue").length;
      console.log(`[OrchestrationController] Found ${cinematicCount} cinematic events in existing events`);
      for (const event of existingEvents) {
        if (!isConnected) break;
        
        // Log cinematic events
        if (event.type === "agent_thought" || event.type === "agent_dialogue") {
          console.log(`[OrchestrationController] Streaming existing cinematic event:`, event.type, `runId: ${runId}`, event.data);
        }
        
        // Send as generic message (no event: header) so onmessage receives it
        // The type is included in the data payload
        const sseData = JSON.stringify({
          id: event.id,
          type: event.type,
          runId: event.runId,
          timestamp: event.timestamp,
          data: event.data,
        });
        res.write(`data: ${sseData}\n\n`);
      }
    } catch (error) {
      console.error(`[OrchestrationController] Error getting existing events:`, error, error instanceof Error ? error.stack : '');
    }

    // Then stream new events from Redis (starting from the end)
    const eventGenerator = this.redisStreams.streamEvents(runId, "$", 15000);

    try {
      for await (const event of eventGenerator) {
        if (!isConnected) break;

        // Log cinematic events
        if (event.type === "agent_thought" || event.type === "agent_dialogue") {
          console.log(`[OrchestrationController] Streaming cinematic event:`, event.type, `runId: ${runId}`, event.data);
        }

        // Format as SSE (no event: header so onmessage receives it)
        const sseData = JSON.stringify({
          id: event.id,
          type: event.type,
          runId: event.runId,
          timestamp: event.timestamp,
          data: event.data,
        });

        res.write(`data: ${sseData}\n\n`);

        // Stop streaming on terminal events
        if (event.type === "ERROR" || event.type === "generation_completed") {
          break;
        }
      }
    } catch (error) {
      if (isConnected) {
        res.write(`data: ${JSON.stringify({ type: "ERROR", error: String(error) })}\n\n`);
      }
    } finally {
      clearInterval(heartbeatInterval);
      res.end();
    }
  }

  /**
   * SSE Stream endpoint (legacy route for Python orchestrator compatibility)
   */
  @Get("/runs/:runId/events")
  @AcceptMime("text/event-stream", "application/json", "*/*")
  @Summary("Subscribe to generation events (SSE) - legacy route")
  @Description("Legacy route for Python orchestrator compatibility.")
  @Returns(200, SSEEventDTO)
  @Returns(404)
  async streamEventsLegacy(
    @PathParams("runId") runId: string,
    @QueryParams("token") token: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Delegate to the main streamEvents method
    return this.streamEvents(runId, req, res);
  }

  /**
   * Get run status
   */
  @Get("/status/:runId")
  @Summary("Get generation run status")
  @Description("Returns the current status of a generation run including phase, progress, and any errors.")
  @Returns(200, RunStatusDTO)
  @Returns(404)
  getStatus(
    @PathParams("runId") runId: string
  ): RunStatusDTO | { error: string } {
    const status = this.orchestrator.getRunStatus(runId);
    
    if (!status) {
      return { error: "Run not found" };
    }

    return status;
  }

  /**
   * Pause a running generation
   */
  @Post("/pause/:runId")
  @Summary("Pause generation")
  @Description("Pauses an active generation run. Can be resumed later.")
  @Returns(200)
  @Returns(404)
  pauseRun(
    @PathParams("runId") runId: string
  ): { success: boolean; message: string } {
    const success = this.orchestrator.pauseRun(runId);
    
    return {
      success,
      message: success ? "Run paused" : "Run not found",
    };
  }

  /**
   * Resume a paused generation
   */
  @Post("/resume/:runId")
  @Summary("Resume generation")
  @Description("Resumes a paused generation run.")
  @Returns(200)
  @Returns(404)
  resumeRun(
    @PathParams("runId") runId: string
  ): { success: boolean; message: string } {
    const success = this.orchestrator.resumeRun(runId);
    
    return {
      success,
      message: success ? "Run resumed" : "Run not found",
    };
  }

  /**
   * Cancel a generation
   */
  @Post("/cancel/:runId")
  @Summary("Cancel generation")
  @Description("Cancels an active generation run. This action cannot be undone.")
  @Returns(200)
  @Returns(404)
  cancelRun(
    @PathParams("runId") runId: string
  ): { success: boolean; message: string } {
    const success = this.orchestrator.cancelRun(runId);
    
    return {
      success,
      message: success ? "Run cancelled" : "Run not found",
    };
  }

  /**
   * Pause a running generation (legacy route)
   */
  @Post("/runs/:runId/pause")
  @Summary("Pause generation (legacy)")
  @Description("Legacy route for Python orchestrator compatibility.")
  @Returns(200)
  @Returns(404)
  pauseRunLegacy(
    @PathParams("runId") runId: string
  ): { success: boolean; message: string } {
    return this.pauseRun(runId);
  }

  /**
   * Resume a paused generation (legacy route)
   */
  @Post("/runs/:runId/resume")
  @Summary("Resume generation (legacy)")
  @Description("Legacy route for Python orchestrator compatibility.")
  @Returns(200)
  @Returns(404)
  resumeRunLegacy(
    @PathParams("runId") runId: string
  ): { success: boolean; message: string } {
    return this.resumeRun(runId);
  }

  /**
   * List all active runs
   */
  @Get("/runs")
  @Summary("List active generation runs")
  @Description("Returns a list of all currently active generation runs.")
  @Returns(200, Array)
  listRuns(): RunStatus[] {
    return this.orchestrator.listActiveRuns();
  }
}
