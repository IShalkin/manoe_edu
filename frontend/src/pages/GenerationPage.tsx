/**
 * ============================================================================
 * GENERATION PAGE
 * ============================================================================
 * 
 * This is the MAIN UI for story generation - where users watch their narrative
 * come to life through the multi-agent orchestration system. It's like a
 * control room where you can see all the AI agents working together.
 * 
 * PAGE STRUCTURE:
 * ---------------
 * 
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header: Project name, mode toggles, status                  │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │                                                             │
 *   │  ┌─────────────────┐  ┌─────────────────────────────────┐  │
 *   │  │ Glass Brain     │  │ Agent Chat                      │  │
 *   │  │ (Cinematic UI)  │  │ (Messages & Results)            │  │
 *   │  │                 │  │                                 │  │
 *   │  │ Agent thoughts  │  │ Phase progress                  │  │
 *   │  │ Agent dialogue  │  │ Agent outputs                   │  │
 *   │  │ World state     │  │ Regeneration controls           │  │
 *   │  └─────────────────┘  └─────────────────────────────────┘  │
 *   │                                                             │
 *   └─────────────────────────────────────────────────────────────┘
 * 
 * KEY FEATURES:
 * -------------
 * 
 *   1. REAL-TIME STREAMING
 *      Uses useGenerationStream hook to receive SSE events from backend.
 *      Updates UI as agents work - users see progress in real-time.
 * 
 *   2. GLASS BRAIN MODE
 *      Toggle to show/hide the "cinematic" observability panels:
 *      - CinematicAgentPanel: Agent thoughts and dialogue
 *      - WorldStatePanel: Extracted facts and constraints
 * 
 *   3. BRANCHING MODE
 *      Toggle between generation modes:
 *      - Branching: Architect generates multiple narrative possibilities,
 *        user chooses one before continuing
 *      - Direct: Single narrative path, no user choice
 * 
 *   4. REGENERATION
 *      Users can edit agent outputs and regenerate from that point:
 *      - Edit an agent's output (e.g., change character description)
 *      - Lock other agents (keep their outputs)
 *      - Regenerate downstream agents with new context
 * 
 *   5. RESUME INTERRUPTED RUNS
 *      If the orchestrator restarts mid-generation, users can resume
 *      from the last completed phase (state recovery feature).
 * 
 * GENERATION FLOW:
 * ----------------
 * 
 *   1. User navigates to /generate/:projectId
 *   2. Page loads project from local storage
 *   3. If no runId, starts new generation via POST /generate
 *   4. Receives runId, opens SSE connection
 *   5. Events stream in, updating UI components
 *   6. On completion, marks project as completed
 * 
 * AGENT TO PHASE MAPPING:
 * -----------------------
 * When regenerating, we need to know which phase to restart from:
 * 
 *   Architect → genesis
 *   Profiler → characters
 *   Worldbuilder → worldbuilding
 *   Strategist → outlining
 *   Writer → drafting
 *   Critic → drafting (part of Writer↔Critic loop)
 * 
 * STATE MANAGEMENT:
 * -----------------
 * Uses multiple React hooks for state:
 *   - useParams: Get projectId from URL
 *   - useSearchParams: Get runId from query string
 *   - useSettings: Get API keys and agent configs
 *   - useProjects: CRUD operations for projects
 *   - useGenerationStream: SSE event handling
 *   - useState: Local UI state (isStarting, error, etc.)
 * 
 * ERROR HANDLING:
 * ---------------
 * Displays user-friendly error messages for:
 *   - Missing API keys
 *   - Network failures
 *   - Orchestrator errors
 *   - Invalid project state
 * 
 * @see useGenerationStream.ts for SSE event handling
 * @see AgentChat.tsx for message display and regeneration
 * @see CinematicAgentPanel.tsx for Glass Brain visualization
 * @see OrchestrationController.ts for backend API
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useSettings } from '../hooks/useSettings';
import { useProjects, StoredProject, ProjectResult } from '../hooks/useProjects';
import { useGenerationStream } from '../hooks/useGenerationStream';
import { AgentChat, RegenerationConstraints } from '../components/AgentChat';
import { WorldStatePanel } from '../components/observability';
import { CinematicAgentPanel } from '../components/cinematic/CinematicAgentPanel';
import { orchestratorFetch, getOrchestratorUrl } from '../lib/api';
import type { NarrativePossibility } from '../types';

/**
 * Multi-agent orchestrator URL (separate subdomain)
 * The orchestrator runs on a different service than the frontend
 */
