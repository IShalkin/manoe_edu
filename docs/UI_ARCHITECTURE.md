# MANOE UI Architecture

## Overview

MANOE использует **hardcoded React component rendering** - в системе нет декларативного UI specification формата. Все компоненты написаны как традиционные React компоненты с JSX, имеют hardcoded layouts, styling (Tailwind CSS), и поведение.

Ключевая особенность UI - **"Glass Brain"** визуализация, которая позволяет пользователям наблюдать за "мышлением" и "общением" AI агентов в реальном времени.

---

## Frontend Architecture

### Technology Stack

- **React 18** - UI библиотека с hooks
- **TypeScript** - Типизация
- **Vite** - Build tool и dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Анимации
- **Supabase** - Аутентификация и persistence

### Main Components

Glass Brain визуализация состоит из трех основных React компонентов в 3-колоночном layout:

#### 1. WorldStatePanel (слева, ~20% ширины)

**Файл:** `frontend/src/components/observability/WorldStatePanel.tsx` (строки 31-161)

Отображает извлеченные факты (Raw Facts) из генерируемого контента, сгруппированные по категориям.

**Props:**
```typescript
interface WorldStatePanelProps {
  facts: FactUpdate[];
  currentScene?: number;
}
```

**Категории фактов:**
- `char` (Characters) - Факты о персонажах (emerald color)
- `world` (World) - Факты о мире (blue color)
- `plot` (Plot) - Факты о сюжете (amber color)

**Особенности:**
- Группировка фактов по категориям с иконками
- Анимированное появление новых фактов (Framer Motion)
- Счетчик фактов и индикатор текущей сцены

#### 2. AgentChat (центр, гибкая ширина)

**Файл:** `frontend/src/components/AgentChat.tsx` (2534 строки)

Основной компонент для отображения выводов агентов и управления регенерацией.

**Функциональность:**
- Карточки агентов с их outputs
- Timeline сообщений
- Edit/Regenerate controls
- Scene-level и phase-level regeneration modals
- Locked agents для selective regeneration

**Ключевые состояния:**
```typescript
const [editedContent, setEditedContent] = useState<Record<string, string>>({});
const [lockedAgents, setLockedAgents] = useState<Set<AgentType>>(new Set());
const [scenesToRegenerate, setScenesToRegenerate] = useState<number[]>([]);
```

#### 3. CinematicAgentPanel (справа, ~30% ширины)

**Файл:** `frontend/src/components/cinematic/CinematicAgentPanel.tsx` (строки 30-169)

"Glass Brain" визуализация - показывает агентов, их мысли и диалоги.

**Props:**
```typescript
interface CinematicAgentPanelProps {
  runId: string | null;
}
```

**Компоненты:**
- **Agent Grid** - Сетка 5x2 с аватарами всех 9 агентов
- **AgentAvatar** - Аватар агента с индикатором статуса
- **DialogueBubble** - Пузыри с мыслями и диалогами

**Статусы агентов:**
```typescript
type AgentStatus = "idle" | "active" | "speaking" | "listening";
```

**Фильтрация cinematic событий (строки 36-46):**
```typescript
const cinematicMessages = useMemo(() => {
  return messages.filter(
    (msg) =>
      msg.type === "agent_thought" ||
      msg.type === "agent_dialogue" ||
      msg.type === "agent_conflict" ||
      msg.type === "agent_consensus"
  );
}, [messages]);
```

---

## State Management

Приложение использует React hooks для управления состоянием без глобального state manager (Redux/Zustand).

### useGenerationStream

**Файл:** `frontend/src/hooks/useGenerationStream.ts` (строки 154-348)

Управляет SSE соединением и обновляет состояние на основе событий.

**Возвращаемое состояние:**
```typescript
interface GenerationStreamState {
  isConnected: boolean;
  currentPhase: string;
  activeAgent: string | null;
  messages: AgentMessage[];
  rawFacts: FactUpdate[];
  worldState: WorldStateFact[];
  error: string | null;
  isComplete: boolean;
  isCancelled: boolean;
}
```

**Обработка событий (строки 200-306):**
- `phase_start` → `setCurrentPhase(phase)`
- `agent_start` → `setActiveAgent(agent)`
- `agent_complete` → `setActiveAgent(null)`
- `agent_thought` / `agent_dialogue` → Добавление в messages
- `new_developments_collected` → `setRawFacts([...prev, ...developments])`
- `generation_completed` → `setIsComplete(true)`

### useProjects

**Файл:** `frontend/src/hooks/useProjects.ts`

CRUD операции с проектами через Supabase.

**Методы:**
- `createProject(seedIdea, settings)` - Создание проекта
- `updateProject(id, updates)` - Обновление
- `deleteProject(id)` - Удаление
- `startGeneration(projectId)` - Запуск генерации
- `getProjectArtifacts(projectId)` - Получение артефактов

### useSettings (SettingsContext)

**Файл:** `frontend/src/contexts/SettingsContext.tsx`

Управление API ключами и конфигурацией агентов.

**Хранение:**
- API ключи хранятся в LocalStorage (BYOK модель)
- Никогда не отправляются на сервер для хранения

