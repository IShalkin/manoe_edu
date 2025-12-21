/**
 * ============================================================================
 * AGENT MODELS AND TYPES
 * ============================================================================
 * 
 * This file defines the TYPE SYSTEM for MANOE's multi-agent architecture.
 * It's the "contract" that all agents and services agree to follow.
 * 
 * WHAT'S IN THIS FILE:
 * --------------------
 * 
 *   1. AGENT TYPES (AgentType enum)
 *      The 9 specialized agents in the system:
 *      - ARCHITECT: Story structure and narrative design
 *      - PROFILER: Character creation and psychology
 *      - WORLDBUILDER: Setting and world details
 *      - STRATEGIST: Scene planning and pacing
 *      - WRITER: Prose generation
 *      - CRITIC: Quality evaluation and feedback
 *      - ORIGINALITY: Cliche detection and uniqueness
 *      - IMPACT: Emotional resonance assessment
 *      - ARCHIVIST: Constraint management and continuity
 * 
 *   2. MESSAGE TYPES (MessageType enum)
 *      How agents communicate with each other:
 *      - ARTIFACT: Sharing generated content
 *      - QUESTION: Asking for clarification
 *      - RESPONSE: Answering questions
 *      - OBJECTION: Disagreeing with something
 *      - APPROVAL: Approving content
 *      - REVISION_REQUEST: Asking for changes
 * 
 *   3. CINEMATIC EVENTS (AgentThoughtEvent, AgentDialogueEvent, etc.)
 *      Events for the "Glass Brain" UI visualization:
 *      - agent_thought: Internal thinking (thought bubbles)
 *      - agent_dialogue: Agent-to-agent communication
 *      - agent_conflict: Disagreements between agents
 *      - agent_consensus: Agreement reached
 * 
 *   4. KEY CONSTRAINTS (KeyConstraint class)
 *      Canonical facts that must be maintained for continuity:
 *      - Uses semantic keys (e.g., "hero_eye_color") not UUIDs
 *      - Includes source agent, scene number, timestamp
 *      - Optional reasoning field for Archivist decisions
 * 
 *   5. RAW FACTS (RawFact class)
 *      Unprocessed facts extracted from generated content:
 *      - Collected during scene generation
 *      - Processed by Archivist into Key Constraints
 *      - Append-only log for traceability
 * 
 *   6. GENERATION STATE (GenerationState class)
 *      The complete state of a generation run:
 *      - Current phase, project ID, run ID
 *      - Narrative, characters, worldbuilding, outline
 *      - Drafts, critiques, revision counts per scene
 *      - Key constraints and raw facts log
 *      - Pause/complete status, timestamps
 * 
 *   7. AGENT/PHASE CONFIGS
 *      Static configuration for agents and phases:
 *      - Which agents are active in which phases
 *      - Phase order and dependencies
 *      - Output artifact types
 * 
 * WHY THESE TYPES MATTER:
 * -----------------------
 * TypeScript's type system catches bugs at compile time:
 *   - Can't pass wrong agent type to a function
 *   - Can't forget required fields in state
 *   - IDE autocomplete shows available options
 * 
 * Ts.ED DECORATORS:
 * -----------------
 * Classes use Ts.ED schema decorators for validation:
 *   - @Required(): Field must be present
 *   - @Optional(): Field can be undefined
 *   - @Enum(): Must be one of enum values
 *   - @Property(): Include in serialization
 *   - @CollectionOf(): Array of specific type
 * 
 * These enable automatic request/response validation in controllers.
 * 
 * @see BaseAgent.ts for how agents use these types
 * @see StorytellerOrchestrator.ts for state management
 * @see RedisStreamsService.ts for event publishing
 */

import { Property, Required, Enum, Optional, CollectionOf } from "@tsed/schema";
import { GenerationPhase } from "./LLMModels";

/**
 * Agent types in the MANOE system
 */
export enum AgentType {
  ARCHITECT = "architect",
  PROFILER = "profiler",
  WORLDBUILDER = "worldbuilder",
  STRATEGIST = "strategist",
  WRITER = "writer",
  CRITIC = "critic",
  ORIGINALITY = "originality",
  IMPACT = "impact",
  ARCHIVIST = "archivist",
}

