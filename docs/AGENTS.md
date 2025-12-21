# MANOE Agent Documentation

## Overview

MANOE uses a multi-agent architecture where specialized AI agents collaborate to create narratives. Each agent has a specific role in the narrative generation pipeline, following the principles from the Storyteller framework.

## Agent Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  Architect  │───▶│  Profiler   │───▶│ Strategist  │───▶│   Writer    │◀──▶│   Critic    │
│  (Genesis)  │    │ (Characters)│    │ (Outlining) │    │ (Drafting)  │    │ (Feedback)  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Agent Descriptions

### 1. Architect Agent (Genesis Phase)

**Purpose:** Transforms seed ideas into structured narrative possibilities.

**Input:**
- Seed idea ("What If?" question)
- Moral compass configuration
- Target audience
- Theme core
- Tone/style references

**Output:** Narrative Possibility JSON containing:
- Plot summary
- Setting description
- Main conflict
- Potential characters
- Possible twists
- Thematic elements
- Moral compass application

**Key Principles:**
- Explores the "Spark of Creation" from the Storyteller framework
- Applies the Moral Compass lens to all narrative elements
- Generates multiple possibilities for user selection
- Considers target audience sensibilities

**Recommended Models:**
- OpenAI: gpt-4o, o1-preview
- Claude: claude-3-5-sonnet, claude-3-opus
- Gemini: gemini-1.5-pro

### 2. Profiler Agent (Character Design Phase)

**Purpose:** Creates psychologically deep character profiles with archetypal mapping.

**Input:**
- Narrative possibility
- Moral compass
- Target audience

**Output:** Array of Character Profiles containing:
- Name and archetype (Hero, Shadow, Mentor, Trickster, etc.)
- Core motivation and inner trap
- Psychological wound and coping mechanism
- Deepest fear and breaking point
- Visual signature and quirks
- Public and hidden goals
- Moral stance and potential arc

**Key Principles:**
- Applies Jungian archetypes from the Storyteller framework
- Creates "Core Psychological Wounds" for depth
- Defines "Inner Traps" (existential dilemmas)
- Ensures characters have internal contradictions
- Stores character vectors in Qdrant for consistency

**Recommended Models:**
- OpenAI: gpt-4o
- Claude: claude-3-5-sonnet
- Gemini: gemini-1.5-pro

### 3. Strategist Agent (Outlining Phase)

**Purpose:** Creates detailed scene-by-scene plot outlines with conflict and subtext.

**Input:**
- Narrative possibility
- Character profiles
- Moral compass
- Preferred structure (optional)
- Target word count (optional)