**Методы:**
- `updateProvider(provider, apiKey)` - Обновление API ключа
- `getAgentConfig(agentType)` - Получение конфигурации агента
- `setAgentModel(agentType, model)` - Назначение модели агенту

---

## Data Flow: Backend → UI

### 1. Event Streaming Architecture

Backend использует **Redis Streams** для публикации событий в реальном времени.

**Файл:** `api-gateway/src/services/RedisStreamsService.ts`

```
StorytellerOrchestrator
    ↓ publishEvent(runId, type, data)
RedisStreamsService
    ↓ XADD to Redis Stream
Redis Stream (manoe:events:{runId})
```

### 2. Agent Event Emission

Агенты наследуют от `BaseAgent` методы для эмиссии cinematic событий.

**Файл:** `api-gateway/src/agents/BaseAgent.ts` (строки 283-335)

**emitThought() (строки 286-308):**
```typescript
protected async emitThought(
  runId: string,
  thought: string,
  sentiment: "neutral" | "agree" | "disagree" | "excited" | "concerned" = "neutral",
  targetAgent?: AgentType
): Promise<void> {
  await this.redisStreams.publishEvent(runId, "agent_thought", {
    agent: this.agentType,
    thought,
    sentiment,
    targetAgent,
  });
}
```

**emitDialogue() (строки 313-335):**
```typescript
protected async emitDialogue(
  runId: string,
  to: AgentType,
  message: string,
  dialogueType: "question" | "objection" | "approval" | "suggestion" = "suggestion"
): Promise<void> {
  await this.redisStreams.publishEvent(runId, "agent_dialogue", {
    from: this.agentType,
    to,
    message,
    dialogueType,
  });
}
```

**Типы событий:**
- `agent_thought` - Внутреннее мышление агента (thought bubbles)
- `agent_dialogue` - Коммуникация между агентами
- `agent_start` / `agent_complete` - Статус активности агента
- `phase_start` / `phase_complete` - Переходы между фазами

### 3. SSE Endpoint

Backend предоставляет события через SSE endpoint.

**Файл:** `api-gateway/src/controllers/OrchestrationController.ts` (строки 476-611)

**Endpoint:** `GET /orchestrate/runs/:runId/events`

**Процесс:**
1. Установка SSE headers (`Content-Type: text/event-stream`)
2. Подписка на Redis Stream через `streamEvents()`
3. Отправка событий клиенту через `res.write()`
4. Heartbeat каждые 5 секунд для keep-alive

### 4. Frontend Event Consumption

Hook `useGenerationStream` подключается к SSE endpoint.

**Файл:** `frontend/src/hooks/useGenerationStream.ts` (строки 154-348)

**Подключение (строки 187-191):**
```typescript
const sseUrl = await getAuthenticatedSSEUrl(`/runs/${runId}/events`);
const eventSource = new EventSource(sseUrl);
eventSourceRef.current = eventSource;
```

**Нормализация событий (строки 210-222):**
```typescript
// Handle legacy format where agent/thought might be at top level
if (rawData.type === 'agent_thought' && !normalizedData.data.agent && rawData.agent) {
  normalizedData.data = { agent: rawData.agent, thought: rawData.thought, sentiment: rawData.sentiment };
}
```

### 5. Glass Brain Rendering

Компонент `CinematicAgentPanel` фильтрует и отображает cinematic события.

**Файл:** `frontend/src/components/cinematic/CinematicAgentPanel.tsx` (строки 30-169)

**Отображает:**
- Аватары агентов с индикаторами статуса (idle/active/speaking/listening)
- Диалоговые пузыри с мыслями агентов
- Сообщения между агентами

**Рендеринг событий (строки 123-163):**
```typescript
cinematicMessages.map((msg, idx) => {
  if (msg.type === "agent_thought") {
    return (
      <DialogueBubble
        from={data.agent as AgentType}
        message={data.thought as string}
        type="thought"
        timestamp={msg.timestamp}
      />
    );
  }
  if (msg.type === "agent_dialogue") {
    return (
      <DialogueBubble
        from={data.from as AgentType}
        to={data.to as AgentType}
        message={data.message as string}
        type={data.dialogueType}
        timestamp={msg.timestamp}
      />
    );
  }
});
```

### 6. World State Rendering

`WorldStatePanel` отображает факты по категориям.

**Файл:** `frontend/src/components/observability/WorldStatePanel.tsx` (строки 31-161)

**Группировка фактов (строки 33-38):**
```typescript
const groupedFacts = facts.reduce((acc, fact) => {
  const category = fact.category || 'plot';
  if (!acc[category]) acc[category] = [];
  acc[category].push(fact);
  return acc;
}, {} as Record<string, FactUpdate[]>);
```

**Анимация появления (строки 118-130):**
```typescript
<motion.li
  layout
  initial={{ opacity: 0, x: -20, scale: 0.95 }}
  animate={{ opacity: 1, x: 0, scale: 1 }}
  exit={{ opacity: 0, x: 20, scale: 0.95 }}
  transition={{
    type: 'spring',
    stiffness: 500,
    damping: 30,
  }}
>
```

