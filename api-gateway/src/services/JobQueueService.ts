import { Service } from "@tsed/di";
import Redis from "ioredis";

interface JobPayload {
  jobId: string;
  projectId: string;
  phase: string;
  inputData: Record<string, unknown>;
  createdAt?: string;
  retryCount?: number;
  maxRetries?: number;
}

@Service()
export class JobQueueService {
  private client: Redis | null = null;

  // Queue names
  private readonly QUEUE_PENDING = "manoe:jobs:pending";
  private readonly QUEUE_PROCESSING = "manoe:jobs:processing";
  private readonly QUEUE_COMPLETED = "manoe:jobs:completed";
  private readonly QUEUE_FAILED = "manoe:jobs:failed";

  // Pub/Sub channels
  private readonly CHANNEL_PROJECT = "manoe:events:project";
  private readonly CHANNEL_GENERATION = "manoe:events:generation";

  constructor() {
    this.connect();
  }

  private connect(): void {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.client = new Redis(redisUrl);

    this.client.on("error", (err) => {
      console.error("Redis connection error:", err);
    });

    this.client.on("connect", () => {
      console.log("Connected to Redis");
    });
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new Error("Redis client not initialized");
    }
    return this.client;
  }

  async ping(): Promise<string> {
    return await this.getClient().ping();
  }

  async enqueueJob(job: JobPayload): Promise<string> {
    const client = this.getClient();

    const jobData: JobPayload = {
      ...job,
      createdAt: new Date().toISOString(),
      retryCount: job.retryCount || 0,
      maxRetries: job.maxRetries || 3,
    };

    await client.lpush(this.QUEUE_PENDING, JSON.stringify(jobData));

    // Publish event
    await this.publishEvent(this.CHANNEL_PROJECT, {
      type: "job_enqueued",
      jobId: job.jobId,
      projectId: job.projectId,
      phase: job.phase,
      timestamp: new Date().toISOString(),
    });

    return job.jobId;
  }

  async getJobStatus(jobId: string): Promise<{
    status: string;
    result?: unknown;
  }> {
    const client = this.getClient();

    // Check if completed
    const resultKey = `manoe:results:${jobId}`;
    const result = await client.get(resultKey);
    if (result) {
      return {
        status: "completed",
        result: JSON.parse(result),
      };
    }

    // Check if in processing
    const processing = await client.lrange(this.QUEUE_PROCESSING, 0, -1);
    for (const item of processing) {
      const job = JSON.parse(item) as JobPayload;
      if (job.jobId === jobId) {
        return { status: "processing" };
      }
    }

    // Check if pending
    const pending = await client.lrange(this.QUEUE_PENDING, 0, -1);
    for (const item of pending) {
      const job = JSON.parse(item) as JobPayload;
      if (job.jobId === jobId) {
        return { status: "pending" };
      }
    }

    // Check if failed
    const failed = await client.lrange(this.QUEUE_FAILED, 0, -1);
    for (const item of failed) {
      const failure = JSON.parse(item);
      if (failure.jobId === jobId) {
        return {
          status: "failed",
          result: { error: failure.error },
        };
      }
    }

    return { status: "not_found" };
  }

  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const client = this.getClient();

    return {
      pending: await client.llen(this.QUEUE_PENDING),
      processing: await client.llen(this.QUEUE_PROCESSING),
      completed: await client.llen(this.QUEUE_COMPLETED),
      failed: await client.llen(this.QUEUE_FAILED),
    };
  }

  async publishEvent(channel: string, event: Record<string, unknown>): Promise<void> {
    const client = this.getClient();
    await client.publish(channel, JSON.stringify(event));
  }

  async subscribe(
    channels: string[],
    callback: (channel: string, message: Record<string, unknown>) => void
  ): Promise<void> {
    const subscriber = this.getClient().duplicate();

    await subscriber.subscribe(...channels);

    subscriber.on("message", (channel, message) => {
      callback(channel, JSON.parse(message));
    });
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
