import { Controller, Get, PathParams, Res, Req } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { Request, Response } from "express";
import Redis from "ioredis";

interface StreamEvent {
  id: string;
  type: string;
  runId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

@Controller("/events")
@Tags("Events")
@Description("Server-Sent Events for real-time updates")
export class EventsController {
  private redisClient: Redis | null = null;

  constructor() {
    this.connect();
  }

  private connect(): void {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.redisClient = new Redis(redisUrl);

    this.redisClient.on("error", (err) => {
      console.error("Redis connection error (Events):", err);
    });
  }

  private getClient(): Redis {
    if (!this.redisClient) {
      throw new Error("Redis client not initialized");
    }
    return this.redisClient;
  }

  @Get("/runs/:runId")
  @Summary("Stream events for a generation run")
  @Description("Server-Sent Events endpoint for real-time generation progress")
  async streamEvents(
    @PathParams("runId") runId: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    const client = this.getClient();
    const streamKey = `manoe:events:${runId}`;
    let lastId = "$"; // Start from new events only
    let isConnected = true;

    // Send initial connection event
    this.sendEvent(res, {
      id: "connected",
      type: "connected",
      runId,
      timestamp: new Date().toISOString(),
      data: { message: "Connected to event stream" },
    });

    // Handle client disconnect
    req.on("close", () => {
      isConnected = false;
      console.log(`SSE client disconnected for run: ${runId}`);
    });

    // Poll for new events
    const pollInterval = 1000; // 1 second
    const heartbeatInterval = 15000; // 15 seconds
    let lastHeartbeat = Date.now();

    while (isConnected) {
      try {
        // Read new events from stream
        const entries = await client.xread(
          "BLOCK",
          pollInterval.toString(),
          "STREAMS",
          streamKey,
          lastId
        );

        if (entries && entries.length > 0) {
          for (const [, streamEntries] of entries) {
            for (const [entryId, fields] of streamEntries as [string, string[]][]) {
              lastId = entryId;

              // Parse fields array into object
              const fieldObj: Record<string, string> = {};
              for (let i = 0; i < fields.length; i += 2) {
                fieldObj[fields[i]] = fields[i + 1];
              }

              const event: StreamEvent = {
                id: entryId,
                type: fieldObj.type || "unknown",
                runId: fieldObj.run_id || runId,
                timestamp: fieldObj.timestamp || new Date().toISOString(),
                data: fieldObj.data ? JSON.parse(fieldObj.data) : {},
              };

              this.sendEvent(res, event);

              // Check for completion events
              if (
                event.type === "generation_complete" ||
                event.type === "generation_error" ||
                event.type === "phase_complete" && event.data.phase === "drafting"
              ) {
                // Send final event and close
                this.sendEvent(res, {
                  id: "stream_end",
                  type: "stream_end",
                  runId,
                  timestamp: new Date().toISOString(),
                  data: { message: "Generation complete" },
                });
                isConnected = false;
                break;
              }
            }
          }
        }

        // Send heartbeat if needed
        if (Date.now() - lastHeartbeat > heartbeatInterval) {
          this.sendEvent(res, {
            id: "heartbeat",
            type: "heartbeat",
            runId,
            timestamp: new Date().toISOString(),
            data: {},
          });
          lastHeartbeat = Date.now();
        }
      } catch (error) {
        console.error(`Error reading stream for run ${runId}:`, error);
        
        // Send error event
        this.sendEvent(res, {
          id: "error",
          type: "error",
          runId,
          timestamp: new Date().toISOString(),
          data: { error: String(error) },
        });

        // Wait before retrying
        await this.sleep(1000);
      }
    }

    res.end();
  }

  @Get("/runs/:runId/history")
  @Summary("Get event history for a run")
  @Description("Retrieve all past events for a generation run")
  @Returns(200)
  async getEventHistory(
    @PathParams("runId") runId: string
  ): Promise<{ events: StreamEvent[] }> {
    const client = this.getClient();
    const streamKey = `manoe:events:${runId}`;

    try {
      const entries = await client.xrange(streamKey, "-", "+", "COUNT", "1000");

      const events: StreamEvent[] = entries.map(([entryId, fields]) => {
        // Parse fields array into object
        const fieldObj: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
          fieldObj[fields[i]] = fields[i + 1];
        }

        return {
          id: entryId,
          type: fieldObj.type || "unknown",
          runId: fieldObj.run_id || runId,
          timestamp: fieldObj.timestamp || "",
          data: fieldObj.data ? JSON.parse(fieldObj.data) : {},
        };
      });

      return { events };
    } catch (error) {
      console.error(`Error getting history for run ${runId}:`, error);
      return { events: [] };
    }
  }

  @Get("/health")
  @Summary("Check events service health")
  @Returns(200)
  async healthCheck(): Promise<{ status: string; redis: string }> {
    try {
      const client = this.getClient();
      await client.ping();
      return { status: "healthy", redis: "connected" };
    } catch (error) {
      return { status: "unhealthy", redis: "disconnected" };
    }
  }

  private sendEvent(res: Response, event: StreamEvent): void {
    res.write(`id: ${event.id}\n`);
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
