import { Controller, Get } from "@tsed/common";
import { Description, Returns, Summary, Tags } from "@tsed/schema";
import { Inject } from "@tsed/di";
import { JobQueueService } from "../services/JobQueueService";
import { SupabaseService } from "../services/SupabaseService";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  services: {
    api: ServiceStatus;
    redis: ServiceStatus;
    supabase: ServiceStatus;
    qdrant: ServiceStatus;
  };
}

interface ServiceStatus {
  status: "up" | "down" | "unknown";
  latencyMs?: number;
  error?: string;
}

@Controller("/health")
@Tags("Health")
@Description("Health check endpoints")
export class HealthController {
  @Inject()
  private jobQueueService: JobQueueService;

  @Inject()
  private supabaseService: SupabaseService;

  @Get("/")
  @Summary("Basic health check")
  @Description("Returns basic health status")
  @Returns(200)
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("/detailed")
  @Summary("Detailed health check")
  @Description("Returns detailed health status including all services")
  @Returns(200)
  async detailedHealthCheck(): Promise<HealthStatus> {
    const services = {
      api: { status: "up" as const },
      redis: await this.checkRedis(),
      supabase: await this.checkSupabase(),
      qdrant: await this.checkQdrant(),
    };

    const allUp = Object.values(services).every((s) => s.status === "up");
    const anyDown = Object.values(services).some((s) => s.status === "down");

    return {
      status: allUp ? "healthy" : anyDown ? "unhealthy" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "0.1.0",
      services,
    };
  }

  @Get("/ready")
  @Summary("Readiness check")
  @Description("Check if the service is ready to accept traffic")
  @Returns(200)
  @Returns(503)
  async readinessCheck(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const checks = {
      redis: (await this.checkRedis()).status === "up",
      supabase: (await this.checkSupabase()).status === "up",
    };

    const ready = Object.values(checks).every((c) => c);

    if (!ready) {
      throw new Error("Service not ready");
    }

    return { ready, checks };
  }

  @Get("/live")
  @Summary("Liveness check")
  @Description("Check if the service is alive")
  @Returns(200)
  async livenessCheck(): Promise<{ alive: boolean }> {
    return { alive: true };
  }

  private async checkRedis(): Promise<ServiceStatus> {
    try {
      const start = Date.now();
      await this.jobQueueService.ping();
      return {
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkSupabase(): Promise<ServiceStatus> {
    try {
      const start = Date.now();
      await this.supabaseService.healthCheck();
      return {
        status: "up",
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: "down",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async checkQdrant(): Promise<ServiceStatus> {
    // Qdrant is accessed through the orchestrator
    // For now, return unknown status
    return {
      status: "unknown",
    };
  }
}