**Output:** Plot Outline containing:
- Structure type (Three-Act, Hero's Journey, etc.)
- Total scenes and target word count
- Scene array with:
  - Scene number and title
  - Setting and characters present
  - Conflict type and description
  - Emotional beat (initial, climax, final states)
  - Subtext layer
  - Plot advancement
  - Character development

**Key Principles:**
- Maps plot to mythic structures from the Storyteller framework
- Ensures each scene has explicit conflict
- Defines emotional beats for reader impact
- Layers subtext throughout the narrative
- Balances pacing across the story

**Recommended Models:**
- OpenAI: gpt-4o, o1-preview
- Claude: claude-3-5-sonnet
- Gemini: gemini-1.5-pro

### 4. Writer Agent (Drafting Phase)

**Purpose:** Transforms scene outlines into vivid, sensory-rich prose.

**Input:**
- Scene outline
- Character profiles (from Qdrant)
- Worldbuilding context (from Qdrant)
- Moral compass

**Output:** Scene Draft containing:
- Scene number and title
- Setting description
- Sensory details (sight, sound, smell, taste, touch, internal)
- Narrative content
- Dialogue entries with subtext
- Emotional shift
- Word count and show-don't-tell ratio

**Key Principles:**
- Applies "Show, Don't Tell" from the Storyteller framework
- Injects sensory details across all five senses
- Writes dialogue with subtext (what is NOT being said)
- Avoids "On-the-Nose" exposition
- Maintains character voice consistency
- Retrieves character/world details from Qdrant

**Recommended Models:**
- OpenAI: gpt-4o-mini (cost-effective for volume)
- Claude: claude-3-5-haiku
- Gemini: gemini-1.5-flash

### 5. Critic Agent (Feedback Phase)

**Purpose:** Provides artistic critique and validation of scene drafts.

**Input:**
- Scene draft
- Scene outline (for comparison)
- Character profiles
- Moral compass

**Output:** Scene Critique containing:
- Overall score (1-10)
- Approved status
- Feedback items by category:
  - Pacing
  - Sensory Density
  - Dialogue Quality
  - Character Voice
  - Subtext Effectiveness
  - Emotional Impact
  - Show Don't Tell
  - Originality
  - Thematic Resonance
  - Moral Compass Alignment
  - Structural Integrity
  - Reader Engagement
- Strengths and weaknesses
- Revision requirements
- Creative risk assessment
- Psychological alignment check
- Complexity assessment

**Key Principles:**
- Applies "Ethically Neutral" artistic critique from the Storyteller framework
- Validates pacing, originality, and dialogue
- Checks for distinct character voices
- Ensures sensory density requirements are met
- Provides specific, actionable feedback
- Triggers revision loop if score below threshold

**Recommended Models:**
- OpenAI: gpt-4o
- Claude: claude-3-5-sonnet, claude-3-opus
- Gemini: gemini-1.5-pro

## Agent Communication

Agents communicate through Redis message queues:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Redis Queue                              │
├─────────────────────────────────────────────────────────────────┤
│  manoe:jobs:pending     - Jobs waiting to be processed          │
│  manoe:jobs:processing  - Jobs currently being processed        │
│  manoe:jobs:completed   - Completed jobs                        │
│  manoe:jobs:failed      - Failed jobs                           │
├─────────────────────────────────────────────────────────────────┤
│  manoe:events:project   - Project lifecycle events              │
│  manoe:events:generation - Generation progress events           │
│  manoe:events:agent     - Agent-specific events                 │
└─────────────────────────────────────────────────────────────────┘
```

## Memory System

Agents use Qdrant for vector memory to maintain consistency:

### Collections

1. **Characters Collection**
   - Stores character profiles as vectors
   - Enables semantic search for character retrieval
   - Maintains consistency across scenes

2. **Worldbuilding Collection**
   - Stores geography, culture, technology details
   - Retrieved by Writer agent for setting descriptions
   - Prevents worldbuilding contradictions

3. **Scenes Collection**
   - Stores completed scene drafts
   - Enables reference to previous scenes
   - Maintains narrative continuity

## Configuration

### Per-Agent Model Configuration

Each agent can use a different LLM provider and model:

```env
# Architect Agent
ARCHITECT_PROVIDER=openai
ARCHITECT_MODEL=gpt-4o

# Profiler Agent
PROFILER_PROVIDER=claude
PROFILER_MODEL=claude-3-5-sonnet-20241022

# Strategist Agent
STRATEGIST_PROVIDER=openai
STRATEGIST_MODEL=o1-preview

# Writer Agent (cost-effective for volume)
WRITER_PROVIDER=openai
WRITER_MODEL=gpt-4o-mini

# Critic Agent
CRITIC_PROVIDER=claude
CRITIC_MODEL=claude-3-5-sonnet-20241022
```

### Temperature Settings

- **Architect:** 0.8 (more creative exploration)
- **Profiler:** 0.7 (balanced creativity/consistency)
- **Strategist:** 0.6 (more structured output)
- **Writer:** 0.8 (creative prose)
- **Critic:** 0.3 (analytical, consistent evaluation)

## Revision Loop

The Writer and Critic agents operate in a feedback loop:

```
┌──────────┐     Draft      ┌──────────┐
│  Writer  │───────────────▶│  Critic  │
│  Agent   │                │  Agent   │
└──────────┘                └──────────┘
     ▲                           │
     │      Feedback             │
     │   (if score < 7.0)        │
     └───────────────────────────┘
```

**Loop Termination Conditions:**
- Critic approves (score >= 7.0)
- Maximum revisions reached (default: 3)
- User manual approval

## Audit Logging

All agent actions are logged to the `audit_logs` table:

- Agent name
- Action performed
- Input summary
- Output summary
- Token usage
- Duration (ms)
- Error messages (if any)

This enables:
- Cost tracking per agent
- Performance monitoring
- Debugging failed generations
- Quality analysis over time

## Extending Agents

To add a new agent:

1. Create prompt template in `orchestrator/prompts/`
2. Create agent class in `orchestrator/agents/`
3. Register in `orchestrator/agents/__init__.py`
4. Add to orchestrator pipeline in `orchestrator/main.py`
5. Add configuration in `config/llm_providers.py`