/**
 * Message types for agent communication
 */
export enum MessageType {
  ARTIFACT = "artifact",
  QUESTION = "question",
  RESPONSE = "response",
  OBJECTION = "objection",
  APPROVAL = "approval",
  REVISION_REQUEST = "revision_request",
}

/**
 * Cinematic event types for real-time UI visualization
 */
export type CinematicEventType =
  | "agent_thought"      // Agent's internal thought/process
  | "agent_dialogue"     // Dialogue between agents
  | "agent_conflict"     // Conflict between agents
  | "agent_consensus";   // Consensus reached

/**
 * Agent thought event (for Cinematic UI)
 */
export interface AgentThoughtEvent {
  type: "agent_thought";
  data: {
    agent: AgentType;
    thought: string;
    sentiment: "neutral" | "agree" | "disagree" | "excited" | "concerned";
    targetAgent?: AgentType;
  };
}

/**
 * Agent dialogue event (for Cinematic UI)
 */
export interface AgentDialogueEvent {
  type: "agent_dialogue";
  data: {
    from: AgentType;
    to: AgentType;
    message: string;
    dialogueType: "question" | "objection" | "approval" | "suggestion";
  };
}

/**
 * Agent conflict event (for Cinematic UI)
 */
export interface AgentConflictEvent {
  type: "agent_conflict";
  data: {
    agents: [AgentType, AgentType];
    issue: string;
    resolution?: string;
  };
}

/**
 * Agent consensus event (for Cinematic UI)
 */
export interface AgentConsensusEvent {
  type: "agent_consensus";
  data: {
    agents: AgentType[];
    decision: string;
  };
}

/**
 * Agent message structure
 */
export class AgentMessage {
  @Required()
  @Enum(AgentType)
  sender: AgentType;

  @Optional()
  @Enum(AgentType)
  recipient?: AgentType;

  @Required()
  @Enum(MessageType)
  type: MessageType;

  @Required()
  @Property()
  content: string;

  @Optional()
  @Property()
  artifact?: Record<string, unknown>;

  @Required()
  @Property()
  timestamp: string = new Date().toISOString();

  @Optional()
  @Property()
  metadata?: Record<string, unknown>;
}

/**
 * Key constraint for continuity tracking
 * Uses semantic keys instead of UUIDs for deterministic superseding
 */
export class KeyConstraint {
  @Required()
  @Property()
  key: string;

  @Required()
  @Property()
  value: string;

  @Required()
  @Property()
  source: AgentType;

  @Required()
  @Property()
  sceneNumber: number;

  @Required()
  @Property()
  timestamp: string;

  @Optional()
  @Property()
  reasoning?: string;
}

/**
 * Raw fact from agents (before Archivist processing)
 */
export class RawFact {
  @Required()
  @Property()
  fact: string;

  @Required()
  @Property()
  source: AgentType;

  @Required()
  @Property()
  sceneNumber: number;

  @Required()
  @Property()
  timestamp: string;
}

/**
 * Generation state tracking
 */
export class GenerationState {
  @Required()
  @Enum(GenerationPhase)
  phase: GenerationPhase;

  @Required()
  @Property()
  projectId: string;

  @Required()
  @Property()
  runId: string;

  @Optional()
  @Property()
  narrative?: Record<string, unknown>;

  @CollectionOf(Object)
  characters: Record<string, unknown>[] = [];

  @Optional()
  @Property()
  worldbuilding?: Record<string, unknown>;

  @Optional()
  @Property()
  outline?: Record<string, unknown>;

  @Property()
  currentScene: number = 0;

  @Property()
  totalScenes: number = 0;

  @Property()
  drafts: Map<number, Record<string, unknown>> = new Map();

  @Property()
  critiques: Map<number, Record<string, unknown>[]> = new Map();

  @Property()
  revisionCount: Map<number, number> = new Map();

  @CollectionOf(AgentMessage)
  messages: AgentMessage[] = [];

  @Property()
  maxRevisions: number = 2;

