# MANOE Project Codemap

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Directory Structure](#directory-structure)
4. [Core Concepts](#core-concepts)
5. [Backend (API Gateway)](#backend-api-gateway)
6. [Frontend](#frontend)
7. [Data Flow](#data-flow)
8. [Agent System](#agent-system)
9. [Services Layer](#services-layer)
10. [Real-time Communication](#real-time-communication)
11. [Database Schema](#database-schema)
12. [Key Interactions](#key-interactions)

---

## Project Overview

MANOE (Multi-Agent Narrative Orchestration Engine) is a sophisticated AI-powered storytelling system that uses multiple specialized AI agents to collaboratively generate long-form narratives. The system orchestrates 9 specialized agents through a 12-phase generation workflow, producing coherent, high-quality stories while maintaining narrative consistency.

### Key Features

The system implements a "Glass Brain" observability model where users can watch the AI agents "think" and collaborate in real-time. It supports multiple LLM providers (OpenAI, Anthropic, Google Gemini, DeepSeek, Venice AI, OpenRouter) through a BYOK (Bring Your Own Key) model, allowing users to use their own API keys.

### Technology Stack

The backend is built with TypeScript using the Ts.ED framework, which provides dependency injection and decorator-based routing similar to NestJS. The frontend is a React application with TypeScript, using Tailwind CSS for styling. Data persistence is handled by Supabase (PostgreSQL), vector memory by Qdrant, real-time events by Redis Streams, and observability by Langfuse.

---

## Architecture Diagram

```
+------------------+     +-------------------+     +------------------+
|                  |     |                   |     |                  |
|    Frontend      |<--->|   API Gateway     |<--->|    Supabase      |
|    (React)       | SSE |   (Ts.ED)         |     |   (PostgreSQL)   |
|                  |     |                   |     |                  |
+------------------+     +--------+----------+     +------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
              +-----v----+  +-----v----+  +-----v----+
              |          |  |          |  |          |
              |  Qdrant  |  |  Redis   |  | Langfuse |
              | (Vector) |  | (Events) |  | (Traces) |
              |          |  |          |  |          |
              +----------+  +----------+  +----------+
                    |
              +-----v-----------------------------------------+
              |                                               |
              |           LLM Providers (BYOK)                |
              |  OpenAI | Anthropic | Gemini | DeepSeek | ... |
              |                                               |
              +-----------------------------------------------+
```

---

## Directory Structure

```
manoe/
├── api-gateway/                 # Backend TypeScript application
│   ├── src/
│   │   ├── agents/              # 9 specialized AI agents
│   │   │   ├── BaseAgent.ts     # Abstract base class for all agents
│   │   │   ├── AgentFactory.ts  # Factory for creating agent instances
│   │   │   ├── ArchitectAgent.ts
│   │   │   ├── ProfilerAgent.ts
│   │   │   ├── WorldbuilderAgent.ts
│   │   │   ├── StrategistAgent.ts
│   │   │   ├── WriterAgent.ts
│   │   │   ├── CriticAgent.ts
│   │   │   ├── OriginalityAgent.ts
│   │   │   ├── ImpactAgent.ts
│   │   │   └── ArchivistAgent.ts
│   │   ├── controllers/         # HTTP endpoint handlers
│   │   │   ├── OrchestrationController.ts
│   │   │   ├── ProjectController.ts
│   │   │   └── HealthController.ts
│   │   ├── services/            # Business logic services
│   │   │   ├── StorytellerOrchestrator.ts  # Main orchestration engine
│   │   │   ├── LLMProviderService.ts       # Multi-provider LLM client
│   │   │   ├── RedisStreamsService.ts      # Real-time event streaming
│   │   │   ├── QdrantMemoryService.ts      # Vector memory storage
│   │   │   ├── LangfuseService.ts          # Observability & prompts
│   │   │   └── SupabaseService.ts          # Database persistence
│   │   ├── models/              # Type definitions and schemas
│   │   │   ├── AgentModels.ts   # Agent types, states, constraints
│   │   │   └── LLMModels.ts     # LLM provider types, responses
│   │   ├── guardrails/          # Content safety and consistency
│   │   │   ├── ContentGuardrail.ts
│   │   │   └── ConsistencyGuardrail.ts
│   │   └── schemas/             # Zod validation schemas
│   │       └── AgentSchemas.ts
│   └── package.json
│
├── frontend/                    # React TypeScript application
│   ├── src/
│   │   ├── pages/               # Route components
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── GenerationPage.tsx    # Main generation UI
│   │   │   ├── GenerationsPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── components/          # Reusable UI components
│   │   │   ├── AgentChat.tsx         # Agent message display
│   │   │   ├── Layout.tsx
│   │   │   ├── cinematic/            # Glass Brain UI
│   │   │   │   └── CinematicAgentPanel.tsx
│   │   │   └── observability/        # Real-time monitoring
│   │   │       └── WorldStatePanel.tsx
│   │   ├── hooks/               # React custom hooks
│   │   │   ├── useGenerationStream.ts  # SSE event handling
│   │   │   ├── useProjects.ts
│   │   │   ├── useSettings.ts
│   │   │   └── useAuth.ts
│   │   └── lib/                 # Utilities
│   │       └── api.ts           # API client functions
│   └── package.json
│
├── database/                    # Database migrations
├── supabase/                    # Supabase configuration
├── docs/                        # Documentation
└── docker-compose.yml           # Container orchestration
```

---

## Core Concepts

### 1. Generation Run

A "run" is a single execution of the story generation workflow. Each run has a unique `runId` and progresses through 12 phases. The run maintains state including characters, worldbuilding, outlines, drafts, and key constraints.

### 2. Key Constraints

Key Constraints are canonical facts that must be maintained throughout the story. For example, "Character X has a scar on their left cheek" or "The kingdom fell 100 years ago". The Archivist agent manages these constraints, resolving conflicts when new facts contradict existing ones.

### 3. Raw Facts

Raw facts are extracted from generated content (drafts, revisions) and represent potential story facts. The Archivist processes raw facts every 3 scenes to update the Key Constraints.

### 4. Generation Phases

The 12 phases are: GENESIS, CHARACTERS, NARRATOR_DESIGN, WORLDBUILDING, OUTLINING, ADVANCED_PLANNING, DRAFTING, CRITIQUE, REVISION, ORIGINALITY_CHECK, IMPACT_ASSESSMENT, and POLISH.

### 5. Writer-Critic Loop

During drafting, each scene goes through a Writer-Critic revision loop with a maximum of 2 iterations. The Writer drafts, the Critic evaluates, and if revision is needed, the Writer revises based on feedback.

---

## Backend (API Gateway)

### Entry Point

The application starts in `src/Server.ts` which configures the Ts.ED framework, sets up middleware, and initializes services through dependency injection.

### Controllers

Controllers handle HTTP requests and delegate to services. The main controller is `OrchestrationController.ts` which exposes endpoints for starting generation, streaming events, and managing runs.

**Key Endpoints:**
- `POST /generate` - Start a new generation run
- `GET /runs/:runId/events` - SSE endpoint for real-time events
- `GET /runs/:runId/status` - Get run status
- `POST /runs/:runId/pause` - Pause a run
- `POST /runs/:runId/resume` - Resume a paused run
- `POST /runs/:runId/cancel` - Cancel a run

### Services

Services contain the business logic and are injected into controllers and other services.

**StorytellerOrchestrator** is the heart of the system. It manages the generation workflow, coordinates agents, maintains state, and publishes events. Key methods include:
- `startGeneration()` - Initialize a new run
- `runGeneration()` - Execute the full workflow
- `runGenesisPhase()`, `runCharactersPhase()`, etc. - Phase-specific logic
- `draftScene()`, `critiqueScene()`, `reviseScene()` - Scene generation loop

**LLMProviderService** provides a unified interface to multiple LLM providers. It handles API key management (BYOK), request formatting for each provider, and automatic retry with exponential backoff.

**RedisStreamsService** manages real-time event streaming using Redis Streams. Events are published to run-specific streams and consumed by SSE endpoints.

**QdrantMemoryService** provides vector storage for semantic search. It stores characters, worldbuilding elements, and scenes as embeddings for retrieval during generation.

**LangfuseService** handles observability (tracing LLM calls) and Prompt Management (fetching prompts from Langfuse dashboard).

**SupabaseService** handles database operations for projects, characters, outlines, drafts, and audit logs.

---

## Frontend

### Pages

**GenerationPage** is the main UI for story generation. It displays the agent chat, handles SSE events, and provides controls for regeneration and editing.

**DashboardPage** shows the list of projects and allows creating new ones.

**SettingsPage** allows users to configure their API keys and agent settings.

### Components

**AgentChat** displays messages from agents in a chat-like interface. It shows the current phase, active agent, and generated content.

**CinematicAgentPanel** provides the "Glass Brain" view where users can see agent thoughts, dialogues, and conflicts in real-time.

**WorldStatePanel** displays the current world state including key constraints and raw facts.

### Hooks

**useGenerationStream** manages the SSE connection to the backend. It parses events, updates state, and provides callbacks for completion and errors.

**useProjects** manages project CRUD operations using localStorage and Supabase.

**useSettings** manages user settings including API keys and agent configurations.

---

## Data Flow

### 1. Starting Generation

```
User clicks "Generate"
    ↓
GenerationPage.startNewGeneration()
    ↓
POST /generate with seed_idea, moral_compass, provider, api_key
    ↓
OrchestrationController.startGeneration()
    ↓
StorytellerOrchestrator.startGeneration()
    ↓
Initialize state, create runId, start runGeneration() async
    ↓
Return runId to frontend
    ↓
Frontend connects to SSE: GET /runs/:runId/events
```

### 2. Phase Execution

```
runGeneration() starts
    ↓
For each phase:
    ↓
    publishPhaseStart(runId, phase)
        ↓
        RedisStreamsService.publishEvent()
            ↓
            Frontend receives SSE event
                ↓
                useGenerationStream updates currentPhase
    ↓
    Execute phase (e.g., runGenesisPhase())
        ↓
        AgentFactory.getAgent(AgentType.ARCHITECT)
            ↓
            agent.execute(context, options)
                ↓
                BaseAgent.callLLM()
                    ↓
                    LLMProviderService.createCompletionWithRetry()
                        ↓
                        LangfuseService.trackLLMCall()
    ↓
    publishPhaseComplete(runId, phase, artifact)
        ↓
        saveArtifact() to Supabase
```

### 3. Scene Drafting Loop

```
For each scene in outline:
    ↓
    draftScene(runId, options, sceneNum)
        ↓
        WriterAgent.execute()
            ↓
            Generate prose
        ↓
        extractRawFacts() - Extract facts from prose
        ↓
        QdrantMemoryService.storeScene() - Store for retrieval
    ↓
    critiqueScene(runId, options, sceneNum)
        ↓
        CriticAgent.execute()
            ↓
            Evaluate prose, return critique
    ↓
    If critique.revision_needed && revisionCount < maxRevisions:
        ↓
        reviseScene(runId, options, sceneNum, critique)
            ↓
            WriterAgent.execute() with critique feedback
        ↓
        Loop back to critiqueScene()
    ↓
    If sceneNum % 3 === 0:
        ↓
        runArchivistCheck() - Consolidate constraints
```

---

## Agent System

### Agent Hierarchy

All agents extend `BaseAgent` which provides common functionality:
- `callLLM()` - Make LLM calls with tracing
- `parseJSON()` - Parse JSON responses
- `validateOutput()` - Validate against Zod schemas
- `applyGuardrails()` - Apply content and consistency guardrails
- `emitThought()` - Emit cinematic events for Glass Brain UI

### Agent Responsibilities

| Agent | Phase | Responsibility |
|-------|-------|----------------|
| Architect | GENESIS | Design narrative structure, themes, arcs |
| Profiler | CHARACTERS | Create deep character profiles |
| Worldbuilder | WORLDBUILDING | Build settings, cultures, rules |
| Strategist | OUTLINING | Plan scene structure and pacing |
| Writer | DRAFTING, REVISION, POLISH | Generate and refine prose |
| Critic | CRITIQUE | Evaluate prose quality |
| Originality | ORIGINALITY_CHECK | Detect cliches and tropes |
| Impact | IMPACT_ASSESSMENT | Assess emotional resonance |
| Archivist | Every 3 scenes | Manage continuity constraints |

### Agent Factory Pattern

`AgentFactory` uses dependency injection to create and cache agent instances. Each agent receives the same dependencies: LLMProviderService, LangfuseService, ContentGuardrail, ConsistencyGuardrail, and RedisStreamsService.

```typescript
// AgentFactory creates agents on demand
const agent = agentFactory.getAgent(AgentType.WRITER);
const output = await agent.execute(context, options);
```

---

## Services Layer

### LLMProviderService

Supports 6 LLM providers through a unified interface:

```typescript
// All providers use the same interface
const response = await llmProvider.createCompletionWithRetry({
  messages: [{ role: 'system', content: '...' }, { role: 'user', content: '...' }],
  model: 'gpt-4',
  provider: LLMProvider.OPENAI,
  apiKey: 'user-provided-key',
  temperature: 0.7,
  maxTokens: 4096,
});
```

Provider-specific handling:
- **OpenAI**: Uses official SDK, handles new token parameter for GPT-5/O3
- **Anthropic**: Extracts system message, formats for Claude API
- **Gemini**: Builds prompt from messages, uses Google AI SDK
- **OpenRouter/DeepSeek/Venice**: OpenAI-compatible APIs with custom base URLs

### RedisStreamsService

Uses Redis Streams for reliable event delivery:

```typescript
// Publish event
await redisStreams.publishEvent(runId, 'phase_start', { phase: 'genesis' });

// Stream events (async generator)
for await (const event of redisStreams.streamEvents(runId)) {
  // Process event
}
```

Features:
- Automatic stream trimming (MAXLEN)
- Consumer groups for reliable delivery
- Heartbeat events for connection keep-alive
- Global stream for monitoring

### QdrantMemoryService

Stores and retrieves content using vector embeddings:

```typescript
// Store character
await qdrantMemory.storeCharacter(projectId, character);

// Search for relevant characters
const results = await qdrantMemory.searchCharacters(projectId, 'brave warrior', 3);
```

Collections:
- `manoe_characters` - Character profiles
- `manoe_worldbuilding` - World elements
- `manoe_scenes` - Scene content

Embedding providers (priority order):
1. OpenAI text-embedding-3-small (1536 dimensions)
2. Google Gemini embedding-001 (768 dimensions)
3. Local fallback (384 dimensions)

### LangfuseService

Provides observability and prompt management:

```typescript
// Start trace for a run
langfuse.startTrace({ runId, projectId, phase });

// Track LLM call
langfuse.trackLLMCall(runId, 'writer', input, response);

// Get prompt from Langfuse dashboard
const prompt = await langfuse.getCompiledPrompt('manoe-writer-v1', variables);
```

Features:
- Automatic tracing of all LLM calls
- Prompt caching with TTL (5 minutes)
- Label-based prompt versioning (production, staging)
- Cost and latency tracking

---

## Real-time Communication

### SSE (Server-Sent Events)

The frontend connects to `/runs/:runId/events` to receive real-time updates:

```typescript
// Frontend hook
const { currentPhase, activeAgent, messages } = useGenerationStream({ runId });
```

Event types:
- `phase_start` / `phase_complete` - Phase transitions
- `agent_start` / `agent_complete` - Agent activity
- `agent_thought` - Cinematic thought bubble
- `agent_dialogue` - Agent-to-agent communication
- `scene_draft_complete` - Scene drafted
- `generation_complete` - Run finished
- `ERROR` - Error occurred

### Event Flow

```
StorytellerOrchestrator
    ↓
publishEvent(runId, type, data)
    ↓
RedisStreamsService.publishEvent()
    ↓
Redis Stream: manoe:events:{runId}
    ↓
OrchestrationController.streamEvents() (SSE endpoint)
    ↓
EventSource in browser
    ↓
useGenerationStream hook
    ↓
React state update
    ↓
UI re-render
```

---

## Database Schema

### Projects Table

```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users,
  seed_idea TEXT NOT NULL,
  moral_compass TEXT NOT NULL,
  target_audience TEXT,
  theme_core TEXT[],
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Characters Table

```sql
CREATE TABLE characters (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects,
  name TEXT NOT NULL,
  archetype TEXT,
  core_motivation TEXT,
  inner_trap TEXT,
  psychological_wound TEXT,
  visual_signature TEXT,
  qdrant_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Run Artifacts Table

```sql
CREATE TABLE run_artifacts (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL,
  project_id UUID REFERENCES projects,
  artifact_type TEXT NOT NULL,
  content JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Artifact types: `narrative`, `characters`, `worldbuilding`, `outline`, `draft_scene_N`, `critique_scene_N`, `final_scene_N`

---

## Key Interactions

### 1. User Starts Generation

```
[User] → [GenerationPage] → [POST /generate] → [OrchestrationController]
    → [StorytellerOrchestrator.startGeneration()]
    → Returns runId
    → [GenerationPage] connects to SSE
```

### 2. Agent Executes

```
[StorytellerOrchestrator] → [AgentFactory.getAgent()] → [Agent.execute()]
    → [BaseAgent.callLLM()] → [LLMProviderService.createCompletionWithRetry()]
    → [LangfuseService.trackLLMCall()]
    → Returns response
    → [Agent] parses and validates
    → Returns AgentOutput
```

### 3. Event Published

```
[StorytellerOrchestrator.publishEvent()] → [RedisStreamsService.publishEvent()]
    → Redis Stream
    → [OrchestrationController.streamEvents()] reads stream
    → SSE to browser
    → [useGenerationStream] updates state
    → React re-renders
```

### 4. Constraint Management

```
[WriterAgent] generates prose
    → [StorytellerOrchestrator.extractRawFacts()] extracts facts
    → Facts stored in state.rawFactsLog
    → Every 3 scenes: [ArchivistAgent.execute()]
    → Processes raw facts
    → Updates state.keyConstraints
    → Constraints used in future prompts
```

### 5. User Edits and Regenerates

```
[User] edits content in AgentChat
    → [GenerationPage.handleRegenerate()] with constraints
    → [POST /generate] with start_from_phase, edited_content
    → [StorytellerOrchestrator] resumes from specified phase
    → Uses edited content as input
    → Regenerates downstream phases
```

---

## File-by-File Reference

### Backend Core Files

| File | Purpose |
|------|---------|
| `StorytellerOrchestrator.ts` | Main orchestration engine, manages workflow |
| `LLMProviderService.ts` | Multi-provider LLM client adapter |
| `RedisStreamsService.ts` | Real-time event streaming |
| `QdrantMemoryService.ts` | Vector memory for semantic search |
| `LangfuseService.ts` | Observability and prompt management |
| `SupabaseService.ts` | Database persistence |
| `BaseAgent.ts` | Abstract base class for agents |
| `AgentFactory.ts` | Factory for creating agents |
| `AgentModels.ts` | Type definitions for agents |
| `LLMModels.ts` | Type definitions for LLM |

### Frontend Core Files

| File | Purpose |
|------|---------|
| `GenerationPage.tsx` | Main generation UI |
| `AgentChat.tsx` | Agent message display |
| `useGenerationStream.ts` | SSE event handling hook |
| `useProjects.ts` | Project management hook |
| `useSettings.ts` | Settings management hook |
| `api.ts` | API client utilities |

---

## Glossary

| Term | Definition |
|------|------------|
| **BYOK** | Bring Your Own Key - users provide their own LLM API keys |
| **Glass Brain** | Observability mode showing agent thoughts in real-time |
| **Key Constraint** | Canonical fact that must be maintained in the story |
| **Raw Fact** | Extracted fact from generated content, pending canonicalization |
| **Run** | Single execution of the generation workflow |
| **Phase** | Stage in the 12-phase generation workflow |
| **SSE** | Server-Sent Events for real-time updates |
| **Cinematic Event** | Agent thought/dialogue for Glass Brain UI |

---

*This Codemap was generated for educational purposes to help understand the MANOE architecture.*
