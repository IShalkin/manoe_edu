/**
 * Agent Factory
 * 
 * Factory for creating and managing agent instances.
 * Uses dependency injection through Ts.ED and caches agent instances.
 */

import { Service, Inject } from "@tsed/di";
import { AgentType } from "../models/AgentModels";
import { LLMProviderService } from "../services/LLMProviderService";
import { LangfuseService } from "../services/LangfuseService";
import { RedisStreamsService } from "../services/RedisStreamsService";
import { BaseAgent } from "./BaseAgent";
import { ArchitectAgent } from "./ArchitectAgent";
import { ProfilerAgent } from "./ProfilerAgent";
import { WorldbuilderAgent } from "./WorldbuilderAgent";
import { StrategistAgent } from "./StrategistAgent";
import { WriterAgent } from "./WriterAgent";
import { CriticAgent } from "./CriticAgent";
import { OriginalityAgent } from "./OriginalityAgent";
import { ImpactAgent } from "./ImpactAgent";
import { ArchivistAgent } from "./ArchivistAgent";
import { ContentGuardrail, ConsistencyGuardrail } from "../guardrails";

@Service()
export class AgentFactory {
  private agents: Map<AgentType, BaseAgent> = new Map();

  constructor(
    @Inject() private llmProvider: LLMProviderService,
    @Inject() private langfuse: LangfuseService,
    @Inject() private contentGuardrail: ContentGuardrail,
    @Inject() private consistencyGuardrail: ConsistencyGuardrail,
    @Inject() private redisStreams: RedisStreamsService
  ) {}

  /**
   * Get agent instance by type
   * Creates and caches agent instances
   */
  getAgent(agentType: AgentType): BaseAgent {
    if (!this.agents.has(agentType)) {
      this.agents.set(agentType, this.createAgent(agentType));
    }
    return this.agents.get(agentType)!;
  }

  /**
   * Create agent instance
   */
  private createAgent(agentType: AgentType): BaseAgent {
    console.log(`[AgentFactory] Creating agent: ${agentType}, hasRedisStreams: ${!!this.redisStreams}`);
    switch (agentType) {
      case AgentType.ARCHITECT:
        const architect = new ArchitectAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
        console.log(`[AgentFactory] ArchitectAgent created, redisStreams in instance: ${!!(architect as any).redisStreams}`);
        return architect;
      case AgentType.PROFILER:
        return new ProfilerAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.WORLDBUILDER:
        return new WorldbuilderAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.STRATEGIST:
        return new StrategistAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.WRITER:
        return new WriterAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.CRITIC:
        return new CriticAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.ORIGINALITY:
        return new OriginalityAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.IMPACT:
        return new ImpactAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      case AgentType.ARCHIVIST:
        return new ArchivistAgent(this.llmProvider, this.langfuse, this.contentGuardrail, this.consistencyGuardrail, this.redisStreams);
      default:
        throw new Error(`Unknown agent type: ${agentType}`);
    }
  }
}