const ORCHESTRATOR_URL = getOrchestratorUrl();

export function GenerationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { hasAnyApiKey, getAgentConfig, getProviderKey } = useSettings();
  const { 
    projects, 
    getProject,
    updateProject,
    startGeneration, 
    completeGeneration, 
    failGeneration,
  } = useProjects();
  
  const [project, setProject] = useState<StoredProject | null>(null);
  const [runId, setRunId] = useState<string | null>(searchParams.get('runId'));
  const [isStarting, setIsStarting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useBranchingMode, setUseBranchingMode] = useState(true);
  const [selectedNarrative, setSelectedNarrative] = useState<NarrativePossibility | null>(null);
  const [isGlassBrainMode, setIsGlassBrainMode] = useState(true);

  // Glass Brain: SSE stream for observability panels
  const {
    rawFacts,
  } = useGenerationStream({
    runId,
  });

  // Load project data
  useEffect(() => {
    if (projectId) {
      const foundProject = getProject(projectId);
      if (foundProject) {
        setProject(foundProject);
        // If project has an existing runId and we don't have one, use it
        if (foundProject.runId && !runId) {
          setRunId(foundProject.runId);
        }
      }
    }
  }, [projectId, projects, getProject, runId]);

  // Start generation if we have a project but no runId
  useEffect(() => {
    if (project && !runId && !isStarting && project.status !== 'completed') {
      startNewGeneration();
    }
  }, [project, runId, isStarting]);

  // Map agent names to phases for phase-based regeneration
  // Phase taxonomy aligned with backend orchestrator phases
  // Backend phases: genesis → characters → worldbuilding → outlining → motif_layer → advanced_planning → drafting → polish
  const AGENT_TO_PHASE: Record<string, string> = {
    'Architect': 'genesis',
    'Profiler': 'characters',
    'Worldbuilder': 'worldbuilding',
    'Strategist': 'outlining',
    'Writer': 'drafting',
    'Critic': 'drafting', // Critic is part of Writer↔Critic drafting loop, not a separate polish phase
  };

  // Handle regeneration with constraints from AgentChat
  const handleRegenerate = useCallback(async (constraints: RegenerationConstraints) => {
    if (!project || isRegenerating) return;
    
    if (!hasAnyApiKey()) {
      setError('Please configure an API key in Settings first');
      return;
    }

    setIsRegenerating(true);
    setError(null);

    try {
      const agentConfig = getAgentConfig('architect');
      
      if (!agentConfig) {
        throw new Error('No agent configuration found. Please configure a provider in Settings.');
      }
      
      const apiKey = getProviderKey(agentConfig.provider);
      
      if (!apiKey) {
        throw new Error(`No API key configured for ${agentConfig.provider}`);
      }

      // Determine the phase to start from based on the edited agent
      const startFromPhase = AGENT_TO_PHASE[constraints.editedAgent] || 'genesis';
      
      // Build edited content object with the agent's edited content
      const editedContent: Record<string, unknown> = {};
      if (constraints.editedAgent && constraints.editedContent) {
        editedContent[startFromPhase] = {
          content: constraints.editedContent,
          comment: constraints.editComment,
        };
      }

      // Call orchestrator with phase-based regeneration parameters
      const response = await orchestratorFetch('/generate', {
        method: 'POST',
        body: JSON.stringify({
          seed_idea: project.seedIdea,
          moral_compass: project.moralCompass,
          target_audience: project.targetAudience,
          themes: project.themes,
          provider: agentConfig.provider,
          model: agentConfig.model,
          api_key: apiKey,
          generation_mode: 'full',
          constraints: {
            edited_agent: constraints.editedAgent,
            edited_content: constraints.editedContent,
            edit_comment: constraints.editComment,
            locked_agents: constraints.lockedAgents,
            agents_to_regenerate: constraints.agentsToRegenerate,
          },
          start_from_phase: startFromPhase,
          previous_run_id: runId,
          edited_content: editedContent,
          scenes_to_regenerate: constraints.scenesToRegenerate,
          supabase_project_id: project.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const newRunId = data.run_id;
      
      // Update project with new runId and mark as generating
      await startGeneration(project.id, newRunId);
      setRunId(newRunId);
      
      // Update URL with runId for bookmarking/sharing
      window.history.replaceState(null, '', `/generate/${project.id}?runId=${newRunId}`);
    } catch (err) {
      console.error('[GenerationPage] Failed to regenerate:', err);
      setError(err instanceof Error ? err.message : 'Failed to regenerate');
    } finally {
      setIsRegenerating(false);
    }
  }, [project, isRegenerating, hasAnyApiKey, getAgentConfig, getProviderKey, startGeneration, runId]);

  // Handle updating project result (for persisting edits/locks)
  const handleUpdateResult = useCallback(async (result: ProjectResult) => {
    if (!project) return;
    try {
      await updateProject(project.id, { result });
    } catch (err) {
      console.error('[GenerationPage] Failed to update project result:', err);
    }
  }, [project, updateProject]);

  // Handle resume interrupted generation (after redeploy)
  const handleResume = useCallback(async (previousRunId: string, startFromPhase: string) => {
    if (!project || isRegenerating) return;
    
    if (!hasAnyApiKey()) {
      setError('Please configure an API key in Settings first');
      return;
    }

    setIsRegenerating(true);
    setError(null);

    try {
      const agentConfig = getAgentConfig('architect');
      
      if (!agentConfig) {
        throw new Error('No agent configuration found. Please configure a provider in Settings.');
      }
      
      const apiKey = getProviderKey(agentConfig.provider);
      
      if (!apiKey) {
        throw new Error(`No API key configured for ${agentConfig.provider}`);
      }

      // Call orchestrator with resume parameters
      const response = await orchestratorFetch('/generate', {
        method: 'POST',
        body: JSON.stringify({
          seed_idea: project.seedIdea,
          moral_compass: project.moralCompass,
          target_audience: project.targetAudience,
          themes: project.themes,
          provider: agentConfig.provider,
          model: agentConfig.model,
          api_key: apiKey,
          generation_mode: 'full',
          start_from_phase: startFromPhase,
          previous_run_id: previousRunId,
          supabase_project_id: project.id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const newRunId = data.run_id;
      
      // Update project with new runId and mark as generating
      await startGeneration(project.id, newRunId);
      setRunId(newRunId);
      
      // Update URL with runId for bookmarking/sharing
      window.history.replaceState(null, '', `/generate/${project.id}?runId=${newRunId}`);
    } catch (err) {
      console.error('[GenerationPage] Failed to resume generation:', err);
      setError(err instanceof Error ? err.message : 'Failed to resume generation');
    } finally {
      setIsRegenerating(false);
    }
  }, [project, isRegenerating, hasAnyApiKey, getAgentConfig, getProviderKey, startGeneration]);

  const startNewGeneration = async () => {
    if (!project || isStarting) return;
    
    if (!hasAnyApiKey()) {
      setError('Please configure an API key in Settings first');
      return;
    }

    setIsStarting(true);
    setError(null);

    try {
      // Get agent config for the first available provider
      const agentConfig = getAgentConfig('architect');
      
      if (!agentConfig) {
        throw new Error('No agent configuration found. Please configure a provider in Settings.');
      }
      
      const apiKey = getProviderKey(agentConfig.provider);
      
      if (!apiKey) {
        throw new Error(`No API key configured for ${agentConfig.provider}`);
      }

      // Call orchestrator to start generation
      // Use branching mode if enabled and no narrative is pre-selected
      const generationMode = useBranchingMode && !selectedNarrative ? 'branching' : 'full';
      const response = await orchestratorFetch('/generate', {
        method: 'POST',
        body: JSON.stringify({
          seed_idea: project.seedIdea,
          moral_compass: project.moralCompass,
          target_audience: project.targetAudience,
          themes: project.themes,
          provider: agentConfig.provider,
          model: agentConfig.model,
          api_key: apiKey,
          generation_mode: generationMode,
          supabase_project_id: project.id,
          ...(selectedNarrative && { selected_narrative: selectedNarrative }),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const newRunId = data.run_id;
      
      // Update project with new runId
      await startGeneration(project.id, newRunId);
      setRunId(newRunId);
      
      // Update URL with runId for bookmarking/sharing
      window.history.replaceState(null, '', `/generate/${project.id}?runId=${newRunId}`);
    } catch (err) {
      console.error('[GenerationPage] Failed to start generation:', err);
      setError(err instanceof Error ? err.message : 'Failed to start generation');
    } finally {
      setIsStarting(false);
    }
  };

  if (!projectId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center max-w-md">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2">No Project Selected</h2>
          <p className="text-slate-400 mb-4">Please select a project from the dashboard to start generation.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <p className="text-slate-400">Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-700 px-3 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button
              onClick={() => navigate('/')}
              className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg flex-shrink-0"
              title="Back to Dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl font-bold truncate">{project.name}</h1>
              <p className="text-xs sm:text-sm text-slate-400 truncate">
                {project.seedIdea.substring(0, 60)}...
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Glass Brain Toggle */}
            <button
              onClick={() => setIsGlassBrainMode(!isGlassBrainMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                isGlassBrainMode
                  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600'
              }`}
              title={isGlassBrainMode ? 'Hide observability panels' : 'Show observability panels (Glass Brain)'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {isGlassBrainMode ? 'Glass Brain' : 'Simple'}
            </button>
            
            {/* Branching Mode Toggle */}
            <button
              onClick={() => setUseBranchingMode(!useBranchingMode)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                useBranchingMode
                  ? 'bg-cyan-600/20 text-cyan-400 border border-cyan-600/50'
                  : 'bg-slate-700/50 text-slate-400 border border-slate-600'
              }`}
              title={useBranchingMode ? 'Branching mode: Choose from multiple narrative directions' : 'Direct mode: Generate single narrative'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {useBranchingMode ? 'Branching' : 'Direct'}
            </button>
            
            {project.status === 'completed' && (
              <button
                onClick={startNewGeneration}
                disabled={isStarting}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isStarting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Regenerate
                  </>
                )}
              </button>
            )}
            
            <a
              href={`/generate/${project.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
              title="Open in new tab"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* Error Display */}
      {error && (
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-red-400">Error</h3>
              <p className="text-sm text-slate-400 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Main Content - Glass Brain 3-column layout when observability enabled */}
      <main className={`mx-auto px-3 sm:px-6 py-4 sm:py-6 ${isGlassBrainMode && runId ? 'max-w-full' : 'max-w-7xl'}`}>
        {isStarting && !runId ? (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center max-w-7xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">Starting generation...</p>
            <p className="text-sm text-slate-500 mt-1">Connecting to the orchestrator</p>
          </div>
        ) : runId ? (
          isGlassBrainMode ? (
            // Glass Brain: 3-column layout with independent scrolling
            <div className="flex h-[calc(100vh-120px)] overflow-hidden">
              {/* Left: World State Panel (20%) */}
              <div className="w-1/5 min-w-[250px] border-r border-slate-700 overflow-y-auto">
                <WorldStatePanel facts={rawFacts} />
              </div>
              
              {/* Center: Main Agent Chat (flex-1 to fill remaining space) */}
              <div className="flex-1 min-w-[400px] flex flex-col overflow-hidden">
                <AgentChat
                  runId={runId}
                  orchestratorUrl={ORCHESTRATOR_URL}
                  projectResult={project?.result}
                  onUpdateResult={handleUpdateResult}
                  onRegenerate={handleRegenerate}
                  onResume={handleResume}
                  onNarrativePossibilitySelected={async (possibility) => {
                    setSelectedNarrative(possibility);
                    setRunId(null);
                  }}
                  onComplete={async (result) => {
                    if (project) {
                      try {
                        if (result.error) {
                          await failGeneration(project.id, result.error);
                        } else {
                          await completeGeneration(project.id, {
                            narrativePossibility: result.narrative_possibility,
                            agentOutputs: result.agents,
                          });
                        }
                      } catch (e) {
                        console.error('[GenerationPage] Failed to update project:', e);
                      }
                    }
                  }}
                />
              </div>
              
              {/* Right: Cinematic Agent Panel (30%) */}
              <div className="w-[30%] min-w-[300px] border-l border-slate-700 h-full overflow-hidden">
                <CinematicAgentPanel runId={runId} />
              </div>
            </div>
          ): (
            // Simple mode: just AgentChat
            <AgentChat
              runId={runId}
              orchestratorUrl={ORCHESTRATOR_URL}
              projectResult={project?.result}
              onUpdateResult={handleUpdateResult}
              onRegenerate={handleRegenerate}
              onResume={handleResume}
              onNarrativePossibilitySelected={async (possibility) => {
                setSelectedNarrative(possibility);
                setRunId(null);
              }}
              onComplete={async (result) => {
                if (project) {
                  try {
                    if (result.error) {
                      await failGeneration(project.id, result.error);
                    } else {
                      await completeGeneration(project.id, {
                        narrativePossibility: result.narrative_possibility,
                        agentOutputs: result.agents,
                      });
                    }
                  } catch (e) {
                    console.error('[GenerationPage] Failed to update project:', e);
                  }
                }
              }}
            />
          )
        ) : (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center max-w-7xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">Ready to generate</p>
            <p className="text-sm text-slate-500 mt-1">Click the button below to start</p>
            <button
              onClick={startNewGeneration}
              disabled={isStarting}
              className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50"
            >
              Start Generation
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
