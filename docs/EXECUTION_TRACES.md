# MANOE Execution Traces

Этот документ содержит детальные trace-диаграммы для 6 ключевых потоков выполнения в системе MANOE. Каждый trace показывает путь выполнения кода с указанием файлов и номеров строк.

---

## 1. Story Generation Launch: 12-Phase Orchestrator

### Flow Diagram

```
Запуск генерации истории
├── POST /orchestrate/generate
│   └── OrchestrationController.generate()
│       └── api-gateway/src/controllers/OrchestrationController.ts
│
├── startGeneration(options)
│   └── api-gateway/src/services/StorytellerOrchestrator.ts:181
│   ├── Создание GenerationState
│   │   └── new GenerationState() с projectId, runId, phase: GENESIS
│   ├── Инициализация Qdrant memory
│   │   └── qdrantMemory.initialize(runId, geminiApiKey)
│   ├── Запуск Langfuse trace
│   │   └── langfuse.startTrace({ projectId, runId, phase })
│   ├── Публикация события "generation_started"
│   │   └── publishEvent(runId, "generation_started", {...})
│   └── Асинхронный запуск runGeneration()
│       └── this.runGeneration(runId, options).catch(...)
│
└── runGeneration(runId, options)
    └── api-gateway/src/services/StorytellerOrchestrator.ts:244
    ├── Phase 1: runGenesisPhase()
    │   ├── agentFactory.getAgent(AgentType.ARCHITECT)
    │   └── agent.execute(context, options)
    ├── Phase 2: runCharactersPhase()
    │   └── agentFactory.getAgent(AgentType.PROFILER)
    ├── Phase 3: runWorldbuildingPhase()
    │   └── agentFactory.getAgent(AgentType.WORLDBUILDER)
    ├── Phase 4: runOutliningPhase()
    │   └── agentFactory.getAgent(AgentType.STRATEGIST)
    ├── Phase 5: runAdvancedPlanningPhase()
    │   └── agentFactory.getAgent(AgentType.STRATEGIST)
    ├── Phase 6-9: runDraftingLoop()
    │   ├── draftScene() → critiqueScene() → reviseScene()
    │   └── runArchivistCheck() каждые 3 сцены
    └── Завершение
        ├── state.isCompleted = true
        ├── publishEvent("generation_completed")
        └── langfuse.endTrace(runId, { status: "completed" })
```

### Motivation

12-фазный workflow разделяет сложную задачу генерации истории на управляемые этапы. Каждая фаза имеет четкую ответственность и выходной артефакт, что позволяет:

- **Checkpoint recovery**: Сохранение состояния после каждой фазы для восстановления
- **Selective regeneration**: Пользователь может перегенерировать с любой фазы
- **Quality gates**: Critique фаза обеспечивает качество перед продолжением
- **Observability**: Каждая фаза публикует события для real-time UI

### Details

**Инициализация состояния (строки 187-206):**
```typescript
const state: GenerationState = {
  phase: GenerationPhase.GENESIS,
  projectId: options.projectId,
  runId,
  characters: [],
  drafts: new Map(),
  critiques: new Map(),
  revisionCount: new Map(),
  messages: [],
  keyConstraints: [],
  rawFactsLog: [],
  // ...
};
this.activeRuns.set(runId, state);
```

**Проверка остановки между фазами (строка 260):**
```typescript
if (this.shouldStop(runId)) return;
```

Это позволяет graceful pause/cancel между фазами.

---

## 2. BaseAgent: LLM Call with Tracing and Error Handling

### Flow Diagram

