# MANOE - Multi-Agent Narrative Orchestration Engine

A scalable, event-driven platform designed to automate the creation of exceptional narratives by strictly adhering to proven storytelling principles from the "Storyteller" framework. MANOE uses a multi-agent architecture where specialized AI agents collaborate in real-time to generate compelling stories.

## Live Demo

- **Frontend**: https://manoe.iliashalkin.com
- **API Gateway (ts.ed)**: https://manoe-gateway.iliashalkin.com
- **Orchestrator API**: https://manoe-orchestrator.iliashalkin.com
- **Langfuse Dashboard**: https://langfuse.iliashalkin.com

## System Architecture

MANOE is a distributed system with a React frontend, TypeScript orchestrator (ts.ed), and multiple infrastructure services. The architecture follows an event-driven pattern where the orchestrator publishes events to Redis Streams, and the frontend subscribes via Server-Sent Events (SSE) for real-time updates.

```mermaid
flowchart TB
    subgraph Client["Frontend - React + Vite"]
        UI["GenerationPage + AgentChat"]
        SSE["useGenerationStream"]
        Supabase_Auth["Supabase Auth"]
    end

    subgraph Gateway["API Gateway - ts.ed"]
        API["OrchestrationController"]
        Orchestrator["StorytellerOrchestrator"]
        
        subgraph Agents["9 Specialized AI Agents"]
            Architect["Architect"]
            Profiler["Profiler"]
            Worldbuilder["Worldbuilder"]
            Strategist["Strategist"]
            Writer["Writer"]
            Critic["Critic"]
            Originality["Originality"]
            Impact["Impact"]
            Archivist["Archivist"]
        end
        
        LLMService["LLMProviderService"]
        LangfuseService["LangfuseService"]
    end

    subgraph Infrastructure["Infrastructure Services"]
        Redis[("Redis Streams")]
        Supabase[("Supabase")]
        Qdrant[("Qdrant")]
        Langfuse[("Langfuse")]
    end

    subgraph LLMProviders["LLM Providers BYOK"]
        OpenAI["OpenAI"]
        Anthropic["Anthropic"]
        Gemini["Google Gemini"]
        OpenRouter["OpenRouter"]
        DeepSeek["DeepSeek"]
        Venice["Venice AI"]
    end

    UI -->|POST /generate| API
    API -->|startGeneration| Orchestrator
    Orchestrator --> Agents
    Agents --> LLMService
    LLMService --> LLMProviders
    LLMService --> LangfuseService
    LangfuseService -->|Traces| Langfuse
    
    Orchestrator -->|publishEvent| Redis
    Redis -->|streamEvents| SSE
    SSE -->|Real-time updates| UI
    
    Orchestrator -->|saveArtifact| Supabase
    Agents -->|storeMemory| Qdrant
    UI -->|Auth| Supabase_Auth
    Supabase_Auth --> Supabase
```

## Detailed Architecture Diagrams

### Request Lifecycle

This sequence diagram shows the complete flow from when a user clicks "Generate" to receiving real-time updates:

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant GW as API Gateway
    participant O as Orchestrator
    participant R as Redis Streams
    participant L as LLM Provider
    participant S as Supabase
    participant Q as Qdrant

    rect rgb(240, 248, 255)
        Note over U,GW: 1. Request Initiation
        U->>FE: Click Generate
        FE->>GW: POST /orchestration/generate
        GW->>O: startGeneration(options)
        O-->>GW: runId
        GW-->>FE: 202 Accepted + runId
    end

    rect rgb(255, 250, 240)
        Note over FE,R: 2. SSE Connection
        FE->>GW: GET /orchestration/stream/{runId}
        GW->>R: Subscribe to run:{runId}
    end

    rect rgb(240, 255, 240)
        Note over O,Q: 3. Generation Loop (12 phases)
        O->>R: generation_started
        R-->>FE: SSE event
        O->>Q: Retrieve character/world context
        Q-->>O: Vector search results
        O->>L: Generate with context
        L-->>O: AI response
        O->>S: Save artifact to run_artifacts
        O->>Q: Store embeddings
        O->>R: agent_complete
        R-->>FE: SSE event
    end

    rect rgb(255, 240, 245)
        Note over O,FE: 4. Completion
        O->>R: generation_complete
        R-->>FE: Final SSE event
        FE->>U: Display generated story
    end
