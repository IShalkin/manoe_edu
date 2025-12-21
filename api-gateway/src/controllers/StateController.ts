/**
 * State Controller
 * 
 * Provides API endpoints for querying generation state graph
 */

import { Controller, Get, PathParams } from "@tsed/common";
import { Inject } from "@tsed/di";
import { StorytellerOrchestrator } from "../services/StorytellerOrchestrator";
import { GENERATION_GRAPH, getStateNodeByPhase, getNextStates } from "../models/StateGraph";
import { GenerationPhase } from "../models/LLMModels";

/**
 * State graph response
 */
interface StateGraphResponse {
  currentState: {
    id: string;
    phase: GenerationPhase;
    status: string;
    agent: string;
  };
  nextStates: Array<{
    id: string;
    phase: GenerationPhase;
    agent: string;
  }>;
  allStates: Array<{
    id: string;
    phase: GenerationPhase;
    status: string;
    agent: string;
  }>;
}

@Controller("/runs/:runId/state")
export class StateController {
  constructor(@Inject() private orchestrator: StorytellerOrchestrator) {}

  /**
   * Get current state graph for a run
   */
  @Get("/graph")
  async getStateGraph(@PathParams("runId") runId: string): Promise<StateGraphResponse> {
    const runStatus = this.orchestrator.getRunStatus(runId);
    if (!runStatus) {
      throw new Error(`Run ${runId} not found`);
    }

    const currentStateNode = getStateNodeByPhase(runStatus.phase);
    if (!currentStateNode) {
      throw new Error(`No state node found for phase: ${runStatus.phase}`);
    }

    // Build context for transition evaluation
    const state = this.orchestrator.getRunState(runId);
    const context: Record<string, unknown> = {
      revision_needed: false, // Default, will be updated from critique if available
    };

    // Get latest critique for current scene if available
    if (state && state.currentScene > 0) {
      const critiques = state.critiques.get(state.currentScene);
      if (critiques && critiques.length > 0) {
        const latestCritique = critiques[critiques.length - 1] as Record<string, unknown>;
        context.revision_needed = latestCritique.revision_needed ?? false;
      }
    }

    const nextStates = getNextStates(currentStateNode.id, context);

    // Build all states with their current status
    const allStates = GENERATION_GRAPH.map((node) => {
      let status: string = "pending";
      if (node.id === currentStateNode.id) {
        status = runStatus.isCompleted ? "completed" : runStatus.isPaused ? "pending" : "active";
      } else if (GENERATION_GRAPH.findIndex((n) => n.id === node.id) < GENERATION_GRAPH.findIndex((n) => n.id === currentStateNode.id)) {
        status = "completed";
      }

      return {
        id: node.id,
        phase: node.phase,
        status,
        agent: node.agent,
      };
    });

    return {
      currentState: {
        id: currentStateNode.id,
        phase: currentStateNode.phase,
        status: runStatus.isCompleted ? "completed" : runStatus.isPaused ? "pending" : "active",
        agent: currentStateNode.agent,
      },
      nextStates: nextStates.map((node) => ({
        id: node.id,
        phase: node.phase,
        agent: node.agent,
      })),
      allStates,
    };
  }
}

