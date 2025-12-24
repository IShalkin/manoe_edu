# MANOE Architecture: Learning Path

## Overview

MANOE (Multi-Agent Narrative Orchestration Engine) - это мульти-агентная система для генерации историй, использующая 9 специализированных AI агентов, которые работают через 12-фазный workflow. Система построена на event-driven архитектуре с использованием Redis Streams для real-time коммуникации и Qdrant для векторной памяти.

Этот документ предоставляет приоритизированный путь обучения для новых разработчиков, помогая понять архитектуру системы в правильном порядке.

---

## Priority 1: Foundational Patterns (Изучите в первую очередь)

Эти паттерны являются основой всей системы. Понимание их критически важно для работы с любой частью кодовой базы.

### 1. State Machine Pattern: The 12-Phase Workflow

**Файл:** `api-gateway/src/services/StorytellerOrchestrator.ts` (строки 244-302)

StorytellerOrchestrator реализует 12-фазный workflow как конечный автомат. Каждая фаза выполняется последовательно, с возможностью паузы, отмены и восстановления.

**Фазы выполнения:**
```
GENESIS → CHARACTERS → NARRATOR_DESIGN → WORLDBUILDING → OUTLINING → 
ADVANCED_PLANNING → DRAFTING → CRITIQUE → REVISION → ORIGINALITY_CHECK → 
IMPACT_ASSESSMENT → POLISH
```

**Ключевые методы:**
- `startGeneration()` - Инициализирует состояние и запускает асинхронную генерацию
- `runGeneration()` - Основной цикл, последовательно вызывающий фазы
- `runGenesisPhase()`, `runCharactersPhase()`, etc. - Методы для каждой фазы
- `shouldStop()` - Проверка на паузу/отмену между фазами

**Почему это важно:**
Orchestrator - это "мозг" системы. Все остальные компоненты (агенты, события, персистентность) существуют для поддержки этого workflow.

### 2. Template Method Pattern: BaseAgent Abstract Class

**Файл:** `api-gateway/src/agents/BaseAgent.ts`

BaseAgent определяет "скелет" операций агента, который наследуют все 9 специализированных агентов. Это классический Template Method паттерн.

**Ключевые методы, которые наследуют все агенты:**
- `callLLM()` - Вызов LLM с автоматическим retry и трейсингом (строки 133-169)
- `parseJSON()` / `parseJSONArray()` - Парсинг ответов LLM (строки 175-202)
- `validateOutput()` - Валидация против Zod схем (строки 221-237)
- `applyGuardrails()` - Проверка контента и консистентности (строки 243-281)
- `emitThought()` / `emitDialogue()` - События для "Glass Brain" UI (строки 286-335)

**Абстрактный метод:**
```typescript
abstract execute(context: AgentContext, options: GenerationOptions): Promise<AgentOutput>;
```

Каждый агент реализует `execute()` со своей специфической логикой.

### 3. Factory Pattern: AgentFactory with Dependency Injection

**Файл:** `api-gateway/src/agents/AgentFactory.ts` (строки 25-78)

AgentFactory создает и кэширует экземпляры агентов, используя Ts.ED dependency injection для внедрения зависимостей.

**Паттерн:**
```typescript
@Service()
export class AgentFactory {
  private agents: Map<AgentType, BaseAgent> = new Map();
  
  getAgent(agentType: AgentType): BaseAgent {
    if (!this.agents.has(agentType)) {
      this.agents.set(agentType, this.createAgent(agentType));
    }
    return this.agents.get(agentType)!;
  }
}
```

**Внедряемые зависимости:**
- `LLMProviderService` - Для вызовов LLM
- `LangfuseService` - Для трейсинга и prompt management
- `ContentGuardrail` / `ConsistencyGuardrail` - Для проверки контента
- `RedisStreamsService` - Для публикации событий

### 4. Event-Driven Architecture: Redis Streams

**Файл:** `api-gateway/src/services/RedisStreamsService.ts`

Redis Streams обеспечивает real-time коммуникацию между backend и frontend через Server-Sent Events (SSE).

**Ключевые методы:**
- `publishEvent(runId, eventType, data)` - Публикация события в stream (строки 177-214)
- `streamEvents(runId)` - AsyncGenerator для SSE consumption (строки 255-309)
- `getEvents(runId)` - Получение событий из stream (строки 224-246)

**Типы событий:**
- `generation_started` / `generation_completed` - Lifecycle события
- `phase_start` / `phase_complete` - Переходы между фазами
- `agent_start` / `agent_complete` - Активность агентов
- `agent_thought` / `agent_dialogue` - Cinematic события для Glass Brain
- `heartbeat` - Keep-alive для SSE соединения

