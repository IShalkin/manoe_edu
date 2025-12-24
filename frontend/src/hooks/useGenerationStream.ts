/**
 * ============================================================================
 * USE GENERATION STREAM HOOK
 * ============================================================================
 * 
 * This React hook provides REAL-TIME EVENT STREAMING from the backend
 * orchestrator. It's the frontend's "ears" that listen to what the AI
 * agents are doing and update the UI accordingly.
 * 
 * HOW IT WORKS:
 * -------------
 * 
 *   1. CONNECT TO SSE
 *      When a runId is provided, the hook opens an EventSource connection
 *      to the backend's SSE endpoint (/runs/{runId}/events).
 * 
 *   2. RECEIVE EVENTS
 *      The backend pushes events as they happen:
 *      - phase_start: New phase began (genesis, characters, etc.)
 *      - agent_start/complete: Agent activity
 *      - agent_thought: Agent's internal thinking (Glass Brain)
 *      - agent_dialogue: Agent-to-agent communication
 *      - scene_draft_complete: Scene finished
 *      - generation_completed: All done!
 *      - ERROR: Something went wrong
 * 
 *   3. UPDATE STATE
 *      Events update React state which triggers UI re-renders:
 *      - currentPhase: Which phase we're in
 *      - activeAgent: Which agent is currently working
 *      - messages: All events received (for AgentChat display)
 *      - rawFacts: Facts extracted from content (for WorldStatePanel)
 *      - isComplete/isCancelled: Terminal states
 * 
 * SSE (SERVER-SENT EVENTS):
 * -------------------------
 * SSE is a one-way streaming protocol from server to client:
 * 
 *   const eventSource = new EventSource('/stream/run-123');
 *   eventSource.onmessage = (e) => {
 *     const event = JSON.parse(e.data);
 *     // Handle event
 *   };
 * 
 * Benefits over WebSockets:
 *   - Simpler (one-way is all we need)
 *   - Auto-reconnect built-in
 *   - Works through proxies/firewalls
 *   - HTTP/2 multiplexing
 * 
 * EVENT NORMALIZATION:
 * --------------------
 * The hook normalizes events to handle different formats:
 * 
 *   // Backend might send:
 *   { type: "agent_thought", agent: "writer", thought: "..." }
 *   // Or:
 *   { type: "agent_thought", data: { agent: "writer", thought: "..." } }
 * 
 *   // Hook normalizes to:
 *   { type: "agent_thought", data: { agent: "writer", thought: "..." } }
 * 
 * This handles legacy Python format vs new TypeScript format.
 * 
 * REACT 18 STRICT MODE:
 * ---------------------
 * In development, React 18 mounts components twice to detect side effects.
 * This would cause double SSE connections! We handle this with:
 * 
 *   let isMounted = true;
 *   // ... setup connection ...
 *   return () => {
 *     isMounted = false;  // Cleanup on unmount
 *     eventSource.close();
 *   };
 * 
 * GLASS BRAIN EVENTS:
 * -------------------
 * Special "cinematic" events for the Glass Brain UI:
 *   - agent_thought: Shows thought bubble above agent
 *   - agent_dialogue: Shows message between agents
 *   - agent_conflict: Shows disagreement
 *   - agent_consensus: Shows agreement
 * 
 * These are logged separately and handled by CinematicAgentPanel.
 * 
 * USAGE:
 * ------
 *   const {
 *     isConnected,
 *     currentPhase,
 *     activeAgent,
 *     messages,
 *     isComplete,
 *     error,
 *   } = useGenerationStream({
 *     runId: 'run-123',
 *     onComplete: () => console.log('Done!'),
 *     onError: (err) => console.error(err),
 *   });
 * 
 * @see OrchestrationController.ts for the SSE endpoint
 * @see RedisStreamsService.ts for event publishing
 * @see GenerationPage.tsx for how this hook is used
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthenticatedSSEUrl } from '../lib/api';

/**
 * Event types from backend
 * Represents a single event from the SSE stream
 */
export interface AgentMessage {
  type: string;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface FactUpdate {
  subject: string;
  change: string;
  category: 'char' | 'world' | 'plot';
}

export interface WorldStateFact {
  key: string;
  value: string;
  scene_number: number;
  category: string;
  is_global?: boolean;
  source: 'raw' | 'canonical';
}

export interface GenerationStreamState {
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

interface UseGenerationStreamOptions {
  runId: string | null;
  onMessage?: (message: AgentMessage) => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function useGenerationStream({
  runId,
  onMessage,
  onComplete,
  onError,
}: UseGenerationStreamOptions): GenerationStreamState & {
  disconnect: () => void;
} {
  const [isConnected, setIsConnected] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [rawFacts, setRawFacts] = useState<FactUpdate[]>([]);
  const [worldState] = useState<WorldStateFact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!runId) return;

