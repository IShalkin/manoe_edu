/**
 * Storyteller Orchestrator Service
 * Main multi-agent orchestration engine for MANOE narrative generation
 * 
 * Implements:
 * - 9 specialized agents (Architect, Profiler, Worldbuilder, Strategist, Writer, Critic, Originality, Impact, Archivist)
 * - Phase-based generation flow (Genesis → Characters → Worldbuilding → Outlining → Drafting → Polish)
 * - Writer↔Critic revision loop with max 2 iterations
 * - Key Constraints for continuity (prevents context drift)
 * - Archivist agent for constraint resolution
 * - Real-time SSE event streaming
 * - Langfuse tracing and Prompt Management
 */

import { Service, Inject } from "@tsed/di";
import { $log } from "@tsed/common";
import { v4 as uuidv4 } from "uuid";
import {
  GenerationPhase,
  LLMProvider,
  ChatMessage,
  MessageRole,
  getMaxTokensForPhase,
} from "../models/LLMModels";
import {
  AgentType,
  AgentMessage,
  MessageType,
  GenerationState,
  KeyConstraint,
  RawFact,
  AGENT_CONFIGS,
  PHASE_CONFIGS,
  getPhaseConfig,
  getNextPhase,
} from "../models/AgentModels";
import { LLMProviderService } from "./LLMProviderService";
import { RedisStreamsService } from "./RedisStreamsService";
import { QdrantMemoryService } from "./QdrantMemoryService";
import { LangfuseService, AGENT_PROMPTS, PHASE_PROMPTS } from "./LangfuseService";
import { SupabaseService } from "./SupabaseService";
import { AgentFactory } from "../agents/AgentFactory";
import { AgentContext } from "../agents/types";

/**
 * LLM Configuration for generation
 */
export interface LLMConfiguration {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  temperature?: number;
}

/**
 * Generation options
 */
export interface GenerationOptions {
  projectId: string;
  seedIdea: string;
  llmConfig: LLMConfiguration;
  mode: "full" | "branching";
  settings?: Record<string, unknown>;
}

/**
 * Run status
 */
export interface RunStatus {
  runId: string;
  projectId: string;
  phase: GenerationPhase;
  currentScene: number;
  totalScenes: number;
  isPaused: boolean;
  isCompleted: boolean;
  error?: string;
  startedAt: string;
  updatedAt: string;
}

@Service()
export class StorytellerOrchestrator {
  private activeRuns: Map<string, GenerationState> = new Map();
  private pauseCallbacks: Map<string, () => boolean> = new Map();
  private isShuttingDown: boolean = false;

  @Inject()
  private llmProvider: LLMProviderService;

  @Inject()
  private redisStreams: RedisStreamsService;

  @Inject()
  private qdrantMemory: QdrantMemoryService;

  @Inject()
  private langfuse: LangfuseService;

  @Inject()
  private supabase: SupabaseService;

  @Inject()
  private agentFactory: AgentFactory;

  /**
   * Start a new generation run
   * 
   * @param options - Generation options including project ID, seed idea, and LLM config
   * @returns Run ID
   */
  async startGeneration(options: GenerationOptions): Promise<string> {
    const runId = uuidv4();
    process.stdout.write(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}\n`);
    $log.info(`[StorytellerOrchestrator] startGeneration called, runId: ${runId}, projectId: ${options.projectId}`);

    // Initialize generation state
    const state: GenerationState = {
      phase: GenerationPhase.GENESIS,
      projectId: options.projectId,
      runId,
      characters: [],
      currentScene: 0,
      totalScenes: 0,
      drafts: new Map(),
      critiques: new Map(),
      revisionCount: new Map(),
      messages: [],
      maxRevisions: 2,
      keyConstraints: [],
      rawFactsLog: [],
      lastArchivistScene: 0,
      isPaused: false,
      isCompleted: false,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.activeRuns.set(runId, state);
    $log.info(`[StorytellerOrchestrator] startGeneration: state initialized and stored, runId: ${runId}`);

    // Initialize Qdrant memory with API key for embeddings
    await this.qdrantMemory.connect(
      options.llmConfig.provider === LLMProvider.OPENAI ? options.llmConfig.apiKey : undefined,
      options.llmConfig.provider === LLMProvider.GEMINI ? options.llmConfig.apiKey : undefined
    );

    // Start Langfuse trace
    this.langfuse.startTrace({
      projectId: options.projectId,
      runId,
      phase: GenerationPhase.GENESIS,
    });

    // Publish start event
    await this.publishEvent(runId, "generation_started", {
      projectId: options.projectId,
      mode: options.mode,
      phase: GenerationPhase.GENESIS,
    });

    // Start generation in background
    $log.info(`[StorytellerOrchestrator] startGeneration: starting async runGeneration, runId: ${runId}`);
    this.runGeneration(runId, options).catch((error) => {
      $log.error(`[StorytellerOrchestrator] startGeneration: runGeneration error, runId: ${runId}`, error);
      this.handleError(runId, error);
    });

    return runId;
  }

  /**
   * Main generation loop
   */
  private async runGeneration(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runGeneration started, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.error(`[StorytellerOrchestrator] runGeneration: state not found, runId: ${runId}`);
      return;
    }

    try {
      // Phase 1: Genesis
      $log.info(`[StorytellerOrchestrator] runGeneration: about to call runGenesisPhase, runId: ${runId}`);
      await this.runGenesisPhase(runId, options);
      $log.info(`[StorytellerOrchestrator] runGeneration: runGenesisPhase completed, runId: ${runId}`);
      const shouldStopAfterGenesis = this.shouldStop(runId);
      $log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis = ${shouldStopAfterGenesis}, runId: ${runId}`);
      if (shouldStopAfterGenesis) {
        $log.info(`[StorytellerOrchestrator] runGeneration: shouldStop after Genesis, exiting, runId: ${runId}`);
        return;
      }