```

### Generation Workflow State Machine

MANOE implements a 12-phase generation workflow with revision loops and quality gates:

```mermaid
flowchart LR
    subgraph Planning["Phase 1-6: Planning"]
        direction LR
        G[Genesis] --> C[Characters]
        C --> N[Narrator Design]
        N --> W[Worldbuilding]
        W --> O[Outlining]
        O --> AP[Advanced Planning]
    end
    
    subgraph Execution["Phase 7-9: Drafting Loop"]
        direction LR
        D[Drafting] --> CR[Critique]
        CR -->|score < 7| R[Revision]
        R --> CR
        CR -->|score >= 7| PASS[Pass]
    end
    
    subgraph Quality["Phase 10-12: Quality"]
        direction LR
        OC[Originality Check] --> IA[Impact Assessment]
        IA --> P[Polish]
    end
    
    AP --> D
    PASS --> OC
    P --> DONE((Done))
```

**Workflow Details:**
- **Planning (6 phases)**: Architect creates narrative possibility, Profiler builds characters, Worldbuilder creates setting, Strategist plans scenes
- **Drafting Loop**: Writer drafts scene → Critic scores (threshold 7/10) → Revision if needed (max 2 iterations)
- **Archivist**: Runs every 3 scenes to update Key Constraints and prevent context drift
- **Quality Gates**: Originality check (plagiarism), Impact assessment (emotional resonance), Polish (final refinement)

### Agent System & Data Dependencies

Each of the 9 agents has specific data inputs and outputs:

```mermaid
flowchart TB
    subgraph Inputs["Data Sources"]
        Seed[/"User Seed Idea"/]
        Outline[("Outline from Supabase")]
        Memory[("Vector Memory from Qdrant")]
        Constraints["Key Constraints"]
    end
    
    subgraph PlanningAgents["Planning Agents"]
        direction LR
        Architect["Architect"]
        Profiler["Profiler"]
        Worldbuilder["Worldbuilder"]
        Strategist["Strategist"]
    end
    
    subgraph ExecutionAgents["Execution Agents"]
        direction LR
        Writer["Writer"]
        Critic["Critic"]
    end
    
    subgraph QualityAgents["Quality Agents"]
        direction LR
        Originality["Originality"]
        Impact["Impact"]
        Archivist["Archivist"]
    end
    
    subgraph Storage["Persistence Layer"]
        DB[(Supabase)]
        Vec[(Qdrant)]
        Stream[(Redis Streams)]
    end
    
    Seed --> Architect
    Architect --> DB
    Architect --> Stream
    
    Profiler --> DB
    Profiler --> Vec
    
    Worldbuilder --> DB
    Worldbuilder --> Vec
    
    Outline --> Writer
    Memory --> Writer
    Constraints --> Writer
    Writer --> DB
    Writer --> Vec
    
    Writer <--> Critic
    Archivist --> Constraints
    
    Originality --> DB
    Impact --> DB
```

**Agent Responsibilities:**

| Agent | Phase | Input | Output |
|-------|-------|-------|--------|
| Architect | Genesis, Outlining | Seed idea | Narrative possibility, Scene outline |
| Profiler | Characters | Seed idea | Character profiles + embeddings |
| Worldbuilder | Worldbuilding | Characters | World elements + embeddings |
| Strategist | Advanced Planning | Outline | Detailed scene plans |
| Writer | Drafting, Revision | Outline, Context, Constraints | Scene drafts + embeddings |
| Critic | Critique | Draft | Score (1-10) + feedback |
| Originality | Originality Check | Full draft | Plagiarism score |
| Impact | Impact Assessment | Full draft | Emotional resonance score |
| Archivist | Every 3 scenes | Raw facts | Updated Key Constraints |

### Data Model / Persistence

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : owns
    PROJECTS ||--o{ RUN_ARTIFACTS : contains
    PROJECTS ||--o{ CHARACTERS : has
    PROJECTS ||--o{ WORLDBUILDING : has
    PROJECTS ||--o{ OUTLINES : has
    PROJECTS ||--o{ DRAFTS : has
    PROJECTS ||--o{ RESEARCH_RESULTS : has
    DRAFTS ||--o{ CRITIQUES : receives
    
    PROJECTS {
        uuid id PK
        uuid user_id FK
        string seed_idea
        jsonb settings
        timestamp created_at
    }
    
    RUN_ARTIFACTS {
        uuid id PK
        uuid project_id FK
        string run_id
        string phase
        string artifact_type
        jsonb content
    }
    
    CHARACTERS {
        uuid id PK
        uuid project_id FK
        string name
        string archetype
        string qdrant_point_id
    }
    
    DRAFTS {
        uuid id PK
        uuid project_id FK
        int scene_number
        text content
        int revision_count
    }
    
    CRITIQUES {
        uuid id PK
        uuid draft_id FK
        float score
        jsonb feedback
        boolean passed
    }
```