```
agent.execute(context, options)
├── Получение system prompt
│   ├── langfuse.getPrompt(promptName)
│   │   └── api-gateway/src/services/LangfuseService.ts
│   └── Fallback: getFallbackPrompt(agentType)
│
├── Построение user prompt
│   └── Специфично для каждого агента
│
├── callLLM(runId, systemPrompt, userPrompt, llmConfig, phase)
│   └── api-gateway/src/agents/BaseAgent.ts:133
│   ├── Создание messages array
│   │   └── [{ role: SYSTEM, content }, { role: USER, content }]
│   ├── Запуск Langfuse span
│   │   └── langfuse.startSpan(runId, `${agentType}_call`, { phase })
│   ├── Вызов LLM
│   │   └── llmProvider.createCompletionWithRetry({...})
│   │       └── api-gateway/src/services/LLMProviderService.ts
│   │       ├── Retry logic: 3 attempts, exponential backoff
│   │       └── Provider-specific adapter (OpenAI, Anthropic, etc.)
│   ├── Трекинг в Langfuse
│   │   └── langfuse.trackLLMCall(runId, agentType, messages, response, spanId)
│   └── Завершение span
│       └── langfuse.endSpan(runId, spanId, { content: response.substring(0, 500) })
│
├── parseJSON(response)
│   └── api-gateway/src/agents/BaseAgent.ts:175
│   ├── Извлечение JSON из markdown code blocks
│   │   └── response.match(/```(?:json)?\s*([\s\S]*?)```/)
│   └── JSON.parse() с fallback на { raw: response }
│
├── validateOutput(data, schema, runId)
│   └── api-gateway/src/agents/BaseAgent.ts:221
│   ├── Zod schema validation
│   │   └── schema.safeParse(data)
│   └── При ошибке: langfuse.addEvent("validation_error")
│
├── applyGuardrails(content, constraints, runId)
│   └── api-gateway/src/agents/BaseAgent.ts:243
│   ├── ContentGuardrail.check(content)
│   │   └── Проверка на inappropriate content
│   └── ConsistencyGuardrail.check(content, constraints)
│       └── Проверка против Key Constraints
│
└── return AgentOutput
```

### Motivation

BaseAgent инкапсулирует общую логику для всех агентов:

- **DRY principle**: Retry, parsing, validation - один раз в базовом классе
- **Observability**: Все LLM вызовы автоматически трейсятся в Langfuse
- **Error handling**: Централизованная обработка ошибок
- **Guardrails**: Единообразная проверка контента

### Details

**Retry logic в LLMProviderService:**
```typescript
async createCompletionWithRetry(options, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.createCompletion(options);
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      await sleep(delay);
    }
  }
}
```

**Cinematic events (строки 286-335):**
```typescript
protected async emitThought(runId, thought, sentiment, targetAgent) {
  await this.redisStreams.publishEvent(runId, "agent_thought", {
    agent: this.agentType,
    thought,
    sentiment,
    targetAgent,
  });
}
```

---

## 3. Vector Memory: Qdrant Storage and Semantic Search

### Flow Diagram

```
Сохранение в Qdrant (после генерации)
├── qdrantMemory.storeCharacter(projectId, character)
│   └── api-gateway/src/services/QdrantMemoryService.ts
│   ├── Создание текста для embedding
│   │   └── `${character.name}: ${character.description} ${character.backstory}`
│   ├── Генерация embedding
│   │   └── getEmbedding(text)
│   │       ├── Try: OpenAI text-embedding-3-small (1536 dims)
│   │       ├── Fallback: Gemini embedding-001 (768 dims)
│   │       └── Fallback: Local all-MiniLM-L6-v2 (384 dims)
│   └── Upsert в Qdrant
│       └── qdrantClient.upsert("manoe_characters", {
│           id: uuid,
│           vector: embedding,
│           payload: { projectId, name, ... }
│       })

Поиск в Qdrant (перед генерацией сцены)
├── draftScene(runId, sceneNumber, options)
│   └── api-gateway/src/services/StorytellerOrchestrator.ts:536
│   ├── Получение релевантных персонажей
│   │   └── qdrantMemory.searchCharacters(projectId, sceneContext, limit=5)
│   │       ├── getEmbedding(sceneContext)
│   │       └── qdrantClient.search("manoe_characters", {
│   │           vector: queryEmbedding,
│   │           filter: { projectId },
│   │           limit: 5
│   │       })
│   ├── Получение элементов мира
│   │   └── qdrantMemory.searchWorldbuilding(projectId, sceneContext)
│   ├── Получение предыдущих сцен
│   │   └── qdrantMemory.searchScenes(projectId, sceneContext)
│   └── Инжекция контекста в prompt
│       └── context.relevantCharacters = searchResults
```

