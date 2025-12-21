# MANOE API Documentation

## Overview

The MANOE API Gateway provides RESTful endpoints for managing narrative generation projects. All endpoints are prefixed with `/api`.

## Base URL

- **Development:** `http://localhost:3000/api`
- **Production:** `https://your-domain.com/api`

## Authentication

Authentication is handled via JWT tokens. Include the token in the `Authorization` header:

```
Authorization: Bearer <your-jwt-token>
```

## Endpoints

### Health Check

#### GET /health
Basic health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### GET /health/detailed
Detailed health check including all services.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "0.1.0",
  "services": {
    "api": { "status": "up" },
    "redis": { "status": "up", "latencyMs": 2 },
    "supabase": { "status": "up", "latencyMs": 15 },
    "qdrant": { "status": "up", "latencyMs": 5 }
  }
}
```

### Project Management

#### POST /project/init
Initialize a new narrative project.

**Request Body:**
```json
{
  "seedIdea": "What if a retired assassin discovered their target was their long-lost child?",
  "moralCompass": "Ambiguous",
  "targetAudience": "Adult readers who enjoy psychological thrillers",
  "themeCore": ["redemption", "identity", "moral ambiguity"],
  "toneStyleReferences": ["John le Carré", "Gillian Flynn"]
}
```

**Moral Compass Options:**
- `Ethical` - Virtue, Justice, clear moral framework
- `Unethical` - Darkness, Taboos, morally questionable protagonists
- `Amoral` - Non-judgmental observation
- `Ambiguous` - Complex moral dilemmas
- `UserDefined` - Custom moral system (requires `customMoralSystem` field)

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "genesis",
  "message": "Project initialized. Genesis phase started.",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

#### GET /project/:id
Get project details.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "characters",
  "seedIdea": "What if...",
  "moralCompass": "Ambiguous",
  "targetAudience": "Adult readers...",
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T11:00:00.000Z"
}
```

#### GET /project/:id/narrative
Get the generated narrative possibility.

**Response:**
```json
{
  "plotSummary": "A retired assassin...",
  "settingDescription": "Modern-day Berlin...",
  "mainConflict": "The protagonist must choose...",
  "potentialCharacters": ["The Assassin", "The Child", "The Handler"],
  "possibleTwists": ["The child knows the truth", "The handler is the real target"],
  "thematicElements": ["redemption", "identity"],
  "moralCompassApplication": "The story explores moral ambiguity through..."
}
```

#### POST /project/:id/approve
Approve current phase and proceed to next.

**Request Body:**
```json
{
  "phase": "genesis"
}
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "characters",
  "message": "Phase approved. characters phase started."
}
```

#### GET /project
List all projects with pagination.

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 10)

**Response:**
```json
{
  "projects": [...],
  "total": 25
}
```

#### DELETE /project/:id
Delete a project and all associated data.

### Generation Endpoints

#### POST /generate/characters/:projectId
Trigger character generation.

**Request Body (optional):**
```json
{
  "regenerate": false
}
```

**Response:**
```json
{
  "jobId": "characters-550e8400-1705315800000",
  "message": "Character generation started"
}
```

#### POST /generate/outline/:projectId
Trigger plot outline generation.

**Request Body (optional):**
```json
{
  "preferredStructure": "ThreeAct",
  "targetWordCount": 50000,
  "estimatedScenes": 20
}
```

**Structure Options:**
- `ThreeAct` - Classic three-act structure
- `HeroJourney` - Joseph Campbell's Hero's Journey
- `SevenPoint` - Seven-point story structure
- `SaveTheCat` - Blake Snyder's beat sheet
- `Kishōtenketsu` - Four-act East Asian structure

#### POST /generate/draft/:projectId
Trigger scene draft generation.

**Request Body:**
```json
{
  "sceneNumber": 1,
  "allScenes": false
}
```

#### POST /generate/critique/:projectId
Request critique for drafts.