  @CollectionOf(KeyConstraint)
  keyConstraints: KeyConstraint[] = [];

  @CollectionOf(RawFact)
  rawFactsLog: RawFact[] = [];

  @Property()
  lastArchivistScene: number = 0;

  @Property()
  isPaused: boolean = false;

  @Property()
  isCompleted: boolean = false;

  @Property()
  error?: string;

  @Property()
  startedAt: string = new Date().toISOString();

  @Property()
  updatedAt: string = new Date().toISOString();
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  type: AgentType;
  name: string;
  description: string;
  systemPrompt: string;
  activePhases: GenerationPhase[];
}

/**
 * Phase configuration
 */
export interface PhaseConfig {
  phase: GenerationPhase;
  name: string;
  description: string;
  primaryAgent: AgentType;
  supportingAgents: AgentType[];
  outputArtifact: string;
}

/**
 * Agent definitions with their roles and active phases
 */
export const AGENT_CONFIGS: Record<AgentType, Omit<AgentConfig, "systemPrompt">> = {
  [AgentType.ARCHITECT]: {
    type: AgentType.ARCHITECT,
    name: "Architect",
    description: "Designs story structure, themes, and narrative arc",
    activePhases: [
      GenerationPhase.GENESIS,
      GenerationPhase.OUTLINING,
      GenerationPhase.ADVANCED_PLANNING,
    ],
  },
  [AgentType.PROFILER]: {
    type: AgentType.PROFILER,
    name: "Profiler",
    description: "Creates deep character profiles with psychology and arcs",
    activePhases: [
      GenerationPhase.CHARACTERS,
      GenerationPhase.NARRATOR_DESIGN,
    ],
  },
  [AgentType.WORLDBUILDER]: {
    type: AgentType.WORLDBUILDER,
    name: "Worldbuilder",
    description: "Develops setting, geography, cultures, and world rules",
    activePhases: [GenerationPhase.WORLDBUILDING],
  },
  [AgentType.STRATEGIST]: {
    type: AgentType.STRATEGIST,
    name: "Strategist",
    description: "Plans scene structure, pacing, and narrative beats",
    activePhases: [
      GenerationPhase.OUTLINING,
      GenerationPhase.ADVANCED_PLANNING,
    ],
  },
  [AgentType.WRITER]: {
    type: AgentType.WRITER,
    name: "Writer",
    description: "Generates prose for scenes with voice and style",
    activePhases: [
      GenerationPhase.DRAFTING,
      GenerationPhase.REVISION,
      GenerationPhase.POLISH,
    ],
  },
  [AgentType.CRITIC]: {
    type: AgentType.CRITIC,
    name: "Critic",
    description: "Evaluates prose quality and provides revision feedback",
    activePhases: [GenerationPhase.CRITIQUE, GenerationPhase.REVISION],
  },
  [AgentType.ORIGINALITY]: {
    type: AgentType.ORIGINALITY,
    name: "Originality Checker",
    description: "Detects cliches and ensures narrative uniqueness",
    activePhases: [GenerationPhase.ORIGINALITY_CHECK],
  },
  [AgentType.IMPACT]: {
    type: AgentType.IMPACT,
    name: "Impact Assessor",
    description: "Evaluates emotional resonance and reader engagement",
    activePhases: [GenerationPhase.IMPACT_ASSESSMENT],
  },
  [AgentType.ARCHIVIST]: {
    type: AgentType.ARCHIVIST,
    name: "Archivist",
    description: "Manages continuity constraints and resolves conflicts",
    activePhases: [
      GenerationPhase.DRAFTING,
      GenerationPhase.REVISION,
      GenerationPhase.POLISH,
    ],
  },
};

/**
 * Phase flow configuration
 * Defines the order and structure of generation phases
 */