**Key Tables:**
- `projects` - User projects with seed idea and generation settings
- `run_artifacts` - All phase outputs (JSONB content for flexibility)
- `characters` / `worldbuilding` - Linked to Qdrant via `qdrant_point_id`
- `drafts` / `critiques` - Scene content with revision tracking
- `research_results` - "Eternal Memory" for cross-project reuse

### Qdrant Vector Collections

```mermaid
flowchart TB
    subgraph Embedding["Embedding Pipeline"]
        Text["Text Content"] --> Embed["text-embedding-3-small"]
        Embed --> Vector["1536-dim Vector"]
    end
    
    subgraph Collections["Qdrant Collections"]
        Characters[("characters
        Character profiles")]
        World[("worldbuilding
        World elements")]
        Scenes[("scenes
        Scene content")]
    end
    
    subgraph Agents["Agent Operations"]
        direction LR
        Profiler["Profiler"] -->|store| Characters
        Worldbuilder["Worldbuilder"] -->|store| World
        Writer["Writer"] -->|store| Scenes
    end
    
    subgraph Retrieval["Context Retrieval"]
        Query["Scene Context Query"]
        Query -->|similarity search| Characters
        Query -->|similarity search| World
        Query -->|similarity search| Scenes
        Characters --> Context["Combined Context"]
        World --> Context
        Scenes --> Context
        Context --> Writer
    end
```

**Vector Memory Features:**
- **Embedding Model**: OpenAI text-embedding-3-small (1536 dimensions)
- **Similarity Search**: Cosine similarity for context retrieval
- **Cross-Collection Queries**: Writer retrieves from all 3 collections for scene context
- **Eternal Memory**: Embeddings persist across generation runs for continuity

### Repository Structure Map

```mermaid
flowchart TB
    subgraph Root["manoe/"]
        subgraph FE["frontend/ - React + Vite"]
            FE_Pages["pages/
            GenerationPage.tsx
            DashboardPage.tsx"]
            FE_Comp["components/
            AgentChat.tsx
            SettingsModal.tsx"]
            FE_Hooks["hooks/
            useGenerationStream.ts
            useProjects.ts"]
        end
        
        subgraph GW["api-gateway/ - ts.ed"]
            GW_Ctrl["controllers/
            OrchestrationController.ts"]
            GW_Svc["services/
            StorytellerOrchestrator.ts
            LLMProviderService.ts
            QdrantMemoryService.ts"]
            GW_Models["models/
            AgentModels.ts
            LLMModels.ts"]
        end
        
        subgraph Infra["Infrastructure"]
            Docker["docker-compose.yml"]
            Supabase["supabase/migrations/"]
            GHA[".github/workflows/"]
        end
    end
```

**Key Files:**

| File | Lines | Description |
|------|-------|-------------|
| `frontend/src/components/AgentChat.tsx` | 2534 | Agent cards with real-time updates |
| `api-gateway/src/services/StorytellerOrchestrator.ts` | 1435 | Main orchestration logic |
| `api-gateway/src/models/AgentModels.ts` | - | 9 agents, 12 phases definitions |
| `api-gateway/src/models/LLMModels.ts` | - | 6 LLM provider configurations |

### SSE Event Types

The orchestrator publishes events to Redis Streams for real-time frontend updates via Server-Sent Events:

```mermaid
flowchart TB
    subgraph Lifecycle["Generation Lifecycle Events"]
        Start["generation_started"] --> Phase["phase_start"]
        Phase --> Agent["agent_start"]
        Agent --> Complete["agent_complete"]
        Complete -->|next phase| Phase
        Complete -->|all done| Done["generation_complete"]
    end
    
    subgraph Special["Special Events"]
        Archivist["new_developments_collected"]
        Heartbeat["heartbeat (15s)"]
    end
    
    subgraph Errors["Error Events"]
        Cancel["generation_cancelled"]
        Error["generation_error"]
    end
    
    Complete -->|every 3 scenes| Archivist
    Archivist --> Complete
```