**Stream naming:**
- Run-specific: `manoe:events:{runId}`
- Global: `manoe:events:global`

### 5. Type System: GenerationState and Agent Models

**Файл:** `api-gateway/src/models/AgentModels.ts`

Центральная структура данных, определяющая типы для всей системы.

**AgentType enum (строки 95-105):**
```typescript
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
```

**GenerationState class (строки 264-336):**
Полное состояние генерации, включая:
- `phase` - Текущая фаза
- `narrative`, `characters`, `worldbuilding`, `outline` - Артефакты
- `drafts`, `critiques`, `revisionCount` - Maps для сцен
- `keyConstraints`, `rawFactsLog` - Система непрерывности
- `isPaused`, `isCompleted`, `error` - Статус

**KeyConstraint class (строки 214-238):**
Канонические факты для поддержания непрерывности:
```typescript
export class KeyConstraint {
  key: string;        // Семантический ключ (e.g., "hero_eye_color")
  value: string;      // Значение (e.g., "blue")
  source: AgentType;  // Агент-источник
  sceneNumber: number;
  timestamp: string;
  reasoning?: string; // Объяснение от Archivist
}
```

---

## Priority 2: Complex Interactions

После понимания базовых паттернов, изучите эти сложные взаимодействия.

### 1. Writer-Critic Loop: Iterative Quality Control

**Файл:** `api-gateway/src/services/StorytellerOrchestrator.ts` (строки 482-634)

Цикл Writer-Critic обеспечивает качество генерируемого контента через итеративную ревизию.

**Процесс:**
1. Writer генерирует черновик сцены (`draftScene()`)
2. Critic оценивает качество (score 1-10) (`critiqueScene()`)
3. Если score < 7, Writer ревизирует (`reviseScene()`)
4. Максимум 2 итерации ревизии
5. После прохождения - следующая сцена

**Ключевые методы:**
- `runDraftingLoop()` - Основной цикл для всех сцен
- `draftScene()` - Генерация черновика с контекстом из Qdrant
- `critiqueScene()` - Оценка качества
- `reviseScene()` - Ревизия на основе feedback

### 2. Archivist + KeyConstraints: Continuity Management

**Файл:** `api-gateway/src/services/StorytellerOrchestrator.ts` (строки 733-819)

Archivist запускается каждые 3 сцены для консолидации rawFactsLog в keyConstraints.

**Процесс:**
1. Во время генерации сцен, факты добавляются в `rawFactsLog`
2. Каждые 3 сцены вызывается `runArchivistCheck()`
3. Archivist анализирует новые факты
4. Консолидирует в `keyConstraints` с семантическими ключами
5. Constraints инжектируются в промпты Writer/Critic

**Зачем это нужно:**
Предотвращает "context drift" - когда в длинных нарративах поздние сцены противоречат ранним (например, изменение цвета глаз персонажа).

### 3. Multi-Provider LLM Abstraction

**Файл:** `api-gateway/src/services/LLMProviderService.ts`

Унифицированный интерфейс для 6 LLM провайдеров с BYOK (Bring Your Own Key).

**Поддерживаемые провайдеры:**
- OpenAI (GPT-4, GPT-5)
- Anthropic (Claude)
- Google Gemini
- OpenRouter
- DeepSeek
- Venice AI

**Ключевой метод:**
```typescript
createCompletionWithRetry(options): Promise<LLMResponse>
```

**Особенности:**
- Автоматический retry для 429/5xx ошибок
- Exponential backoff (1s → 2s → 4s)
- Резолюция API ключей: user-provided → env var → error
- Provider-specific адаптеры для разных API форматов

### 4. Redis Streams → SSE → Frontend Real-Time Sync

**Поток данных:**
```
StorytellerOrchestrator
    ↓ publishEvent()
RedisStreamsService
    ↓ XADD to stream
Redis Stream (manoe:events:{runId})
    ↓ XREAD BLOCK
OrchestrationController (SSE endpoint)
    ↓ Server-Sent Events
useGenerationStream hook (frontend)
    ↓ EventSource
React components (AgentChat, CinematicAgentPanel)
```

**Backend SSE endpoint:**
`api-gateway/src/controllers/OrchestrationController.ts` (строки 476-611)

**Frontend hook:**
`frontend/src/hooks/useGenerationStream.ts` (строки 154-348)

### 5. Qdrant Semantic Search During Generation

**Файл:** `api-gateway/src/services/QdrantMemoryService.ts`