### Motivation

Векторная память решает проблему "context window limit":

- **Long narratives**: История может иметь 50+ сцен, не влезающих в контекст
- **Semantic relevance**: Поиск по смыслу, а не по ключевым словам
- **Cross-project reuse**: "Eternal Memory" для переиспользования research

### Details

**Embedding fallback cascade:**
```typescript
async getEmbedding(text: string): Promise<number[]> {
  // Try OpenAI first (best quality)
  if (this.openaiApiKey) {
    try {
      return await this.openaiEmbedding(text);
    } catch (e) { /* fallback */ }
  }
  
  // Try Gemini second
  if (this.geminiApiKey) {
    try {
      return await this.geminiEmbedding(text);
    } catch (e) { /* fallback */ }
  }
  
  // Local model as last resort
  return await this.localEmbedding(text);
}
```

**Collections:**
- `manoe_characters` - Профили персонажей с metadata
- `manoe_worldbuilding` - Локации, культуры, правила мира
- `manoe_scenes` - Контент сцен для continuity

---

## 4. Real-time Events: Redis Streams to Frontend

### Flow Diagram

```
Backend: Публикация события
├── StorytellerOrchestrator
│   └── publishEvent(runId, "phase_start", { phase: "genesis" })
│       └── api-gateway/src/services/StorytellerOrchestrator.ts:984
│
├── RedisStreamsService.publishEvent()
│   └── api-gateway/src/services/RedisStreamsService.ts:177
│   ├── Создание event object
│   │   └── { type, runId, timestamp, data: JSON.stringify(data) }
│   ├── XADD to run-specific stream
│   │   └── redis.xadd("manoe:events:{runId}", "MAXLEN", "~", "1000", "*", ...fields)
│   └── XADD to global stream
│       └── redis.xadd("manoe:events:global", "MAXLEN", "~", "10000", "*", ...fields)

Backend: SSE Endpoint
├── GET /orchestrate/runs/:runId/events
│   └── api-gateway/src/controllers/OrchestrationController.ts:476
│   ├── Установка SSE headers
│   │   └── res.setHeader("Content-Type", "text/event-stream")
│   ├── Подписка на stream
│   │   └── redisStreams.streamEvents(runId, "$", 5000)
│   └── Отправка событий клиенту
│       └── for await (const event of stream) {
│           res.write(`data: ${JSON.stringify(event)}\n\n`)
│       }

Frontend: Consumption
├── useGenerationStream(runId)
│   └── frontend/src/hooks/useGenerationStream.ts:154
│   ├── Создание EventSource
│   │   └── new EventSource(`${API_URL}/orchestrate/runs/${runId}/events`)
│   ├── Обработка событий
│   │   └── eventSource.onmessage = (event) => {
│           const data = JSON.parse(event.data);
│           dispatch({ type: data.type, payload: data });
│       }
│   └── Обновление React state
│       └── setMessages([...messages, newMessage])

Frontend: Rendering
├── AgentChat component
│   └── frontend/src/components/AgentChat.tsx
│   ├── Фильтрация по типу события
│   │   └── messages.filter(m => m.type === "agent_complete")
│   └── Рендеринг карточек агентов
│
└── CinematicAgentPanel (Glass Brain)
    └── frontend/src/components/cinematic/CinematicAgentPanel.tsx
    ├── Фильтрация cinematic событий
    │   └── messages.filter(m => ["agent_thought", "agent_dialogue"].includes(m.type))
    └── Рендеринг thought bubbles и диалогов
```

### Motivation

Real-time события создают engaging UX:

- **Transparency**: Пользователь видит, что делает система
- **Progress indication**: Понятно, на какой фазе генерация
- **Glass Brain**: Уникальная визуализация "мышления" агентов
- **Error feedback**: Немедленное уведомление об ошибках