---

## Component Rendering: Hardcoded vs Declarative

UI **полностью hardcoded** - нет декларативного UI specification формата.

### Характеристики:

1. **Традиционные React компоненты с JSX**
   - Каждый компонент написан вручную
   - Нет генерации UI из конфигурации

2. **Hardcoded layouts и styling**
   - Tailwind CSS классы прописаны в JSX
   - Нет динамической темизации

3. **Рендеринг на основе props и state**
   - Компоненты реактивны к изменениям состояния
   - Нет рендеринга из конфигурационного объекта

4. **Прямая проверка типов событий**
   ```typescript
   if (msg.type === "agent_thought") { ... }
   if (msg.type === "agent_dialogue") { ... }
   ```

### Agent Metadata

Цвета, иконки, описания агентов определены как TypeScript константы.

**Пример из CinematicAgentPanel:**
```typescript
const ALL_AGENTS: AgentType[] = [
  "architect",
  "profiler",
  "worldbuilder",
  "strategist",
  "writer",
  "critic",
  "originality",
  "impact",
  "archivist",
];
```

**Цвета категорий в WorldStatePanel:**
```typescript
const CATEGORY_COLORS = {
  char: { bg: 'bg-emerald-900/30', border: 'border-emerald-600/50', text: 'text-emerald-400' },
  world: { bg: 'bg-blue-900/30', border: 'border-blue-600/50', text: 'text-blue-400' },
  plot: { bg: 'bg-amber-900/30', border: 'border-amber-600/50', text: 'text-amber-400' },
};
```

---

## Layout Modes

### Simple Mode (Default)

Только центральная панель AgentChat:
```
┌─────────────────────────────────────────┐
│              AgentChat                  │
│         (agent outputs, edit,           │
│          regenerate controls)           │
└─────────────────────────────────────────┘
```

### Glass Brain Mode (Toggle)

3-колоночный layout с визуализацией:
```
┌──────────┬─────────────────┬────────────┐
│ World    │    AgentChat    │ Cinematic  │
│ State    │                 │ Agent      │
│ Panel    │                 │ Panel      │
│ (~20%)   │   (flexible)    │ (~30%)     │
└──────────┴─────────────────┴────────────┘
```

**Toggle:**
```typescript
const [showGlassBrain, setShowGlassBrain] = useState(false);

<button onClick={() => setShowGlassBrain(!showGlassBrain)}>
  {showGlassBrain ? "Hide Glass Brain" : "Show Glass Brain"}
</button>
```

---

## Regeneration Flow

### Phase-Based Regeneration

1. Пользователь редактирует output агента
2. Вводит комментарий "What did you change?"
3. Выбирает locked agents (outputs которых сохранить)
4. Клик "Regenerate"
5. POST `/orchestrate/generate` с constraints

**RegenerationConstraints:**
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

### Scene-Level Regeneration

1. Пользователь открывает modal выбора сцен
2. Выбирает конкретные сцены для регенерации
3. Система сохраняет остальные сцены
4. Writer перегенерирует только выбранные

---

## Notes

### Нет declarative UI framework

Кодовая база не использует:
- JSON-based UI specifications
- Dynamic component generation
- Schema-driven rendering

Все UI написан как традиционный React код.

### Event-driven architecture

UI реактивен к SSE событиям из Redis Streams:
- Новые события → обновление state → re-render
- Heartbeat поддерживает соединение
- Auto-reconnect при потере связи

### Toggle-based layout

Пользователи могут переключать "Glass Brain" режим:
- Simple mode для фокуса на контенте
- Glass Brain для наблюдения за агентами

### Hardcoded agent metadata

Цвета, иконки, описания агентов определены как TypeScript константы:
- Изменение требует редактирования кода
- Нет runtime конфигурации

---

## Key Files Reference

| Компонент | Файл | Описание |
|-----------|------|----------|
| AgentChat | `frontend/src/components/AgentChat.tsx` | Основной UI компонент |
| CinematicAgentPanel | `frontend/src/components/cinematic/CinematicAgentPanel.tsx` | Glass Brain визуализация |
| WorldStatePanel | `frontend/src/components/observability/WorldStatePanel.tsx` | Отображение фактов |
| useGenerationStream | `frontend/src/hooks/useGenerationStream.ts` | SSE hook |
| useProjects | `frontend/src/hooks/useProjects.ts` | Project CRUD |
| SettingsContext | `frontend/src/contexts/SettingsContext.tsx` | API keys management |
| GenerationPage | `frontend/src/pages/GenerationPage.tsx` | Страница генерации |
| DashboardPage | `frontend/src/pages/DashboardPage.tsx` | Создание проектов |

---

## Next Steps

1. Изучите [Architecture Learning Path](ARCHITECTURE_LEARNING_PATH.md) для понимания backend
2. Прочитайте [Execution Traces](EXECUTION_TRACES.md) для понимания потоков данных
3. Запустите frontend локально и откройте DevTools → Network → EventStream
4. Добавьте console.log в useGenerationStream для отладки событий