Векторный поиск для получения релевантного контекста во время генерации.

**Collections:**
- `manoe_characters` - Профили персонажей
- `manoe_worldbuilding` - Элементы мира
- `manoe_scenes` - Контент сцен

**Embedding providers (fallback cascade):**
1. OpenAI text-embedding-3-small (1536 dims)
2. Gemini embedding-001 (768 dims)
3. Local all-MiniLM-L6-v2 (384 dims)

**Использование:**
Writer agent перед генерацией сцены запрашивает:
- Релевантных персонажей
- Элементы мира
- Предыдущие сцены для контекста

---

## Priority 3: Prerequisite Learning Order

Рекомендуемый порядок изучения файлов и концепций.

### Tier 1: Core Data Structures

Начните с понимания типов данных:

1. **AgentType enum** - 9 типов агентов
   - Файл: `api-gateway/src/models/AgentModels.ts` (строки 95-105)

2. **GenerationPhase enum** - 12 фаз генерации
   - Файл: `api-gateway/src/models/LLMModels.ts`

3. **GenerationState class** - Полное состояние run
   - Файл: `api-gateway/src/models/AgentModels.ts` (строки 264-336)

4. **KeyConstraint и RawFact** - Система непрерывности
   - Файл: `api-gateway/src/models/AgentModels.ts` (строки 214-259)

### Tier 2: Service Layer Interfaces

После типов, изучите интерфейсы сервисов:

5. **BaseAgent abstract methods** - Контракт агентов
   - Файл: `api-gateway/src/agents/BaseAgent.ts`
   - Методы: `callLLM()`, `parseJSON()`, `validateOutput()`, `applyGuardrails()`

6. **LLMProviderService interface** - Абстракция LLM
   - Файл: `api-gateway/src/services/LLMProviderService.ts`
   - Метод: `createCompletionWithRetry()`

7. **RedisStreamsService publish/stream pattern** - Event streaming
   - Файл: `api-gateway/src/services/RedisStreamsService.ts`
   - Методы: `publishEvent()`, `streamEvents()`

### Tier 3: Orchestration Logic

Теперь можно понять оркестрацию:

8. **Phase execution pattern** - Как выполняются фазы
   - Файл: `api-gateway/src/services/StorytellerOrchestrator.ts`
   - Методы: `runGeneration()`, `runGenesisPhase()`, etc.

9. **Agent-specific implementations** - Логика каждого агента
   - Файлы: `api-gateway/src/agents/*.ts`
   - Каждый агент реализует `execute()` по-своему

10. **Guardrails system** - Проверка контента
    - Файлы: `api-gateway/src/guardrails/ContentGuardrail.ts`, `ConsistencyGuardrail.ts`

### Tier 4: Observability & Memory

Наконец, вспомогательные системы:

11. **Langfuse tracing integration** - Observability
    - Файл: `api-gateway/src/services/LangfuseService.ts`
    - Трейсинг всех LLM вызовов, prompt management

12. **Qdrant vector memory** - Semantic search
    - Файл: `api-gateway/src/services/QdrantMemoryService.ts`
    - Хранение и поиск embeddings

13. **Frontend SSE consumption** - Real-time UI
    - Файл: `frontend/src/hooks/useGenerationStream.ts`
    - Подключение к SSE, обновление React state

---

## Quick Reference: Key Files

| Компонент | Файл | Строки |
|-----------|------|--------|
| Orchestrator | `api-gateway/src/services/StorytellerOrchestrator.ts` | 1380 |
| Base Agent | `api-gateway/src/agents/BaseAgent.ts` | 345 |
| Agent Factory | `api-gateway/src/agents/AgentFactory.ts` | 79 |
| Agent Models | `api-gateway/src/models/AgentModels.ts` | 572 |
| Redis Streams | `api-gateway/src/services/RedisStreamsService.ts` | 462 |
| LLM Provider | `api-gateway/src/services/LLMProviderService.ts` | - |
| Qdrant Memory | `api-gateway/src/services/QdrantMemoryService.ts` | - |
| Frontend Hook | `frontend/src/hooks/useGenerationStream.ts` | - |
| Agent Chat UI | `frontend/src/components/AgentChat.tsx` | 2534 |

---

## Next Steps

После изучения этого документа:

1. Прочитайте [Execution Traces](EXECUTION_TRACES.md) для понимания конкретных потоков выполнения
2. Изучите [UI Architecture](UI_ARCHITECTURE.md) для понимания frontend архитектуры
3. Запустите систему локально и проследите за событиями в Redis Streams
4. Добавьте логирование в интересующие вас методы для понимания потока данных
