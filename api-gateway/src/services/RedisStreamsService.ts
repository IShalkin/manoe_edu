/**
 * ============================================================================
 * REDIS STREAMS SERVICE
 * ============================================================================
 * 
 * This service provides REAL-TIME EVENT STREAMING using Redis Streams.
 * It's the communication backbone that enables the "Glass Brain" UI where
 * users can watch AI agents think and collaborate in real-time.
 * 
 * WHY REDIS STREAMS?
 * ------------------
 * Redis Streams is a log-like data structure that's perfect for event streaming:
 *   - PERSISTENT: Events are stored, not just broadcast (unlike Pub/Sub)
 *   - ORDERED: Events have unique IDs with timestamps
 *   - REPLAYABLE: Clients can read from any point in the stream
 *   - SCALABLE: Consumer groups allow multiple readers
 * 
 * HOW IT WORKS:
 * -------------
 * 
 *   1. PUBLISHING EVENTS
 *      When something happens in the orchestrator (phase starts, agent completes, etc.),
 *      it calls publishEvent() which adds the event to a Redis Stream.
 *      
 *      Example: publishEvent(runId, "phase_start", { phase: "genesis" })
 *      
 *      This creates an entry in the stream "manoe:events:{runId}" with:
 *        - Unique ID (timestamp-based)
 *        - Event type
 *        - JSON data payload
 *        - Timestamp
 * 
 *   2. STREAMING TO CLIENTS
 *      The OrchestrationController has an SSE endpoint that uses streamEvents()
 *      to read events and send them to the browser.
 *      
 *      streamEvents() is an ASYNC GENERATOR that:
 *        - Blocks waiting for new events (XREAD BLOCK)
 *        - Yields events as they arrive
 *        - Sends heartbeats if no events (keeps connection alive)
 * 
 *   3. STREAM MANAGEMENT
 *      - Streams are automatically trimmed to prevent unbounded growth (MAXLEN ~1000)
 *      - Each run has its own stream for isolation
 *      - Global stream for monitoring all runs
 * 
 * STREAM NAMING:
 * --------------
 *   - Run-specific: "manoe:events:{runId}" - Events for a single generation run
 *   - Global: "manoe:events:global" - All events (for monitoring/debugging)
 * 
 * EVENT STRUCTURE:
 * ----------------
 *   {
 *     id: string,           // Redis Stream entry ID (e.g., "1703123456789-0")
 *     type: string,         // Event type (e.g., "phase_start", "agent_complete")
 *     runId: string,        // Generation run ID
 *     timestamp: string,    // ISO timestamp
 *     data: object          // Event-specific payload
 *   }
 * 
 * COMMON EVENT TYPES:
 * -------------------
 *   - "phase_start" / "phase_complete" - Phase transitions
 *   - "agent_start" / "agent_complete" - Agent activity
 *   - "agent_thought" - Cinematic thought bubble (Glass Brain)
 *   - "agent_dialogue" - Agent-to-agent communication
 *   - "scene_draft_start" / "scene_draft_complete" - Scene progress
 *   - "generation_completed" - Run finished successfully
 *   - "ERROR" - Terminal error occurred
 *   - "heartbeat" - Keep-alive (no actual event)
 * 
 * CONNECTION FLOW:
 * ----------------
 *   Browser → SSE Request → OrchestrationController → streamEvents()
 *                                                          ↓
 *                                                    XREAD BLOCK
 *                                                          ↓
 *                                                    Redis Stream
 *                                                          ↑
 *   StorytellerOrchestrator → publishEvent() → XADD → Redis Stream
 * 
 * CONSUMER GROUPS (ADVANCED):
 * ---------------------------
 * For scenarios where multiple consumers need to process events:
 *   - createConsumerGroup() creates a consumer group
 *   - Each consumer gets unique events (load balancing)
 *   - Useful for scaling event processing
 * 
 * @see StorytellerOrchestrator.ts for event publishing
 * @see OrchestrationController.ts for SSE endpoint
 * @see useGenerationStream.ts (frontend) for event consumption
 */

