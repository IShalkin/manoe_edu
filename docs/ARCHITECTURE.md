# MANOE Architecture Documentation

## System Overview

MANOE (Multi-Agent Narrative Orchestration Engine) is a distributed system designed to generate high-quality narratives through specialized AI agents. The architecture follows an event-driven microservices pattern with clear separation of concerns.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Applications                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (TypeScript/Ts.ED)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Controllers │  │  Services   │  │ Middleware  │  │   Models    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                          ┌────────────┴────────────┐
                          ▼                         ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│         Redis (Message Broker)   │   │      Supabase (PostgreSQL)          │
│  ┌───────────┐  ┌───────────┐   │   │  ┌─────────┐  ┌─────────────────┐   │
│  │  Queues   │  │  Pub/Sub  │   │   │  │ Projects│  │   Audit Logs    │   │
│  └───────────┘  └───────────┘   │   │  └─────────┘  └─────────────────┘   │
└─────────────────────────────────┘   └─────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI Orchestrator (Python/AutoGen)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Architect  │  │   Profiler  │  │  Strategist │  │Writer/Critic│        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Qdrant (Vector Database)                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │   Characters    │  │  Worldbuilding  │  │    Scenes       │             │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. API Gateway (TypeScript/Ts.ED)

The API Gateway serves as the entry point for all client requests. Built with Ts.ED framework for enterprise-grade TypeScript support.

**Responsibilities:**
- Request validation and sanitization
- Authentication and authorization
- Rate limiting and throttling
- Job queue management (Redis producer)
- WebSocket connections for real-time updates

**Key Controllers:**
- `ProjectController` - Project lifecycle management
- `GenerationController` - Trigger generation phases
- `MemoryController` - Query vector memory
- `WebhookController` - External integrations

**Services:**
- `JobQueueService` - Redis queue producer
- `SupabaseService` - Database operations
- `AuthService` - JWT authentication

### 2. AI Orchestrator (Python/AutoGen)

The orchestrator manages the multi-agent conversation using Microsoft AutoGen framework.

**Agent Roles:**

#### Architect Agent
- **Trigger:** `POST /api/project/init`
- **Input:** Seed idea, moral compass configuration
- **Output:** Narrative possibility JSON
- **Prompt Focus:** Genesis phase, ethical framework application

#### Profiler Agent
- **Trigger:** Redis event `project.structure_approved`
- **Input:** Narrative possibility, target audience
- **Output:** Character profiles with psychological depth
- **Prompt Focus:** Archetypal mapping, psychological wounds

#### Strategist Agent
- **Trigger:** Redis event `characters.generated`
- **Input:** Characters, narrative structure
- **Output:** Scene-by-scene outline
- **Prompt Focus:** Mythic structure, conflict layering

#### Writer Agent
- **Trigger:** Redis event `outline.approved`
- **Input:** Outline, character profiles, worldbuilding
- **Output:** Draft scenes
- **Prompt Focus:** Show don't tell, sensory details, subtext

#### Critic Agent
- **Trigger:** Writer output
- **Input:** Draft scenes, quality criteria
- **Output:** Feedback or approval
- **Prompt Focus:** Artistic critique, pacing, originality

### 3. Redis (Message Broker)

Redis handles asynchronous communication between the API Gateway and AI Orchestrator.

**Queue Structure:**
```
manoe:jobs:pending      # Pending generation jobs
manoe:jobs:processing   # Currently processing jobs
manoe:jobs:completed    # Completed jobs (TTL: 24h)
manoe:jobs:failed       # Failed jobs for retry
```

**Pub/Sub Channels:**
```
manoe:events:project    # Project lifecycle events
manoe:events:generation # Generation progress events
manoe:events:agent      # Agent activity events
```

### 4. Qdrant (Vector Database)

Qdrant stores embeddings for semantic retrieval during generation.

**Collections:**

#### characters
- Character profiles with psychological attributes
- Visual signatures and defining traits
- Relationships and affiliations

#### worldbuilding
- Geography and culture details
- Historical events and lore
- Rules and constraints of the story world

#### scenes
- Generated scene content
- Emotional beats and subtext layers
- Continuity references

**Embedding Strategy:**
- OpenAI `text-embedding-3-small` for text content
- Metadata filtering for project/character scoping
- Hybrid search (dense + sparse) for precision

### 5. Supabase (PostgreSQL)

Supabase provides relational storage and real-time subscriptions.

**Schema:**

```sql
-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    seed_idea TEXT NOT NULL,
    moral_compass VARCHAR(50) NOT NULL,
    target_audience TEXT,
    status VARCHAR(50) DEFAULT 'genesis',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Characters table
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    archetype VARCHAR(100),
    core_motivation TEXT,
    inner_trap TEXT,
    psychological_wound TEXT,
    visual_signature TEXT,
    qdrant_id VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Outlines table
CREATE TABLE outlines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    structure_type VARCHAR(100),
    scenes JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Drafts table
CREATE TABLE drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    scene_number INTEGER NOT NULL,
    content TEXT NOT NULL,
    sensory_details JSONB,
    subtext_layer TEXT,
    emotional_shift TEXT,
    status VARCHAR(50) DEFAULT 'draft',
    revision_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    agent_name VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    input_summary TEXT,
    output_summary TEXT,
    token_usage JSONB,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Data Flow

### Project Initialization Flow

```
1. Client → POST /api/project/init
2. API Gateway validates request
3. API Gateway creates project in Supabase
4. API Gateway publishes job to Redis queue
5. Orchestrator consumes job
6. Architect Agent processes seed idea
7. Architect Agent generates narrative possibility
8. Orchestrator stores result in Supabase
9. Orchestrator publishes completion event
10. API Gateway notifies client via WebSocket
```

### Generation Flow

```
1. Client → POST /api/generate/characters
2. API Gateway validates project state
3. API Gateway publishes generation job
4. Orchestrator consumes job
5. Profiler Agent generates characters
6. Orchestrator stores characters in Supabase
7. Orchestrator stores embeddings in Qdrant
8. Orchestrator publishes completion event
9. Client receives notification
```

### Critique Loop Flow

```
1. Writer Agent generates scene draft
2. Draft stored in Supabase
3. Critic Agent evaluates draft
4. If rejected:
   a. Feedback stored in audit log
   b. Writer Agent revises
   c. Loop continues
5. If approved:
   a. Scene marked as final
   b. Next scene triggered
```

## Error Handling

### Retry Strategy
- Exponential backoff for transient failures
- Maximum 3 retries per job
- Dead letter queue for persistent failures

### Circuit Breaker
- OpenAI API rate limiting protection
- Qdrant connection pooling
- Redis connection recovery

## Scalability Considerations

### Horizontal Scaling
- API Gateway: Multiple instances behind load balancer
- Orchestrator: Multiple workers consuming from Redis
- Qdrant: Cluster mode for large vector collections

### Caching Strategy
- Redis caching for frequently accessed data
- Qdrant result caching for repeated queries
- API response caching for static content

## Security

### Authentication
- JWT tokens for API access
- API key authentication for service-to-service
- Supabase Row Level Security (RLS)

### Data Protection
- Encryption at rest (Supabase, Qdrant)
- TLS for all network communication
- Secrets management via environment variables

## Monitoring

### Metrics
- Request latency and throughput
- Agent processing time
- Token usage per generation
- Queue depth and processing rate

### Logging
- Structured JSON logging
- Correlation IDs for request tracing
- Audit logs for agent decisions

### Alerting
- Queue backlog thresholds
- Error rate spikes
- API latency degradation