    let isMounted = true;

    const connectSSE = async () => {
      try {
        const sseUrl = await getAuthenticatedSSEUrl(`/runs/${runId}/events`);
        const eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
            setError(null);
          }
        };

        eventSource.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const rawData = JSON.parse(event.data);
            console.log('[useGenerationStream] Raw SSE event:', rawData);
            
            // Normalize the event to ensure consistent structure
            // Some events (like 'connected', 'ERROR') may not have a 'data' field
            // or may have data at the top level instead of nested
            const normalizedData: AgentMessage = {
              type: rawData.type ?? 'unknown',
              timestamp: rawData.timestamp,
              data: rawData.data ?? {},
            };
            
            // Handle legacy format where agent/thought might be at top level
            if (rawData.type === 'agent_thought' && !normalizedData.data.agent && rawData.agent) {
              normalizedData.data = { agent: rawData.agent, thought: rawData.thought, sentiment: rawData.sentiment };
            }
            if (rawData.type === 'agent_dialogue' && !normalizedData.data.from && rawData.from) {
              normalizedData.data = { from: rawData.from, to: rawData.to, message: rawData.message, dialogueType: rawData.dialogueType };
            }
            
            const data = normalizedData;

            // Update phase
            if (data.type === 'phase_start' && data.data.phase) {
              const phase = data.data.phase as string;
              setCurrentPhase(phase.charAt(0).toUpperCase() + phase.slice(1));
            }

            // Update active agent
            if (data.type === 'agent_start') {
              setActiveAgent(data.data.agent as string);
            }
            if (data.type === 'agent_complete') {
              setActiveAgent(null);
            }
            
            // Update active agent from cinematic events
            if (data.type === 'agent_thought' || data.type === 'agent_dialogue') {
              const agentData = data.data as { agent?: string; from?: string };
              if (agentData.agent || agentData.from) {
                setActiveAgent(agentData.agent || agentData.from);
              }
            }

            // Collect new developments (raw facts from Writer)
            if (data.type === 'new_developments_collected') {
              const developments = data.data.developments as FactUpdate[];
              if (developments && Array.isArray(developments)) {
                setRawFacts((prev) => [...prev, ...developments]);
              }
            }

            // Handle archivist snapshot complete (canonical facts)
            if (data.type === 'phase_complete' && data.data.phase === 'archivist_snapshot') {
              const constraints = data.data.constraints_count as number;
              if (constraints !== undefined) {
                // Could fetch canonical state here if needed
              }
            }

            // Handle completion (support both old and new event names)
            if (data.type === 'generation_complete' || data.type === 'generation_completed') {
              setIsComplete(true);
              eventSource.close();
              setIsConnected(false);
              onComplete?.();
              return;
            }

            // Handle cancellation
            if (data.type === 'generation_cancelled') {
              setIsCancelled(true);
              eventSource.close();
              setIsConnected(false);
              return;
            }

            // Handle errors (support both old and new event names)
            if (data.type === 'generation_error' || data.type === 'ERROR') {
              const errorMsg = data.data.error as string || 'Unknown error';
              setError(errorMsg);
              onError?.(errorMsg);
            }

            // Handle cinematic events
            if (
              data.type === "agent_thought" ||
              data.type === "agent_dialogue" ||
              data.type === "agent_conflict" ||
              data.type === "agent_consensus"
            ) {
              // These are handled specially in CinematicAgentPanel
              console.log('[useGenerationStream] Cinematic event received:', data.type, data);
            }

            // Store message
            setMessages((prev) => [...prev, data]);
            onMessage?.(data);

          } catch (e) {
            console.error('[useGenerationStream] Failed to parse event:', e);
          }
        };

        eventSource.onerror = () => {
          if (isMounted) {
            setError('Connection lost');
            setIsConnected(false);
          }
        };

      } catch (e) {
        if (isMounted) {
          const errorMsg = e instanceof Error ? e.message : 'Failed to connect';
          setError(errorMsg);
          onError?.(errorMsg);
        }
      }
    };

    connectSSE();

    // CRITICAL: Cleanup function to prevent double connections in React 18 Strict Mode
    return () => {
      isMounted = false;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [runId, onMessage, onComplete, onError]);

  return {
    isConnected,
    currentPhase,
    activeAgent,
    messages,
    rawFacts,
    worldState,
    error,
    isComplete,
    isCancelled,
    disconnect,
  };
}