import { Service } from "@tsed/di";
import Redis from "ioredis";

/**
 * Event structure for Redis Streams
 */
export interface StreamEvent {
  id: string;
  type: string;
  runId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Stream information
 */
export interface StreamInfo {
  length: number;
  firstEntry?: unknown;
  lastEntry?: unknown;
  groups?: number;
  exists: boolean;
}

@Service()
export class RedisStreamsService {
  private client: Redis | null = null;

  // Stream name templates
  private readonly STREAM_EVENTS = "manoe:events:{runId}";
  private readonly STREAM_GLOBAL = "manoe:events:global";

  // Consumer group
  private readonly CONSUMER_GROUP = "manoe-consumers";

  constructor() {
    this.connect();
  }

  /**
   * Establish connection to Redis
   */
  private connect(): void {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    this.client.on("error", (err) => {
      console.error("Redis Streams connection error:", err);
    });

    this.client.on("connect", () => {
      console.log("Redis Streams connected");
    });
  }

  /**
   * Get Redis client
   */
  private getClient(): Redis {
    if (!this.client) {
      throw new Error("Redis client not initialized");
    }
    return this.client;
  }

  /**
   * Get the stream key for a specific run
   */
  private getStreamKey(runId: string): string {
    return this.STREAM_EVENTS.replace("{runId}", runId);
  }

  /**
   * Publish an event to a run-specific stream
   * 
   * @param runId - Unique identifier for the generation run
   * @param eventType - Type of event (e.g., "phase_start", "agent_complete")
   * @param data - Event data payload
   * @param maxlen - Maximum stream length (older events are trimmed)
   * @returns The stream entry ID
   */
  async publishEvent(
    runId: string,
    eventType: string,
    data: Record<string, unknown>,
    maxlen: number = 1000
  ): Promise<string> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    const event = {
      type: eventType,
      runId: runId,
      timestamp: new Date().toISOString(),
      data: JSON.stringify(data),
    };

    // Add to run-specific stream with MAXLEN for automatic trimming
    const entryId = await client.xadd(
      streamKey,
      "MAXLEN",
      "~",
      maxlen.toString(),
      "*",
      ...Object.entries(event).flat()
    );

    // Also add to global stream for monitoring
    await client.xadd(
      this.STREAM_GLOBAL,
      "MAXLEN",
      "~",
      (maxlen * 10).toString(),
      "*",
      ...Object.entries(event).flat()
    );

    return entryId ?? "";
  }

  /**
   * Get events from a run-specific stream
   * 
   * @param runId - Unique identifier for the generation run
   * @param startId - Start reading from this ID (exclusive)
   * @param count - Maximum number of events to return
   * @returns List of events with their IDs
   */
  async getEvents(
    runId: string,
    startId: string = "0",
    count: number = 100
  ): Promise<StreamEvent[]> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const entries = await client.xrange(
        streamKey,
        startId === "0" ? "-" : `(${startId}`,
        "+",
        "COUNT",
        count.toString()
      );