      // Phase 2: Characters
      $log.info(`[StorytellerOrchestrator] runGeneration: about to call runCharactersPhase, runId: ${runId}`);
      await this.runCharactersPhase(runId, options);
      $log.info(`[StorytellerOrchestrator] runGeneration: runCharactersPhase completed, runId: ${runId}`);
      if (this.shouldStop(runId)) return;

      // Phase 3: Worldbuilding
      await this.runWorldbuildingPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 4: Outlining
      await this.runOutliningPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 5: Advanced Planning (optional)
      await this.runAdvancedPlanningPhase(runId, options);
      if (this.shouldStop(runId)) return;

      // Phase 6-9: Drafting → Critique → Revision → Polish (per scene)
      await this.runDraftingLoop(runId, options);
      if (this.shouldStop(runId)) return;

      // Mark as completed
      state.isCompleted = true;
      state.updatedAt = new Date().toISOString();

      await this.publishEvent(runId, "generation_completed", {
        projectId: options.projectId,
        totalScenes: state.totalScenes,
      });

      // End Langfuse trace
      this.langfuse.endTrace(runId, {
        status: "completed",
        totalScenes: state.totalScenes,
      });
    } catch (error) {
      await this.handleError(runId, error);
    }
  }

  /**
   * Genesis Phase - Initial story concept
   */
  private async runGenesisPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runGenesisPhase called, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.error(`[StorytellerOrchestrator] runGenesisPhase: state not found for runId: ${runId}`);
      return;
    }

    state.phase = GenerationPhase.GENESIS;
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: phase set to GENESIS, runId: ${runId}`);
    await this.publishPhaseStart(runId, GenerationPhase.GENESIS);

    // Use ArchitectAgent through AgentFactory
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: getting ArchitectAgent from factory, runId: ${runId}`);
    const agent = this.agentFactory.getAgent(AgentType.ARCHITECT);
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: ArchitectAgent obtained, runId: ${runId}`);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    $log.info(`[StorytellerOrchestrator] runGenesisPhase: calling agent.execute, runId: ${runId}, phase: ${state.phase}`);
    const output = await agent.execute(context, options);
    $log.info(`[StorytellerOrchestrator] runGenesisPhase: agent.execute completed, runId: ${runId}`);
    state.narrative = output.content as Record<string, unknown>;
    state.updatedAt = new Date().toISOString();

    // Save to Supabase
    await this.saveArtifact(runId, options.projectId, "narrative", state.narrative);

    await this.publishPhaseComplete(runId, GenerationPhase.GENESIS, state.narrative);
  }

  /**
   * Characters Phase - Character creation
   */
  private async runCharactersPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    $log.info(`[StorytellerOrchestrator] runCharactersPhase called, runId: ${runId}`);
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) {
      $log.info(`[StorytellerOrchestrator] runCharactersPhase: state or narrative not found, returning, runId: ${runId}`);
      return;
    }

    state.phase = GenerationPhase.CHARACTERS;
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: phase set to CHARACTERS, runId: ${runId}`);
    await this.publishPhaseStart(runId, GenerationPhase.CHARACTERS);

    // Use ProfilerAgent through AgentFactory
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: getting ProfilerAgent from factory, runId: ${runId}`);
    const agent = this.agentFactory.getAgent(AgentType.PROFILER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    $log.info(`[StorytellerOrchestrator] runCharactersPhase: calling agent.execute, runId: ${runId}`);
    const output = await agent.execute(context, options);
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: agent.execute completed, output.content type: ${typeof output.content}, isArray: ${Array.isArray(output.content)}, runId: ${runId}`);
    state.characters = output.content as Record<string, unknown>[];
    state.updatedAt = new Date().toISOString();

    // Store characters in Qdrant for semantic search
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: storing ${state.characters?.length || 0} characters in Qdrant, runId: ${runId}`);
    try {
      if (Array.isArray(state.characters)) {
        for (const character of state.characters) {
          $log.info(`[StorytellerOrchestrator] runCharactersPhase: storing character in Qdrant, runId: ${runId}`);
          await this.qdrantMemory.storeCharacter(options.projectId, character);
        }
      } else {
        $log.warn(`[StorytellerOrchestrator] runCharactersPhase: state.characters is not an array, skipping Qdrant storage, runId: ${runId}`);
      }
    } catch (qdrantError) {
      $log.error(`[StorytellerOrchestrator] runCharactersPhase: Qdrant storage failed, continuing anyway, runId: ${runId}`, qdrantError);
    }

    $log.info(`[StorytellerOrchestrator] runCharactersPhase: saving artifact, runId: ${runId}`);
    await this.saveArtifact(runId, options.projectId, "characters", state.characters);
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: publishing phase complete, runId: ${runId}`);
    await this.publishPhaseComplete(runId, GenerationPhase.CHARACTERS, state.characters);
    $log.info(`[StorytellerOrchestrator] runCharactersPhase: completed, runId: ${runId}`);
  }

  /**
   * Worldbuilding Phase - Setting and world details
   */
  private async runWorldbuildingPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) return;

    state.phase = GenerationPhase.WORLDBUILDING;
    await this.publishPhaseStart(runId, GenerationPhase.WORLDBUILDING);

    // Use WorldbuilderAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WORLDBUILDER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    state.worldbuilding = output.content as Record<string, unknown>;
    state.updatedAt = new Date().toISOString();

    // Store worldbuilding elements in Qdrant
    const worldData = state.worldbuilding as Record<string, unknown>;
    for (const [elementType, element] of Object.entries(worldData)) {
      if (typeof element === "object" && element !== null) {
        await this.qdrantMemory.storeWorldbuilding(
          options.projectId,
          elementType,
          element as Record<string, unknown>
        );
      }
    }

    await this.saveArtifact(runId, options.projectId, "worldbuilding", state.worldbuilding);
    await this.publishPhaseComplete(runId, GenerationPhase.WORLDBUILDING, state.worldbuilding);
  }

  /**
   * Outlining Phase - Scene-by-scene outline
   */
  private async runOutliningPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.narrative) return;

    state.phase = GenerationPhase.OUTLINING;
    await this.publishPhaseStart(runId, GenerationPhase.OUTLINING);

    // Use StrategistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.STRATEGIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    state.outline = output.content as Record<string, unknown>;
    const scenes = (state.outline as Record<string, unknown>)?.scenes;
    state.totalScenes = Array.isArray(scenes) ? scenes.length : 0;
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, "outline", state.outline);
    await this.publishPhaseComplete(runId, GenerationPhase.OUTLINING, state.outline);
  }

  /**
   * Advanced Planning Phase - Detailed planning with motifs and subtext
   */
  private async runAdvancedPlanningPhase(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.outline) return;

    state.phase = GenerationPhase.ADVANCED_PLANNING;
    await this.publishPhaseStart(runId, GenerationPhase.ADVANCED_PLANNING);

    // Use StrategistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.STRATEGIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const advancedPlan = output.content as Record<string, unknown>;
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, "advanced_plan", advancedPlan);
    await this.publishPhaseComplete(runId, GenerationPhase.ADVANCED_PLANNING, advancedPlan);
  }

  /**
   * Drafting Loop - Draft, Critique, Revise for each scene
   */
  private async runDraftingLoop(
    runId: string,
    options: GenerationOptions
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state || !state.outline) return;

    const scenes = (state.outline as Record<string, unknown>)?.scenes as unknown[];
    if (!Array.isArray(scenes)) return;

    for (let sceneNum = 0; sceneNum < scenes.length; sceneNum++) {
      if (this.shouldStop(runId)) return;

      state.currentScene = sceneNum + 1;
      const scene = scenes[sceneNum] as Record<string, unknown>;

      // Draft the scene
      await this.draftScene(runId, options, sceneNum + 1, scene);
      if (this.shouldStop(runId)) return;

      // Critique and revision loop (max 2 iterations)
      let revisionCount = 0;
      while (revisionCount < state.maxRevisions) {
        if (this.shouldStop(runId)) return;

        // Critique
        const critique = await this.critiqueScene(runId, options, sceneNum + 1);
        if (this.shouldStop(runId)) return;

        // Check if revision needed
        if (this.isApproved(critique)) {
          break;
        }

        // Revise
        await this.reviseScene(runId, options, sceneNum + 1, critique);
        revisionCount++;
        state.revisionCount.set(sceneNum + 1, revisionCount);
      }

      // Run Archivist every 3 scenes
      if ((sceneNum + 1) % 3 === 0 && sceneNum + 1 > state.lastArchivistScene) {
        await this.runArchivistCheck(runId, options, sceneNum + 1);
        state.lastArchivistScene = sceneNum + 1;
      }

      // Polish the scene
      await this.polishScene(runId, options, sceneNum + 1);
    }
  }

  /**
   * Draft a single scene
   */
  private async draftScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    sceneOutline: Record<string, unknown>
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    state.phase = GenerationPhase.DRAFTING;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_draft_start", { sceneNum });

    // Get relevant context from Qdrant
    const sceneTitle = String(sceneOutline.title ?? `Scene ${sceneNum}`);
    const relevantCharacters = await this.qdrantMemory.searchCharacters(
      options.projectId,
      sceneTitle,
      3
    );

    // Store scene outline in state for WriterAgent to access
    const outline = state.outline as Record<string, unknown>;
    if (!outline) {
      throw new Error("Outline not found in state");
    }

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const response = output.content as string;

    const draft = {
      sceneNum,
      title: sceneTitle,
      content: response,
      wordCount: response.split(/\s+/).length,
      createdAt: new Date().toISOString(),
    };

    state.drafts.set(sceneNum, draft);
    state.updatedAt = new Date().toISOString();

    // Extract and log raw facts
    await this.extractRawFacts(runId, sceneNum, response, AgentType.WRITER);

    // Store scene in Qdrant
    await this.qdrantMemory.storeScene(options.projectId, sceneNum, draft);

    await this.saveArtifact(runId, options.projectId, `draft_scene_${sceneNum}`, draft);
    await this.publishEvent(runId, "scene_draft_complete", { sceneNum, wordCount: draft.wordCount });
  }

  /**
   * Critique a scene
   */
  private async critiqueScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number
  ): Promise<Record<string, unknown>> {
    const state = this.activeRuns.get(runId);
    if (!state) return { approved: true };

    const draft = state.drafts.get(sceneNum);
    if (!draft) return { approved: true };

    state.phase = GenerationPhase.CRITIQUE;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_critique_start", { sceneNum });

    // Use CriticAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.CRITIC);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const critique = output.content as Record<string, unknown>;
    
    if (!state.critiques.has(sceneNum)) {
      state.critiques.set(sceneNum, []);
    }
    state.critiques.get(sceneNum)!.push(critique);
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, `critique_scene_${sceneNum}`, critique);
    await this.publishEvent(runId, "scene_critique_complete", { sceneNum, critique });

    return critique;
  }

  /**
   * Revise a scene based on critique
   */
  private async reviseScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number,
    critique: Record<string, unknown>
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum);
    if (!draft) return;

    state.phase = GenerationPhase.REVISION;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_revision_start", { sceneNum });

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const response = output.content as string;

    const revision = {
      sceneNum,
      title: (draft as Record<string, unknown>).title,
      content: response,
      wordCount: response.split(/\s+/).length,
      revisionNumber: (state.revisionCount.get(sceneNum) ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };

    state.drafts.set(sceneNum, revision);
    state.updatedAt = new Date().toISOString();

    // Extract new facts from revision
    await this.extractRawFacts(runId, sceneNum, response, AgentType.WRITER);

    await this.saveArtifact(runId, options.projectId, `revision_scene_${sceneNum}`, revision);
    await this.publishEvent(runId, "scene_revision_complete", { sceneNum });
  }

  /**
   * Polish a scene (final refinement)
   */
  private async polishScene(
    runId: string,
    options: GenerationOptions,
    sceneNum: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    const draft = state.drafts.get(sceneNum);
    if (!draft) return;

    state.phase = GenerationPhase.POLISH;
    state.currentScene = sceneNum;
    await this.publishEvent(runId, "scene_polish_start", { sceneNum });

    // Use WriterAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.WRITER);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const response = output.content as string;

    const polished = {
      sceneNum,
      title: (draft as Record<string, unknown>).title,
      content: response,
      wordCount: response.split(/\s+/).length,
      status: "final",
      createdAt: new Date().toISOString(),
    };

    state.drafts.set(sceneNum, polished);
    state.updatedAt = new Date().toISOString();

    await this.saveArtifact(runId, options.projectId, `final_scene_${sceneNum}`, polished);
    await this.publishEvent(runId, "scene_polish_complete", { sceneNum });
  }

  /**
   * Run Archivist to consolidate constraints
   */
  private async runArchivistCheck(
    runId: string,
    options: GenerationOptions,
    upToScene: number
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    await this.publishEvent(runId, "archivist_start", { upToScene });

    // Get raw facts since last archivist run
    const newFacts = state.rawFactsLog.filter(
      (f) => f.sceneNumber > state.lastArchivistScene && f.sceneNumber <= upToScene
    );

    if (newFacts.length === 0) return;

    state.currentScene = upToScene;

    // Use ArchivistAgent through AgentFactory
    const agent = this.agentFactory.getAgent(AgentType.ARCHIVIST);
    const context: AgentContext = {
      runId,
      state,
      projectId: options.projectId,
    };

    const output = await agent.execute(context, options);
    const result = output.content as Record<string, unknown>;
    
    if (result.constraints && Array.isArray(result.constraints)) {
      // Update constraints from Archivist output
      const newConstraints = result.constraints as KeyConstraint[];
      // Merge with existing, resolving conflicts by timestamp
      for (const newConstraint of newConstraints) {
        const existingIndex = state.keyConstraints.findIndex(c => c.key === newConstraint.key);
        if (existingIndex >= 0) {
          // Replace if new constraint is more recent
          const existing = state.keyConstraints[existingIndex];
          if (new Date(newConstraint.timestamp) > new Date(existing.timestamp)) {
            state.keyConstraints[existingIndex] = newConstraint;
          }
        } else {
          state.keyConstraints.push(newConstraint);
        }
      }
    }

    state.lastArchivistScene = upToScene;
    state.updatedAt = new Date().toISOString();

    await this.publishEvent(runId, "archivist_complete", {
      upToScene,
      constraintCount: state.keyConstraints.length,
    });
  }

  /**
   * Extract raw facts from generated content
   */
  private async extractRawFacts(
    runId: string,
    sceneNum: number,
    content: string,
    source: AgentType
  ): Promise<void> {
    const state = this.activeRuns.get(runId);
    if (!state) return;

    // Simple fact extraction - in production, use LLM for better extraction
    const factPatterns = [
      /(\w+) (was|is|became|had|has) (wounded|injured|killed|married|born|died)/gi,
      /(\w+)'s (health|status|location|relationship) (changed|is|was)/gi,
    ];

    for (const pattern of factPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        state.rawFactsLog.push({
          fact: match[0],
          source,
          sceneNumber: sceneNum,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  /**
   * Build constraints block for prompts
   */
  private buildConstraintsBlock(constraints: KeyConstraint[]): string {
    if (constraints.length === 0) {
      return "No constraints established yet.";
    }

    return constraints
      .map((c) => `- ${c.key}: ${c.value} (Scene ${c.sceneNumber})`)
      .join("\n");
  }

  /**
   * Call an agent with LLM
   */
  private async callAgent(
    runId: string,
    agent: AgentType,
    systemPrompt: string,
    userPrompt: string,
    llmConfig: LLMConfiguration,
    phase: GenerationPhase
  ): Promise<string> {
    const messages: ChatMessage[] = [
      { role: MessageRole.SYSTEM, content: systemPrompt },
      { role: MessageRole.USER, content: userPrompt },
    ];

    const spanId = this.langfuse.startSpan(runId, `${agent}_call`, { phase });

    try {
      const response = await this.llmProvider.createCompletionWithRetry({
        messages,
        model: llmConfig.model,
        provider: llmConfig.provider,
        apiKey: llmConfig.apiKey,
        temperature: llmConfig.temperature ?? 0.7,
        maxTokens: getMaxTokensForPhase(phase),
        responseFormat: userPrompt.includes("Output as JSON") || userPrompt.includes("Output JSON")
          ? { type: "json_object" }
          : undefined,
      });

      // Track in Langfuse
      this.langfuse.trackLLMCall(runId, agent, messages, response, spanId);
      this.langfuse.endSpan(runId, spanId, { content: response.content.substring(0, 500) });

      // Record agent message
      const state = this.activeRuns.get(runId);
      if (state) {
        state.messages.push({
          sender: agent,
          type: MessageType.ARTIFACT,
          content: response.content,
          timestamp: new Date().toISOString(),
        });
      }

      return response.content;
    } catch (error) {
      this.langfuse.endSpan(runId, spanId, { error: String(error) });
      throw error;
    }
  }

  /**
   * Get agent prompt from Langfuse or fallback
   */
  private async getAgentPrompt(
    agent: AgentType,
    variables: Record<string, string>
  ): Promise<string> {
    const promptName = AGENT_PROMPTS[agent.toUpperCase() as keyof typeof AGENT_PROMPTS];
    
    if (promptName && this.langfuse.isEnabled) {
      try {
        const prompt = await this.langfuse.getCompiledPrompt(
          promptName,
          variables,
          { fallback: this.getFallbackPrompt(agent) }
        );
        return prompt;
      } catch (error) {
        console.warn(`Failed to get prompt from Langfuse for ${agent}, using fallback`);
      }
    }

    return this.compileFallbackPrompt(agent, variables);
  }

  /**
   * Get fallback prompt for agent
   */
  private getFallbackPrompt(agent: AgentType): string {
    const prompts: Record<AgentType, string> = {
      [AgentType.ARCHITECT]: `You are the Architect, a master storyteller who designs narrative structures.
Your role is to create compelling story frameworks with clear themes, arcs, and emotional journeys.
{{seedIdea}}`,
      [AgentType.PROFILER]: `You are the Profiler, an expert in character psychology and development.
Your role is to create deep, nuanced characters with authentic motivations and arcs.
Narrative context: {{narrative}}`,
      [AgentType.WORLDBUILDER]: `You are the Worldbuilder, a creator of immersive settings and worlds.
Your role is to develop rich, consistent worlds that enhance the narrative.
Narrative: {{narrative}}
Characters: {{characters}}`,
      [AgentType.STRATEGIST]: `You are the Strategist, a master of narrative pacing and scene structure.
Your role is to plan scenes that maximize dramatic impact and reader engagement.
Narrative: {{narrative}}
Characters: {{characters}}
World: {{worldbuilding}}`,
      [AgentType.WRITER]: `You are the Writer, a skilled prose craftsman.
Your role is to transform outlines into vivid, engaging prose that brings the story to life.
Maintain consistency with established facts.
Key Constraints: {{keyConstraints}}`,
      [AgentType.CRITIC]: `You are the Critic, an expert literary evaluator.
Your role is to assess prose quality and provide constructive feedback for improvement.
Check for constraint violations.
Key Constraints: {{keyConstraints}}`,
      [AgentType.ORIGINALITY]: `You are the Originality Checker, a detector of cliches and tropes.
Your role is to identify overused elements and suggest unique alternatives.`,
      [AgentType.IMPACT]: `You are the Impact Assessor, an expert in emotional resonance.
Your role is to evaluate how effectively the prose engages readers emotionally.`,
      [AgentType.ARCHIVIST]: `You are the Archivist, the keeper of story continuity.
Your role is to track key facts and constraints, resolving conflicts to maintain consistency.
Use Chain of Thought reasoning: IDENTIFY conflicts → RESOLVE by timestamp → DISCARD irrelevant → GENERATE updated list.`,
    };

    return prompts[agent] ?? "You are a helpful assistant.";
  }

  /**
   * Compile fallback prompt with variables
   */
  private compileFallbackPrompt(
    agent: AgentType,
    variables: Record<string, string>
  ): string {
    let prompt = this.getFallbackPrompt(agent);
    
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
    }

    return prompt;
  }

  /**
   * Check if critique approves the scene
   * Uses revision_needed flag from CriticAgent output
   */
  private isApproved(critique: Record<string, unknown>): boolean {
    // Check revision_needed flag (inverted - if revision_needed is false, it's approved)
    if (critique.revision_needed === false) return true;
    // Fallback to old format
    if (critique.approved === true) return true;
    if (typeof critique.score === "number" && critique.score >= 8) return true;
    return false;
  }

  /**
   * Publish event to Redis Streams
   */
  private async publishEvent(
    runId: string,
    eventType: string,
    data: Record<string, unknown>
  ): Promise<void> {
    await this.redisStreams.publishEvent(runId, eventType, data);
  }

  /**
   * Publish phase start event
   */
  private async publishPhaseStart(runId: string, phase: GenerationPhase): Promise<void> {
    await this.publishEvent(runId, "phase_start", { phase });
    this.langfuse.addEvent(runId, "phase_start", { phase });
  }

  /**
   * Publish phase complete event
   */
  private async publishPhaseComplete(
    runId: string,
    phase: GenerationPhase,
    artifact: unknown
  ): Promise<void> {
    await this.publishEvent(runId, "phase_complete", { phase, artifact });
    this.langfuse.addEvent(runId, "phase_complete", { phase });
  }

  /**
   * Save artifact to Supabase
   */
  private async saveArtifact(
    runId: string,
    projectId: string,
    artifactType: string,
    content: unknown
  ): Promise<void> {
    try {
      await this.supabase.saveRunArtifact({
        runId,
        projectId,
        artifactType,
        content,
      });
    } catch (error) {
      console.error(`Failed to save artifact ${artifactType}:`, error);
    }
  }

  /**
   * Handle generation error
   * 
   * IMPORTANT: Publishes ERROR event to Redis Stream so clients don't hang forever
   * Client should check for event.type === "ERROR" and stop waiting
   */
  private async handleError(runId: string, error: unknown): Promise<void> {
    const state = this.activeRuns.get(runId);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    if (state) {
      state.error = errorMessage;
      state.updatedAt = new Date().toISOString();
    }

    // Publish detailed ERROR event - clients MUST check for this
    // Event type "ERROR" (uppercase) signals terminal failure
    await this.publishEvent(runId, "ERROR", {
      error: errorMessage,
      stack: errorStack,
      phase: state?.phase ?? "unknown",
      currentScene: state?.currentScene ?? 0,
      totalScenes: state?.totalScenes ?? 0,
      recoverable: false,
      timestamp: new Date().toISOString(),
    });

    // Also publish generation_error for backwards compatibility
    await this.publishEvent(runId, "generation_error", {
      error: errorMessage,
    });

    // End Langfuse trace with error status
    this.langfuse.endTrace(runId, {
      status: "error",
      error: errorMessage,
      phase: state?.phase,
      currentScene: state?.currentScene,
    });

    // Score the trace as failed for analytics
    this.langfuse.scoreTrace(runId, "success", 0, `Generation failed: ${errorMessage}`);
  }

  /**
   * Check if generation should stop
   */
  private shouldStop(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) {
      $log.info(`[StorytellerOrchestrator] shouldStop: state not found, returning true, runId: ${runId}`);
      return true;
    }
    if (state.isPaused) {
      $log.info(`[StorytellerOrchestrator] shouldStop: isPaused=true, returning true, runId: ${runId}`);
      return true;
    }
    if (state.error) {
      $log.info(`[StorytellerOrchestrator] shouldStop: error=${state.error}, returning true, runId: ${runId}`);
      return true;
    }

    const pauseCallback = this.pauseCallbacks.get(runId);
    if (pauseCallback && pauseCallback()) {
      $log.info(`[StorytellerOrchestrator] shouldStop: pauseCallback returned true, runId: ${runId}`);
      state.isPaused = true;
      return true;
    }

    return false;
  }

  /**
   * Parse JSON from LLM response
   */
  private parseJSON(response: string): Record<string, unknown> {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      return JSON.parse(response);
    } catch (error) {
      console.warn("Failed to parse JSON response:", error);
      return { raw: response };
    }
  }

  /**
   * Parse JSON array from LLM response
   */
  private parseJSONArray(response: string): Record<string, unknown>[] {
    const parsed = this.parseJSON(response);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (parsed.characters && Array.isArray(parsed.characters)) {
      return parsed.characters as Record<string, unknown>[];
    }
    return [parsed];
  }

  // ==================== PUBLIC API ====================

  /**
   * Get run status
   */
  getRunStatus(runId: string): RunStatus | null {
    const state = this.activeRuns.get(runId);
    if (!state) return null;

    return {
      runId: state.runId,
      projectId: state.projectId,
      phase: state.phase,
      currentScene: state.currentScene,
      totalScenes: state.totalScenes,
      isPaused: state.isPaused,
      isCompleted: state.isCompleted,
      error: state.error,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
    };
  }

  /**
   * Get full run state (for recovery)
   */
  getRunState(runId: string): GenerationState | null {
    return this.activeRuns.get(runId) ?? null;
  }

  /**
   * Pause a run
   */
  pauseRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.isPaused = true;
    state.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Resume a run
   */
  resumeRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.isPaused = false;
    state.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Cancel a run
   */
  cancelRun(runId: string): boolean {
    const state = this.activeRuns.get(runId);
    if (!state) return false;

    state.error = "Cancelled by user";
    state.updatedAt = new Date().toISOString();
    this.activeRuns.delete(runId);
    return true;
  }

  /**
   * Restore a run from saved state
   */
  restoreRun(state: GenerationState): void {
    this.activeRuns.set(state.runId, state);
  }

  /**
   * List active runs
   */
  listActiveRuns(): RunStatus[] {
    return Array.from(this.activeRuns.values()).map((state) => ({
      runId: state.runId,
      projectId: state.projectId,
      phase: state.phase,
      currentScene: state.currentScene,
      totalScenes: state.totalScenes,
      isPaused: state.isPaused,
      isCompleted: state.isCompleted,
      error: state.error,
      startedAt: state.startedAt,
      updatedAt: state.updatedAt,
    }));
  }

  // ==================== GRACEFUL SHUTDOWN ====================

  /**
   * Initiate graceful shutdown
   * 
   * Pauses all active runs and saves their state to Supabase.
   * When the service restarts, runs can be restored using restoreRun().
   * 
   * @param timeoutMs - Maximum time to wait for runs to pause (default: 30s)
   * @returns Number of runs that were saved
   */
  async gracefulShutdown(timeoutMs: number = 30000): Promise<number> {
    console.log(`Orchestrator: Initiating graceful shutdown (timeout: ${timeoutMs}ms)`);
    this.isShuttingDown = true;

    const activeRuns = Array.from(this.activeRuns.values());
    
    if (activeRuns.length === 0) {
      console.log("Orchestrator: No active runs to save");
      return 0;
    }

    console.log(`Orchestrator: Saving ${activeRuns.length} active runs...`);

    // Pause all runs
    for (const state of activeRuns) {
      state.isPaused = true;
      state.updatedAt = new Date().toISOString();
      
      // Notify clients that we're shutting down
      await this.publishEvent(state.runId, "shutdown_initiated", {
        message: "Server is restarting. Your generation will resume automatically.",
        phase: state.phase,
        currentScene: state.currentScene,
      });
    }

    // Wait for any in-flight LLM calls to complete (with timeout)
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      // Check if all runs have reached a safe checkpoint
      const allSafe = activeRuns.every((state) => {
        // A run is "safe" if it's paused and not in the middle of an LLM call
        return state.isPaused;
      });

      if (allSafe) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Save all run states to Supabase for recovery
    let savedCount = 0;
    for (const state of activeRuns) {
      try {
        // Serialize the state (Maps need special handling)
        const serializedState = {
          ...state,
          drafts: Object.fromEntries(state.drafts),
          critiques: Object.fromEntries(state.critiques),
          revisionCount: Object.fromEntries(state.revisionCount),
        };

        await this.supabase.saveRunArtifact({
          runId: state.runId,
          projectId: state.projectId,
          artifactType: "run_state_snapshot",
          content: serializedState,
        });

        savedCount++;
        console.log(`Orchestrator: Saved state for run ${state.runId}`);
      } catch (error) {
        console.error(`Orchestrator: Failed to save state for run ${state.runId}:`, error);
      }
    }

    // Flush Langfuse events
    await this.langfuse.flush();

    console.log(`Orchestrator: Graceful shutdown complete. Saved ${savedCount}/${activeRuns.length} runs.`);
    return savedCount;
  }

  /**
   * Restore runs from saved state after restart
   * 
   * Call this on service startup to recover any runs that were
   * interrupted by a shutdown/restart.
   * 
   * @param runId - Optional: restore a specific run by ID
   * @returns Number of runs restored
   */
  async restoreFromShutdown(runId?: string): Promise<number> {
    console.log("Orchestrator: Checking for runs to restore...");

    try {
      // If no runId provided, we can't restore (would need a list endpoint)
      if (!runId) {
        console.log("Orchestrator: No runId provided for restoration");
        return 0;
      }

      // Get saved run state from Supabase
      const artifact = await this.supabase.getRunArtifact(runId, "run_state_snapshot");

      if (!artifact) {
        console.log("Orchestrator: No saved run state found");
        return 0;
      }

      try {
        const artifactData = artifact as { content: Record<string, unknown> };
        const savedState = artifactData.content;
        
        // Deserialize the state (restore Maps from serialized objects)
        const draftsObj = (savedState.drafts as Record<string, Record<string, unknown>>) || {};
        const critiquesObj = (savedState.critiques as Record<string, Record<string, unknown>[]>) || {};
        const revisionObj = (savedState.revisionCount as Record<string, number>) || {};

        const state: GenerationState = {
          ...(savedState as unknown as GenerationState),
          drafts: new Map(
            Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
          critiques: new Map(
            Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
          revisionCount: new Map(
            Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])
          ),
          isPaused: true, // Keep paused until explicitly resumed
        };

        this.activeRuns.set(state.runId, state);

        // Notify clients that the run is restored
        await this.publishEvent(state.runId, "run_restored", {
          message: "Generation restored after server restart. Call resume to continue.",
          phase: state.phase,
          currentScene: state.currentScene,
        });

        console.log(`Orchestrator: Restored run ${state.runId} (phase: ${state.phase})`);
        return 1;
      } catch (error) {
        console.error(`Orchestrator: Failed to restore run from artifact:`, error);
        return 0;
      }
    } catch (error) {
      console.error("Orchestrator: Error restoring runs:", error);
      return 0;
    }
  }

  /**
   * Restore ALL interrupted runs from saved state after restart
   * 
   * Call this on service startup to recover any runs that were
   * interrupted by a shutdown/restart.
   * 
   * @returns Number of runs restored
   */
  async restoreAllInterruptedRuns(): Promise<number> {
    console.log("Orchestrator: Checking for ALL interrupted runs to restore...");

    try {
      // Get all interrupted run snapshots from Supabase
      const snapshots = await this.supabase.getInterruptedRunSnapshots();

      if (snapshots.length === 0) {
        console.log("Orchestrator: No interrupted runs found to restore");
        return 0;
      }

      console.log(`Orchestrator: Found ${snapshots.length} interrupted runs to restore`);

      let restoredCount = 0;
      for (const snapshot of snapshots) {
        try {
          const savedState = snapshot.content as Record<string, unknown>;
          
          // Check if this run is already active (shouldn't happen, but safety check)
          if (this.activeRuns.has(snapshot.run_id)) {
            console.log(`Orchestrator: Run ${snapshot.run_id} already active, skipping`);
            continue;
          }

          // Deserialize the state (restore Maps from serialized objects)
          const draftsObj = (savedState.drafts as Record<string, Record<string, unknown>>) || {};
          const critiquesObj = (savedState.critiques as Record<string, Record<string, unknown>[]>) || {};
          const revisionObj = (savedState.revisionCount as Record<string, number>) || {};

          const state: GenerationState = {
            ...(savedState as unknown as GenerationState),
            runId: snapshot.run_id,
            projectId: snapshot.project_id,
            drafts: new Map(
              Object.entries(draftsObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
            critiques: new Map(
              Object.entries(critiquesObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
            revisionCount: new Map(
              Object.entries(revisionObj).map(([k, v]) => [parseInt(k, 10), v])
            ),
            isPaused: true, // Keep paused until explicitly resumed
          };

          this.activeRuns.set(state.runId, state);

          // Notify clients that the run is restored
          await this.publishEvent(state.runId, "run_restored", {
            message: "Generation restored after server restart. Call resume to continue.",
            phase: state.phase,
            currentScene: state.currentScene,
          });

          console.log(`Orchestrator: Restored run ${state.runId} (phase: ${state.phase}, scene: ${state.currentScene})`);
          restoredCount++;
        } catch (error) {
          console.error(`Orchestrator: Failed to restore run ${snapshot.run_id}:`, error);
        }
      }

      console.log(`Orchestrator: Successfully restored ${restoredCount}/${snapshots.length} interrupted runs`);
      return restoredCount;
    } catch (error) {
      console.error("Orchestrator: Error restoring interrupted runs:", error);
      return 0;
    }
  }

  /**
   * Check if shutdown is in progress
   */
  get shuttingDown(): boolean {
    return this.isShuttingDown;
  }
}