**Event Payload Structure:**

| Event | Key Fields | Description |
|-------|-----------|-------------|
| `generation_started` | runId, projectId | Run initialized |
| `phase_start` | phase, phaseNumber | New phase beginning |
| `agent_start` | agentName, phase | Agent activated |
| `agent_complete` | agentName, output | Agent output ready |
| `new_developments_collected` | constraints | Archivist update |
| `generation_complete` | totalPhases, duration | All phases done |
| `heartbeat` | timestamp | Keep-alive (15s interval) |

## Generation Workflow

MANOE implements a **12-phase narrative generation workflow** with revision loops and quality gates:

```mermaid
flowchart LR
    subgraph Planning["Planning Phases"]
        G[Genesis] --> C[Characters]
        C --> N[Narrator Design]
        N --> W[Worldbuilding]
        W --> O[Outlining]
        O --> AP[Advanced Planning]
    end
    
    subgraph Execution["Execution Loop (per scene)"]
        D[Drafting] --> CR[Critique]
        CR -->|"needs work"| R[Revision]
        R -->|"max 2 iterations"| CR
        CR -->|"passed"| D2[Next Scene]
    end
    
    subgraph Quality["Quality Gates"]
        OC[Originality Check] --> IA[Impact Assessment]
        IA --> P[Polish]
    end
    
    AP --> D
    D2 -->|"all scenes done"| OC
    
    style G fill:#e1f5fe
    style P fill:#c8e6c9
```

The workflow is orchestrated by `StorytellerOrchestrator.ts` (1435 lines) which manages phase transitions, revision loops, and the Archivist agent that runs every 3 scenes to update Key Constraints for continuity.

### Phase 1: Genesis
The Genesis agent accepts a "Seed Idea" from the user (What If? questions, image prompts) and configures the "Moral Compass" (Ethical, Unethical, Amoral, Ambiguous). It generates a structured "Narrative Possibility" JSON that defines the story's foundation, including plot summary, setting, main conflict, and thematic elements.

### Phase 2: Characters (Profiler Agent)
The Profiler assigns archetypes (Hero, Shadow, Trickster) to characters and generates "Core Psychological Wound" and "Inner Trap" for protagonists. Character attributes are stored as vectors in Qdrant for consistency across the narrative.

### Phase 2.5: Narrator Design
The Narrator Design phase generates the narrative voice configuration including POV type (first person, third person limited/omniscient), tense, voice characteristics, and style guidelines. This artifact is used by the Writer agent during the Drafting phase to maintain consistent narrative voice.

### Phase 3: Worldbuilding
The Worldbuilder creates detailed world elements including locations, cultures, rules, and atmosphere. These elements are stored in Qdrant vector memory for retrieval during scene writing.