      return entries.map(([id, fields]) => this.parseStreamEntry(id, fields));
    } catch (error) {
      console.error("Error getting events:", error);
      return [];
    }
  }

  /**
   * Stream events from a run-specific stream (async generator)
   * 
   * @param runId - Unique identifier for the generation run
   * @param startId - Start reading from this ID ("$" for new events only)
   * @param blockMs - Block timeout in milliseconds
   */
  async *streamEvents(
    runId: string,
    startId: string = "$",
    blockMs: number = 5000
  ): AsyncGenerator<StreamEvent, void, unknown> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    let lastId = startId;

    while (true) {
      try {
        const entries = await client.call(
          "XREAD",
          "BLOCK",
          blockMs.toString(),
          "COUNT",
          "10",
          "STREAMS",
          streamKey,
          lastId
        ) as Array<[string, Array<[string, string[]]>]> | null;

        if (entries && entries.length > 0) {
          for (const [, streamEntries] of entries) {
            for (const [entryId, fields] of streamEntries) {
              lastId = entryId;
              yield this.parseStreamEntry(entryId, fields);
            }
          }
        } else {
          // No new events, yield heartbeat
          yield {
            id: "heartbeat",
            type: "heartbeat",
            runId: runId,
            timestamp: new Date().toISOString(),
            data: {},
          };
        }
      } catch (error) {
        if ((error as Error).message?.includes("NOGROUP")) {
          break;
        }
        // Log error and yield error event
        yield {
          id: "error",
          type: "error",
          runId: runId,
          timestamp: new Date().toISOString(),
          data: { error: String(error) },
        };
        await this.sleep(1000);
      }
    }
  }

  /**
   * Create a consumer group for a stream
   * 
   * @param runId - Unique identifier for the generation run
   * @param groupName - Consumer group name (defaults to CONSUMER_GROUP)
   * @returns True if created, False if already exists
   */
  async createConsumerGroup(
    runId: string,
    groupName?: string
  ): Promise<boolean> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    const group = groupName ?? this.CONSUMER_GROUP;

    try {
      await client.xgroup("CREATE", streamKey, group, "0", "MKSTREAM");
      return true;
    } catch (error) {
      if ((error as Error).message?.includes("BUSYGROUP")) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get information about a stream
   * 
   * @param runId - Unique identifier for the generation run
   * @returns Stream information including length, groups, etc.
   */
  async getStreamInfo(runId: string): Promise<StreamInfo> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const info = await client.xinfo("STREAM", streamKey) as unknown[];
      const infoObj = this.parseXInfoResponse(info);
      
      return {
        length: typeof infoObj.length === "number" ? infoObj.length : 0,
        firstEntry: infoObj["first-entry"],
        lastEntry: infoObj["last-entry"],
        groups: typeof infoObj.groups === "number" ? infoObj.groups : 0,
        exists: true,
      };
    } catch (error) {
      return { length: 0, exists: false };
    }
  }

  /**
   * Delete a stream and all its data
   * 
   * @param runId - Unique identifier for the generation run
   * @returns True if deleted
   */
  async deleteStream(runId: string): Promise<boolean> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    const result = await client.del(streamKey);
    return result > 0;
  }

  /**
   * Trim a stream to a maximum length
   * 
   * @param runId - Unique identifier for the generation run
   * @param maxlen - Maximum number of entries to keep
   * @returns Number of entries removed
   */
  async trimStream(runId: string, maxlen: number = 1000): Promise<number> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);
    return await client.xtrim(streamKey, "MAXLEN", "~", maxlen);
  }

  /**
   * Check if a run exists (has events)
   */
  async runExists(runId: string): Promise<boolean> {
    const info = await this.getStreamInfo(runId);
    return info.exists && info.length > 0;
  }

  /**
   * Get the last event for a run
   */
  async getLastEvent(runId: string): Promise<StreamEvent | null> {
    const client = this.getClient();
    const streamKey = this.getStreamKey(runId);

    try {
      const entries = await client.xrevrange(streamKey, "+", "-", "COUNT", "1");
      if (entries.length > 0) {
        const [id, fields] = entries[0];
        return this.parseStreamEntry(id, fields);
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse a stream entry into a StreamEvent
   */
  private parseStreamEntry(id: string, fields: string[]): StreamEvent {
    const fieldMap: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      fieldMap[fields[i]] = fields[i + 1];
    }

    return {
      id,
      type: fieldMap.type ?? "unknown",
      runId: fieldMap.runId ?? "",
      timestamp: fieldMap.timestamp ?? new Date().toISOString(),
      data: fieldMap.data ? JSON.parse(fieldMap.data) : {},
    };
  }

  /**
   * Parse XINFO response into an object
   */
  private parseXInfoResponse(info: unknown[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (let i = 0; i < info.length; i += 2) {
      result[String(info[i])] = info[i + 1];
    }
    return result;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