export const PHASE_CONFIGS: PhaseConfig[] = [
  {
    phase: GenerationPhase.GENESIS,
    name: "Genesis",
    description: "Initial story concept and theme development",
    primaryAgent: AgentType.ARCHITECT,
    supportingAgents: [],
    outputArtifact: "narrative",
  },
  {
    phase: GenerationPhase.CHARACTERS,
    name: "Characters",
    description: "Character creation with deep psychological profiles",
    primaryAgent: AgentType.PROFILER,
    supportingAgents: [AgentType.ARCHITECT],
    outputArtifact: "characters",
  },
  {
    phase: GenerationPhase.NARRATOR_DESIGN,
    name: "Narrator Design",
    description: "Define narrative voice and perspective",
    primaryAgent: AgentType.PROFILER,
    supportingAgents: [AgentType.ARCHITECT],
    outputArtifact: "narrator",
  },
  {
    phase: GenerationPhase.WORLDBUILDING,
    name: "Worldbuilding",
    description: "Setting, geography, cultures, and world rules",
    primaryAgent: AgentType.WORLDBUILDER,
    supportingAgents: [AgentType.ARCHITECT],
    outputArtifact: "worldbuilding",
  },
  {
    phase: GenerationPhase.OUTLINING,
    name: "Outlining",
    description: "Scene-by-scene story outline",
    primaryAgent: AgentType.STRATEGIST,
    supportingAgents: [AgentType.ARCHITECT],
    outputArtifact: "outline",
  },
  {
    phase: GenerationPhase.ADVANCED_PLANNING,
    name: "Advanced Planning",
    description: "Detailed planning with motifs, subtext, and emotional beats",
    primaryAgent: AgentType.STRATEGIST,
    supportingAgents: [AgentType.ARCHITECT],
    outputArtifact: "advanced_plan",
  },
  {
    phase: GenerationPhase.DRAFTING,
    name: "Drafting",
    description: "Initial prose generation for each scene",
    primaryAgent: AgentType.WRITER,
    supportingAgents: [AgentType.ARCHIVIST],
    outputArtifact: "draft",
  },
  {
    phase: GenerationPhase.CRITIQUE,
    name: "Critique",
    description: "Quality evaluation and feedback",
    primaryAgent: AgentType.CRITIC,
    supportingAgents: [],
    outputArtifact: "critique",
  },
  {
    phase: GenerationPhase.REVISION,
    name: "Revision",
    description: "Prose revision based on critique (max 2 iterations)",
    primaryAgent: AgentType.WRITER,
    supportingAgents: [AgentType.CRITIC, AgentType.ARCHIVIST],
    outputArtifact: "revision",
  },
  {
    phase: GenerationPhase.ORIGINALITY_CHECK,
    name: "Originality Check",
    description: "Cliche detection and uniqueness verification",
    primaryAgent: AgentType.ORIGINALITY,
    supportingAgents: [],
    outputArtifact: "originality_report",
  },
  {
    phase: GenerationPhase.IMPACT_ASSESSMENT,
    name: "Impact Assessment",
    description: "Emotional resonance and engagement evaluation",
    primaryAgent: AgentType.IMPACT,
    supportingAgents: [],
    outputArtifact: "impact_report",
  },
  {
    phase: GenerationPhase.POLISH,
    name: "Polish",
    description: "Final prose refinement and consistency check",
    primaryAgent: AgentType.WRITER,
    supportingAgents: [AgentType.ARCHIVIST],
    outputArtifact: "final_draft",
  },
];

/**
 * Get phase config by phase enum
 */
export function getPhaseConfig(phase: GenerationPhase): PhaseConfig | undefined {
  return PHASE_CONFIGS.find((config) => config.phase === phase);
}

/**
 * Get next phase in the flow
 */
export function getNextPhase(currentPhase: GenerationPhase): GenerationPhase | null {
  const currentIndex = PHASE_CONFIGS.findIndex(
    (config) => config.phase === currentPhase
  );
  if (currentIndex === -1 || currentIndex === PHASE_CONFIGS.length - 1) {
    return null;
  }
  return PHASE_CONFIGS[currentIndex + 1].phase;
}

/**
 * Check if agent is active in a phase
 */
export function isAgentActiveInPhase(
  agent: AgentType,
  phase: GenerationPhase
): boolean {
  const config = AGENT_CONFIGS[agent];
  return config.activePhases.includes(phase);
}