### Details

**AsyncGenerator для streaming (строки 255-309):**
```typescript
async *streamEvents(runId, startId = "$", blockMs = 5000) {
  let lastId = startId;
  while (true) {
    const entries = await redis.call("XREAD", "BLOCK", blockMs, "STREAMS", streamKey, lastId);
    if (entries) {
      for (const [entryId, fields] of entries) {
        lastId = entryId;
        yield parseStreamEntry(entryId, fields);
      }
    } else {
      yield { type: "heartbeat", ... }; // Keep-alive
    }
  }
}
```

**Heartbeat каждые 5 секунд** предотвращает timeout соединения.

---

## 5. Observability: Langfuse LLM Call Tracing

### Flow Diagram

```
Инициализация trace
├── StorytellerOrchestrator.startGeneration()
│   └── langfuse.startTrace({ projectId, runId, phase })
│       └── api-gateway/src/services/LangfuseService.ts
│       └── Создание root trace в Langfuse

Трейсинг LLM вызова
├── BaseAgent.callLLM()
│   └── api-gateway/src/agents/BaseAgent.ts:133
│   ├── Создание span
│   │   └── langfuse.startSpan(runId, `${agentType}_call`, { phase })
│   │       └── Span привязывается к parent trace
│   ├── LLM вызов
│   │   └── llmProvider.createCompletionWithRetry(...)
│   ├── Трекинг результата
│   │   └── langfuse.trackLLMCall(runId, agentType, messages, response, spanId)
│   │       └── Записывает:
│   │           - Input messages
│   │           - Output content
│   │           - Token usage (input/output)
│   │           - Latency
│   │           - Model name
│   │           - Provider
│   └── Завершение span
│       └── langfuse.endSpan(runId, spanId, { content: response.substring(0, 500) })

Prompt Management
├── LangfuseService.getPrompt(promptName)
│   └── api-gateway/src/services/LangfuseService.ts
│   ├── Запрос к Langfuse API
│   │   └── GET /api/prompts/{promptName}?label=production
│   ├── Кэширование промпта
│   │   └── this.promptCache.set(promptName, prompt)
│   └── Возврат версионированного промпта
│       └── { content, config, version }

Завершение trace
├── StorytellerOrchestrator.runGeneration()
│   └── langfuse.endTrace(runId, { status: "completed", totalScenes })
│       └── Финализация trace с metadata
```

### Motivation

Langfuse обеспечивает полную observability:

- **Cost tracking**: Сколько токенов потрачено на каждый вызов
- **Latency monitoring**: Время ответа по провайдерам/моделям
- **Debugging**: Полный input/output для каждого LLM вызова
- **Prompt versioning**: A/B тестирование промптов

### Details

**Структура trace в Langfuse:**
```
Trace: generation-{runId}
├── Span: architect_call (GENESIS)
│   └── Generation: GPT-4 call
│       ├── Input: [system, user messages]
│       ├── Output: narrative JSON
│       └── Usage: 1500 input, 2000 output tokens
├── Span: profiler_call (CHARACTERS)
│   └── Generation: Claude call
└── Span: writer_call (DRAFTING, scene 1)
    └── Generation: GPT-4 call
```

**Prompt labels:**
- `production` - Текущая production версия
- `staging` - Для тестирования
- `latest` - Последняя версия

---

## 6. Frontend: Real-time Display and Regeneration

### Flow Diagram