**Request Body:**
```json
{
  "sceneNumber": 1,
  "allScenes": false
}
```

#### GET /generate/status/:jobId
Check job status.

**Response:**
```json
{
  "status": "completed",
  "result": { ... }
}
```

**Status Values:**
- `pending` - Job is queued
- `processing` - Job is being processed
- `completed` - Job finished successfully
- `failed` - Job failed
- `not_found` - Job ID not found

#### GET /generate/queue/stats
Get queue statistics.

**Response:**
```json
{
  "pending": 5,
  "processing": 2,
  "completed": 150,
  "failed": 3
}
```

### Memory Endpoints

#### GET /memory/characters/:projectId
Get all characters for a project.

#### GET /memory/characters/:projectId/search
Search characters by semantic similarity.

**Query Parameters:**
- `query` - Search query
- `limit` (default: 5)

#### GET /memory/worldbuilding/:projectId
Get worldbuilding elements.

**Query Parameters:**
- `type` (optional) - Filter by element type (geography, culture, technology, etc.)

#### GET /memory/scenes/:projectId
Get all scene drafts.

#### GET /memory/scenes/:projectId/:sceneNumber
Get a specific scene draft.

#### GET /memory/outline/:projectId
Get the plot outline.

#### GET /memory/critiques/:projectId
Get all critiques.

#### GET /memory/audit/:projectId
Get audit logs.

**Query Parameters:**
- `agent` (optional) - Filter by agent name
- `limit` (default: 50)

### Models Endpoints

#### GET /models
Get all available LLM models grouped by provider.

**Response:**
```json
{
  "openai": {
    "gpt-4o": {
      "name": "GPT-4o",
      "description": "Most capable GPT-4 model, multimodal",
      "contextWindow": 128000,
      "maxOutput": 16384,
      "recommendedFor": ["architect", "profiler", "strategist", "critic"]
    },
    ...
  },
  "openrouter": { ... },
  "gemini": { ... },
  "claude": { ... }
}
```

#### GET /models/providers
Get list of supported LLM providers.

**Response:**
```json
{
  "providers": [
    {
      "id": "openai",
      "name": "OpenAI",
      "description": "OpenAI GPT models including GPT-4o and O1",
      "baseUrl": "https://api.openai.com/v1"
    },
    ...
  ]
}
```

#### GET /models/provider/:providerId
Get models for a specific provider.

#### GET /models/recommended/:agentName
Get recommended models for a specific agent.

**Response:**
```json
{
  "agent": "architect",
  "recommendations": {
    "openai": ["gpt-4o", "gpt-4-turbo", "o1-preview"],
    "claude": ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229"],
    "gemini": ["gemini-1.5-pro"]
  }
}
```

#### GET /models/agents
Get all agent roles and their purposes.

**Response:**
```json
{
  "agents": [
    {
      "name": "architect",
      "phase": "Genesis",
      "description": "Transforms seed ideas into structured narrative possibilities",
      "defaultProvider": "openai",
      "defaultModel": "gpt-4o"
    },
    ...
  ]
}
```

## Error Handling

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Error description",
  "error": "Bad Request"
}
```

### Common Status Codes

- `200` - Success
- `201` - Created
- `202` - Accepted (async job started)
- `400` - Bad Request
- `401` - Unauthorized
- `404` - Not Found
- `500` - Internal Server Error

## WebSocket Events

Connect to the WebSocket server for real-time updates:

```javascript
const socket = io('http://localhost:3000');

socket.on('project:update', (data) => {
  console.log('Project updated:', data);
});

socket.on('generation:progress', (data) => {
  console.log('Generation progress:', data);
});

socket.on('generation:complete', (data) => {
  console.log('Generation complete:', data);
});
```

## Rate Limiting

- Default: 100 requests per minute per IP
- Generation endpoints: 10 requests per minute per project

## CORS

CORS is enabled by default. Configure allowed origins via the `CORS_ORIGIN` environment variable.
