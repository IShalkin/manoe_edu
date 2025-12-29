/**
 * Redis Streams Service for MANOE
 * Provides reliable event streaming using Redis Streams for real-time updates
 * 
 * Features:
 * - Reliable event delivery with consumer groups
 * - Real-time event streaming to SSE endpoints
 * - Event persistence and replay capability
 * - Heartbeat support for connection keep-alive
 * 
 * IMPORTANT: Uses separate Redis connections for reading and writing to avoid
 * head-of-line blocking. XREAD BLOCK commands on a shared connection would
 * block all other commands (including XADD publishes) until the block times out.
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
  // Dedicated writer client - never blocked by XREAD
  private writerClient: Redis | null = null;
  
  // Redis URL for creating reader connections
  private redisUrl: string = "";
  
  // Legacy alias for backward compatibility
  private get client(): Redis | null {
    return this.writerClient;
  }

  // Stream name templates
  private readonly STREAM_EVENTS = "manoe:events:{runId}";
  private readonly STREAM_GLOBAL = "manoe:events:global";

  // Consumer group
  private readonly CONSUMER_GROUP = "manoe-consumers";

  constructor() {
    this.connect();
  }

  /**
   * Establish connection to Redis (writer client only)
   * Reader connections are created per-stream to avoid head-of-line blocking
   */
  private connect(): void {
    this.redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.writerClient = new Redis(this.redisUrl);

    this.writerClient.on("error", (err) => {
      console.error("Redis Streams writer connection error:", err);
    });

    this.writerClient.on("connect", () => {
      console.log("Redis Streams writer connected");
    });
  }

  /**
   * Get the writer Redis client (for XADD, XRANGE, etc.)
   * This client is never blocked by XREAD operations
   */
  private getClient(): Redis {
    if (!this.writerClient) {
      throw new Error("Redis writer client not initialized");
    }
    return this.writerClient;
  }
  
  /**
   * Create a dedicated reader connection for streaming
   * Each SSE connection gets its own reader to avoid blocking other operations
   */
  private createReaderConnection(): Redis {
    const reader = new Redis(this.redisUrl);
    reader.on("error", (err) => {
      console.error("Redis Streams reader connection error:", err);
    });
    return reader;
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
   * IMPORTANT: Creates a dedicated Redis connection for this stream to avoid
   * head-of-line blocking. The XREAD BLOCK command would otherwise block all
   * other Redis operations on a shared connection (including XADD publishes).
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
    // Create a dedicated reader connection for this stream
    // This prevents XREAD BLOCK from blocking XADD operations on the writer
    const readerClient = this.createReaderConnection();
    const streamKey = this.getStreamKey(runId);
    let lastId = startId;

    try {
      while (true) {
        try {
          const entries = await readerClient.call(
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
    } finally {
      // Clean up the dedicated reader connection when the generator ends
      // This happens when the SSE connection closes or the generator is stopped
      try {
        await readerClient.quit();
      } catch (e) {
        // Ignore cleanup errors
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
   * Disconnect from Redis (writer client)
   * Note: Reader connections are cleaned up automatically when their generators end
   */
  async disconnect(): Promise<void> {
    if (this.writerClient) {
      await this.writerClient.quit();
      this.writerClient = null;
    }
  }
}
