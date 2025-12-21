/**
 * Traces Controller
 * 
 * Provides API endpoints for querying Langfuse traces
 */

import { Controller, Get, PathParams } from "@tsed/common";
import { Inject } from "@tsed/di";
import { LangfuseService } from "../services/LangfuseService";

/**
 * Trace tree node
 */
interface TraceTreeNode {
  id: string;
  name: string;
  type: "trace" | "span" | "generation";
  startTime: string;
  endTime?: string;
  latencyMs?: number;
  model?: string;
  provider?: string;
  input?: unknown;
  output?: unknown;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  children: TraceTreeNode[];
}

@Controller("/runs/:runId/traces")
export class TracesController {
  constructor(@Inject() private langfuse: LangfuseService) {}

  /**
   * Get trace tree for a run
   */
  @Get("/")
  async getTraces(@PathParams("runId") runId: string): Promise<TraceTreeNode | null> {
    // Note: This is a simplified implementation
    // In production, LangfuseService would need a method to fetch traces
    // For now, return a placeholder structure
    
    if (!this.langfuse.isEnabled) {
      return null;
    }

    // Build trace tree structure
    // This would typically fetch from Langfuse API
    const traceTree: TraceTreeNode = {
      id: runId,
      name: `Generation Run ${runId}`,
      type: "trace",
      startTime: new Date().toISOString(),
      children: [],
    };

    return traceTree;
  }
}

