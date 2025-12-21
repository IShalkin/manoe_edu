/**
 * State Graph Model
 * 
 * Defines the state machine for narrative generation workflow
 */

import { GenerationPhase } from "./LLMModels";
import { AgentType } from "./AgentModels";

/**
 * State node in the generation graph
 */
export interface StateNode {
  id: string;
  phase: GenerationPhase;
  status: "pending" | "active" | "completed" | "failed";
  agent: AgentType;
  transitions: StateTransition[];
}

/**
 * State transition condition
 */
export interface StateTransition {
  to: string;
  condition?: string; // e.g., "revision_needed === false"
}

/**
 * Generation state graph
 * Defines all possible states and transitions in the generation workflow
 */
export const GENERATION_GRAPH: StateNode[] = [
  {
    id: "genesis",
    phase: GenerationPhase.GENESIS,
    status: "pending",
    agent: AgentType.ARCHITECT,
    transitions: [{ to: "characters" }],
  },
  {
    id: "characters",
    phase: GenerationPhase.CHARACTERS,
    status: "pending",
    agent: AgentType.PROFILER,
    transitions: [{ to: "narrator" }],
  },
  {
    id: "narrator",
    phase: GenerationPhase.NARRATOR_DESIGN,
    status: "pending",
    agent: AgentType.PROFILER,
    transitions: [{ to: "worldbuilding" }],
  },
  {
    id: "worldbuilding",
    phase: GenerationPhase.WORLDBUILDING,
    status: "pending",
    agent: AgentType.WORLDBUILDER,
    transitions: [{ to: "outlining" }],
  },
  {
    id: "outlining",
    phase: GenerationPhase.OUTLINING,
    status: "pending",
    agent: AgentType.STRATEGIST,
    transitions: [{ to: "advanced_planning" }],
  },
  {
    id: "advanced_planning",
    phase: GenerationPhase.ADVANCED_PLANNING,
    status: "pending",
    agent: AgentType.STRATEGIST,
    transitions: [{ to: "drafting" }],
  },
  {
    id: "drafting",
    phase: GenerationPhase.DRAFTING,
    status: "pending",
    agent: AgentType.WRITER,
    transitions: [{ to: "critique" }],
  },
  {
    id: "critique",
    phase: GenerationPhase.CRITIQUE,
    status: "pending",
    agent: AgentType.CRITIC,
    transitions: [
      { to: "revision", condition: "revision_needed === true" },
      { to: "originality", condition: "revision_needed === false" },
    ],
  },
  {
    id: "revision",
    phase: GenerationPhase.REVISION,
    status: "pending",
    agent: AgentType.WRITER,
    transitions: [{ to: "critique" }], // Loop back to critique
  },
  {
    id: "originality",
    phase: GenerationPhase.ORIGINALITY_CHECK,
    status: "pending",
    agent: AgentType.ORIGINALITY,
    transitions: [{ to: "impact" }],
  },
  {
    id: "impact",
    phase: GenerationPhase.IMPACT_ASSESSMENT,
    status: "pending",
    agent: AgentType.IMPACT,
    transitions: [{ to: "polish" }],
  },
  {
    id: "polish",
    phase: GenerationPhase.POLISH,
    status: "pending",
    agent: AgentType.WRITER,
    transitions: [], // Terminal state
  },
];

/**
 * Get state node by ID
 */
export function getStateNode(id: string): StateNode | undefined {
  return GENERATION_GRAPH.find((node) => node.id === id);
}

/**
 * Get state node by phase
 */
export function getStateNodeByPhase(phase: GenerationPhase): StateNode | undefined {
  return GENERATION_GRAPH.find((node) => node.phase === phase);
}

/**
 * Get next possible states from current state
 */
export function getNextStates(currentStateId: string, context?: Record<string, unknown>): StateNode[] {
  const currentNode = getStateNode(currentStateId);
  if (!currentNode) return [];

  const nextStates: StateNode[] = [];

  for (const transition of currentNode.transitions) {
    // Evaluate condition if present
    if (transition.condition && context) {
      try {
        // Simple condition evaluation (in production, use a proper expression evaluator)
        const conditionResult = evaluateCondition(transition.condition, context);
        if (conditionResult) {
          const nextNode = getStateNode(transition.to);
          if (nextNode) nextStates.push(nextNode);
        }
      } catch (error) {
        console.warn(`Failed to evaluate condition: ${transition.condition}`, error);
      }
    } else {
      // No condition, always transition
      const nextNode = getStateNode(transition.to);
      if (nextNode) nextStates.push(nextNode);
    }
  }

  return nextStates;
}

/**
 * Simple condition evaluator
 * Supports: ===, !==, === true, === false
 */
function evaluateCondition(condition: string, context: Record<string, unknown>): boolean {
  // Remove whitespace
  const clean = condition.trim();

  // Handle === true / === false
  if (clean.endsWith("=== true")) {
    const key = clean.replace("=== true", "").trim();
    return context[key] === true;
  }
  if (clean.endsWith("=== false")) {
    const key = clean.replace("=== false", "").trim();
    return context[key] === false;
  }

  // Handle === / !==
  if (clean.includes("===")) {
    const [key, value] = clean.split("===").map((s) => s.trim());
    return context[key] === value;
  }
  if (clean.includes("!==")) {
    const [key, value] = clean.split("!==").map((s) => s.trim());
    return context[key] !== value;
  }

  // Default: check if key exists and is truthy
  return Boolean(context[clean]);
}