### Phase 4: Outlining (Architect Agent)
The Architect maps the plot onto "Mythic Structure" (Hero's Journey, Three-Act Structure) and creates a scene-by-scene outline with conflict, emotional beats, and subtext.

### Phase 5: Advanced Planning
Generates detailed planning artifacts including contradiction maps, emotional beat sheets, sensory blueprints, subtext design, and complexity checklists to ensure narrative coherence.

### Phase 6: Drafting (Writer Agent)
The Writer drafts scenes using "Show, Don't Tell" principles. Each scene is written with full context from Qdrant memory including relevant characters, worldbuilding elements, and previous scenes for continuity.

### Phase 7: Polish (Editor Agent)
The Editor refines the draft with iterative quality checks, validating pacing, originality, dialogue, and subtext. This phase involves up to 2 revision rounds per scene until quality standards are met.

## Key Features

### Selective Regeneration

MANOE supports two types of selective regeneration for iterative refinement:

**Phase-Based Regeneration**: Edit any agent's output and regenerate from that phase onwards. Previous phases are preserved using stored artifacts from Supabase. Use the "What did you change?" field to pass instructions to the AI about your modifications.

**Scene-Level Regeneration**: Select specific scenes to regenerate via the Writer agent's modal UI. The system maintains continuity between old and new scenes using Qdrant memory context.

### Memory Context System

The system uses Qdrant vector database to maintain narrative consistency:

- **Character Memory**: Character profiles are embedded and retrieved based on scene relevance
- **Worldbuilding Memory**: World elements are stored and retrieved for consistent world details
- **Scene Memory**: Previous scenes are embedded for continuity in subsequent scenes

### Artifact Persistence

All generation artifacts are stored in Supabase for resuming interrupted generations, phase-based selective regeneration, scene-level selective regeneration, and project history/versioning.

### Marketing Research Integration

MANOE includes an optional **Marketing Researcher** feature that uses AI-powered deep research to analyze your target audience before generation begins. This helps create more targeted and resonant narratives.

**Supported Research Providers:**
- **Perplexity** (sonar-deep-research model) - Fast, comprehensive web research
- **OpenAI Deep Research** (Responses API with background mode) - In-depth analysis taking 5-15 minutes

**Features:**
- **BYOK (Bring Your Own Key)** - Add your Perplexity or OpenAI API key in Settings > Research
- **Eternal Memory** - Research results are stored in Supabase and vectorized in Qdrant for reuse across projects
- **Semantic Similarity Search** - Before conducting new research, the system checks for similar existing research (>50% similarity threshold) to save costs
- **Prompt Context Injection** - Research insights are automatically injected into Genesis and Characters agent prompts

**How to Use:**
1. Add your Perplexity or OpenAI API key in Settings > Research tab
2. On the project creation page, click the "Research" button next to Target Audience
3. Select your preferred provider and click "Start Research"
4. View research history in Settings > Research History

### LLM Observability (Langfuse)

MANOE includes self-hosted **Langfuse** for complete LLM observability:

- **Langfuse Dashboard**: https://langfuse.iliashalkin.com
- **Trace Visualization**: See the full trace tree for each generation run
- **Token Usage Tracking**: Monitor input/output tokens per agent call
- **Latency Metrics**: Track response times across different LLM providers
- **Error Debugging**: Inspect failed LLM calls with full request/response data

**Langfuse Prompt Management:**

MANOE uses Langfuse Prompt Management for versioned prompts with production labels:
- `manoe-architect-v1` - Story structure and narrative design
- `manoe-profiler-v1` - Character creation and psychology
- `manoe-worldbuilder-v1` - Setting and world details
- `manoe-writer-v1` - Prose generation
- `manoe-critic-v1` - Quality evaluation and feedback

**Model Selection Architecture:**

The model used for generation is determined by the following precedence:
1. **Request `llmConfig.model`** - User's selection from frontend settings (highest priority)
2. **Environment variable** - Server-side default (e.g., `OPENAI_API_KEY` enables OpenAI)
3. **`DEFAULT_MODELS`** - Code defaults in `LLMModels.ts` (gpt-5.2 for OpenAI)

The `config.model` field in Langfuse prompts is metadata/documentation only - it does not override the user's model selection. Langfuse tracing shows the actual model used in each generation, not the prompt's config.model.

**Self-Hosted Stack:**
| Service | Description |
|---------|-------------|
| langfuse-web | Web UI and API (Next.js) |
| langfuse-worker | Background job processor |
| langfuse-postgres | PostgreSQL database |
| langfuse-clickhouse | Analytics database |
| langfuse-redis | Caching and queues |
| langfuse-minio | S3-compatible blob storage |

Tracing is automatically enabled when `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are configured in the orchestrator environment.

### State Recovery & Retry Mechanism

MANOE includes robust error handling for long-running generations:

- **Automatic Retry** - Transient errors (429 rate limits, 5xx server errors, timeouts) are automatically retried with exponential backoff (up to 3 attempts)
- **Phase Checkpointing** - Each completed phase is saved to Supabase, allowing resume from the last successful phase
- **Graceful Interruption Handling** - If the orchestrator restarts during generation, the frontend receives a clear error message with resume information instead of hanging

### Multi-Provider LLM Support (BYOK)

MANOE supports multiple LLM providers with BYOK (Bring Your Own Key). Configure at least one provider to get started.

## Quick Start with Docker

The fastest way to get started is using Docker Compose:

```bash
# Clone the repository
git clone https://github.com/IShalkin/manoe.git
cd manoe

# Configure your API keys
cp .env.example .env
# Edit .env with your API keys (at least one LLM provider required)

# Start all services
docker-compose up -d

# Access the frontend at http://localhost:5173
# Access the orchestrator API at http://localhost:8001
```

### Docker Services

The docker-compose.yml includes the following services:

| Service | Port | Description |
|---------|------|-------------|
| **frontend** | 5173 | React + TypeScript + Vite web interface |
| **orchestrator** | 8001 | Python FastAPI AI orchestrator with SSE |
| **redis** | 6379 | Message broker for real-time SSE events |
| **qdrant** | 6333 | Vector database for character/worldbuilding memory |
| **langfuse-web** | 3000 | Langfuse observability UI and API |

### Environment Variables for Docker

Create a `.env` file in the root directory with your API keys:

```env
# Required: At least one LLM provider
OPENAI_API_KEY=your-openai-key
# Or use other providers:
# ANTHROPIC_API_KEY=your-anthropic-key
# GEMINI_API_KEY=your-gemini-key
# VENICE_API_KEY=your-venice-key

# Optional: Supabase for persistence
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### Model Tiers (December 2025)

| Tier | Model | Release | Best For | Verdict |
|------|-------|---------|----------|---------|
| **S+ Logic** | Gemini 3 Pro | Nov 2025 | Complex plot logic | New king of AI. Google finally surpassed everyone. Deep Think integrated into core. Builds dynamic world model of your plot. |
| **S+ Prose** | Claude Opus 4.5 | Nov 2025 | Living prose, RP | Most human-like AI. Talented writer. Best for RP and literature. Many prefer it for style over technically stronger models. |
| **S+ Uncensored** | Dolphin Mistral 24B Venice | Apr 2025 | Dark plots, roleplay | Best uncensored model for creativity. No moralizing. Perfect for dark plots and political intrigue. |
| **A+ Context** | Llama 4 Maverick (Venice) | May 2025 | 256k context | 256k context with Venice jailbreak. 3x fewer refusals. Technically smarter than Dolphin. |
| **A** | GPT-5.2 | Dec 2025 | Fast logic | Improved routing (decides when to think deep vs fast). Less moralistic than 5.0. |

### Supported LLM Providers

| Provider | Top Models | Best For |
|----------|------------|----------|
| **OpenAI** | GPT-5.2, GPT-5, O3, GPT-4o | Reasoning, general purpose |
| **Google Gemini** | Gemini 3 Pro, Gemini 3 Flash, Gemini 2.0 Flash | Long context (2M tokens), complex logic |
| **Anthropic Claude** | Claude Opus 4.5, Claude Sonnet 4, Claude 3.5 Sonnet | Creative writing, prose quality |
| **Venice AI** | Dolphin Mistral 24B, Llama 4 Maverick, Qwen 3 235B | Uncensored content, dark themes |
| **DeepSeek** | DeepSeek V3, DeepSeek R1 | Cost-effective reasoning |
| **OpenRouter** | Access to all above via single API | Cost optimization, model variety |

### Moral Compass Framework

Generate narratives through different ethical lenses:
- **Ethical**: Traditional hero's journey with clear moral lessons
- **Unethical**: Villain protagonists, morally dark narratives
- **Amoral**: Neutral perspective without moral judgment
- **Ambiguous**: Complex moral situations without clear answers

## Project Structure

```
manoe/
├── frontend/                    # React + TypeScript + Vite Frontend
│   ├── src/
│   │   ├── components/          # UI components
│   │   │   ├── AgentChat.tsx    # Agent cards and regeneration modals
│   │   │   ├── Layout.tsx       # App layout
│   │   │   └── SettingsModal.tsx
│   │   ├── contexts/            # React contexts (Auth, Settings)
│   │   ├── hooks/               # Custom hooks (useProjects, useSettings)
│   │   ├── pages/
│   │   │   ├── GenerationPage.tsx  # Main generation UI
│   │   │   ├── DashboardPage.tsx
│   │   │   └── ...
│   │   └── lib/                 # Utilities and Supabase client
│   └── package.json
├── api-gateway/                 # TypeScript ts.ed API Gateway
│   ├── src/
│   │   ├── controllers/         # ts.ed controllers with Swagger decorators
│   │   │   └── OrchestrationController.ts  # Generation endpoints
│   │   ├── services/            # Business logic services
│   │   │   ├── LLMProviderService.ts       # Multi-provider LLM client (BYOK)
│   │   │   ├── StorytellerOrchestrator.ts  # Multi-agent orchestration engine
│   │   │   ├── LangfuseService.ts          # Tracing + Prompt Management
│   │   │   ├── RedisStreamsService.ts      # SSE event streaming
│   │   │   ├── QdrantMemoryService.ts      # Vector memory
│   │   │   └── SupabaseService.ts          # Artifact persistence
│   │   ├── models/              # DTOs and type definitions
│   │   │   ├── LLMModels.ts     # LLM provider types and defaults
│   │   │   └── AgentModels.ts   # Agent types and phase configs
│   │   └── Server.ts            # ts.ed server configuration
│   └── package.json
├── supabase/                    # Supabase configuration and migrations
├── docs/                        # Documentation
├── docker-compose.yml           # Docker Compose for local development
└── docker-compose.vps.yml       # Docker Compose for VPS deployment
```

## Supabase Schema

The following tables are used for persistence:

| Table | Description |
|-------|-------------|
| **projects** | User projects with seed_idea, settings, moral_compass |
| **run_artifacts** | Phase artifacts (project_id UUID FK, run_id, phase, artifact_type, content JSONB) |
| **research_results** | Marketing research results with prompt_context for AI injection, citations, and Qdrant point_id for semantic search |
| **characters** | Generated character profiles |
| **worldbuilding** | World elements and settings |
| **outlines** | Plot outlines with scene breakdowns |
| **drafts** | Scene drafts with narrative content |
| **critiques** | Editor feedback and quality scores |

## API Endpoints

### Orchestrator API (Port 8001)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/generate` | POST | Start multi-agent generation |
| `/runs/{run_id}/events` | GET | SSE stream for real-time events |
| `/runs/{run_id}/messages` | GET | Get all agent messages for a run |
| `/runs/{run_id}/state` | GET | Get run state for recovery after interruption |
| `/runs/{run_id}/cancel` | POST | Cancel a running generation |
| `/runs/{run_id}/pause` | POST | Pause a running generation |
| `/runs/{run_id}/resume` | POST | Resume a paused generation |
| `/research` | POST | Conduct market research (Perplexity or OpenAI Deep Research) |
| `/research/history` | GET | Get user's research history |
| `/research/{research_id}` | GET | Get specific research result |
| `/research/similar` | POST | Search for similar existing research |

### Generate Request Body

```json
{
  "seed_idea": "What if a detective could see the last 10 seconds of a murder victim's life?",
  "moral_compass": "ambiguous",
  "target_audience": "Adult thriller readers",
  "themes": "justice,memory,truth",
  "provider": "openai",
  "model": "gpt-4o",
  "api_key": "your-api-key",
  "supabase_project_id": "uuid-of-project",
  "start_from_phase": "characters",
  "previous_run_id": "uuid-of-previous-run",
  "scenes_to_regenerate": [2, 5],
  "constraints": {
    "edit_comment": "Make the protagonist more conflicted about their abilities"
  }
}
```

## Environment Variables

### Frontend
- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key
- `VITE_ORCHESTRATOR_URL` - Orchestrator API URL

### Orchestrator
- `REDIS_URL` - Redis connection URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service key (required for artifact persistence)
- `QDRANT_URL` - Qdrant server URL (required for memory context features)
- `LANGFUSE_PUBLIC_KEY` - Langfuse public key (enables tracing)
- `LANGFUSE_SECRET_KEY` - Langfuse secret key (enables tracing)
- `LANGFUSE_HOST` - Langfuse host URL (default: http://langfuse-web:3000 for self-hosted)

## Development Setup

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

### API Gateway (ts.ed)

```bash
cd api-gateway
npm install
cp .env.example .env
# Configure environment variables
npm run dev
```

## Deployment

For VPS deployment, use the provided `docker-compose.vps.yml`:

```bash
# On your VPS
docker compose -f docker-compose.vps.yml up -d
```

The VPS configuration includes nginx-proxy integration for automatic SSL certificates via Let's Encrypt.

## Success Metrics

The system aims for high-quality narrative output measured by structural adherence (100% of scenes match the generated outline), psychological depth (every protagonist has defined "Inner Trap" and "Breaking Point"), and sensory density (every scene contains at least 3 distinct sensory details).

## License

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0)**.

You are free to share and adapt this work for non-commercial purposes, provided you give appropriate credit and distribute any derivative works under the same license.

**Citation:**
```
Shalkin, I. (2025). MANOE: Multi-Agent Narrative Orchestration Engine. 
GitHub. https://github.com/IShalkin/manoe
```

For commercial licensing inquiries, contact: mailtoshalkin@gmail.com

See [LICENSE](LICENSE) for full details.

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.