```
Инициализация страницы генерации
├── GenerationPage.tsx
│   └── frontend/src/pages/GenerationPage.tsx
│   ├── useParams() → projectId
│   ├── useGenerationStream(runId)
│   │   └── Подключение к SSE
│   └── Рендеринг layout
│       └── <AgentChat messages={messages} />

Обработка событий
├── useGenerationStream hook
│   └── frontend/src/hooks/useGenerationStream.ts:154
│   ├── EventSource.onmessage
│   │   └── Парсинг JSON события
│   ├── Dispatch по типу события
│   │   ├── "phase_start" → setCurrentPhase(phase)
│   │   ├── "agent_complete" → addMessage(agentOutput)
│   │   ├── "agent_thought" → addCinematicEvent(thought)
│   │   ├── "generation_completed" → setIsComplete(true)
│   │   └── "ERROR" → setError(error)
│   └── Обновление state
│       └── setMessages([...messages, newMessage])

Рендеринг AgentChat
├── AgentChat.tsx
│   └── frontend/src/components/AgentChat.tsx
│   ├── Группировка сообщений по агентам
│   │   └── messages.reduce((acc, msg) => groupByAgent(acc, msg))
│   ├── Рендеринг карточек агентов
│   │   └── agents.map(agent => <AgentCard key={agent.type} ... />)
│   └── Кнопки Edit/Regenerate
│       └── onClick={() => openRegenerationModal(agent)}

Selective Regeneration
├── Пользователь редактирует output агента
│   └── <textarea value={editedContent} onChange={...} />
├── Клик "Regenerate"
│   └── handleRegenerate()
│       └── frontend/src/components/AgentChat.tsx
│       ├── Сбор constraints
│       │   └── {
│       │       editedAgent: "writer",
│       │       editedContent: "...",
│       │       editComment: "Make protagonist more conflicted",
│       │       lockedAgents: ["architect", "profiler"],
│       │       scenesToRegenerate: [2, 5]
│       │   }
│       └── POST /orchestrate/generate
│           └── { ...options, constraints, start_from_phase: "drafting" }

Glass Brain Mode
├── Toggle: showGlassBrain
│   └── <button onClick={() => setShowGlassBrain(!showGlassBrain)} />
├── 3-column layout
│   ├── WorldStatePanel (20% width)
│   │   └── frontend/src/components/observability/WorldStatePanel.tsx
│   │   └── Отображение Key Constraints и Raw Facts
│   ├── AgentChat (flexible width)
│   │   └── Центральная панель с сообщениями
│   └── CinematicAgentPanel (30% width)
│       └── frontend/src/components/cinematic/CinematicAgentPanel.tsx
│       └── Аватары агентов, thought bubbles, диалоги
```

### Motivation

Frontend обеспечивает:

- **Real-time feedback**: Пользователь видит прогресс мгновенно
- **Transparency**: Glass Brain показывает "мышление" агентов
- **Control**: Edit/Regenerate для итеративного улучшения
- **Flexibility**: Scene-level и phase-level regeneration

### Details

**RegenerationConstraints interface:**
```typescript
interface RegenerationConstraints {
  editedAgent?: AgentType;
  editedContent?: string;
  editComment?: string;
  lockedAgents?: AgentType[];
  agentsToRegenerate?: AgentType[];
  scenesToRegenerate?: number[];
}
```

**Event filtering для Glass Brain:**
```typescript
const cinematicEvents = messages.filter(msg => 
  ["agent_thought", "agent_dialogue", "agent_conflict", "agent_consensus"]
    .includes(msg.type)
);
```

---

## Summary: Key Execution Paths

| Путь | Начало | Конец | Ключевые файлы |
|------|--------|-------|----------------|
| Generation Launch | POST /generate | generation_completed event | OrchestrationController, StorytellerOrchestrator |
| LLM Call | agent.execute() | AgentOutput | BaseAgent, LLMProviderService, LangfuseService |
| Vector Search | draftScene() | relevantCharacters | QdrantMemoryService |
| Event Streaming | publishEvent() | React state update | RedisStreamsService, useGenerationStream |
| Tracing | startTrace() | endTrace() | LangfuseService |
| Regeneration | Edit button click | New generation run | AgentChat, OrchestrationController |

---

## Next Steps

1. Используйте Langfuse dashboard для просмотра реальных traces
2. Добавьте console.log в ключевые точки для понимания потока
3. Изучите [UI Architecture](UI_ARCHITECTURE.md) для деталей frontend
4. Запустите локально и проследите события в Redis CLI: `redis-cli XREAD STREAMS manoe:events:global 0`
