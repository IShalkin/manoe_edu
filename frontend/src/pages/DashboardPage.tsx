import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useSettings } from '../hooks/useSettings';
import { useProjects, StoredProject, ProjectResult } from '../hooks/useProjects';
import { orchestratorFetch } from '../lib/api';
import { 
  MoralCompass, 
  NarrativePOV, 
  NarratorReliability, 
  NarratorStance,
  OutputFormat,
  ReaderSensibilities,
  ResearchProvider,
  NARRATIVE_POV_OPTIONS,
  NARRATOR_RELIABILITY_OPTIONS,
  NARRATOR_STANCE_OPTIONS,
  OUTPUT_FORMAT_OPTIONS,
  CONTENT_SENSITIVITY_OPTIONS,
  DEFAULT_READER_SENSIBILITIES,
  RESEARCH_PROVIDERS,
} from '../types';

// Helper to format date as dd/mm/yyyy
function formatDateDDMMYYYY(isoDate: string): string {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

// Helper to format any value as readable Markdown
function formatValueAsMarkdown(value: unknown, depth = 0): string {
  if (value === null || value === undefined) {
    return '';
  }
  
  if (typeof value === 'string') {
    return value;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    // Check if array contains simple strings
    if (value.every(item => typeof item === 'string')) {
      return value.map(item => `- ${item}`).join('\n');
    }
    // Complex array items
    return value.map((item, i) => `### Item ${i + 1}\n${formatValueAsMarkdown(item, depth + 1)}`).join('\n\n');
  }
  
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sections: string[] = [];
    
    for (const [key, val] of Object.entries(obj)) {
      if (val === null || val === undefined || val === '') continue;
      
      // Format key as title (snake_case to Title Case)
      const title = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
      
      const content = formatValueAsMarkdown(val, depth + 1);
      if (content) {
        if (depth === 0) {
          sections.push(`## ${title}\n${content}`);
        } else {
          sections.push(`**${title}:** ${content}`);
        }
      }
    }
    
    return sections.join('\n\n');
  }
  
  return String(value);
}

// Helper to format result as readable text
function formatResultAsMarkdown(result: ProjectResult): string {
  if (result.error) {
    return `**Error:** ${result.error}`;
  }
  
  // Try story key first (from Writer's output)
  const story = (result as Record<string, unknown>)['story'];
  if (story && typeof story === 'string' && story.trim().length > 0) {
    return story;
  }
  
  // Try agents combined output (check both 'agents' and 'agentOutputs' keys)
  const agents = (result as Record<string, unknown>)['agents'] || (result as Record<string, unknown>)['agentOutputs'];
  if (agents && typeof agents === 'object' && Object.keys(agents as object).length > 0) {
    const agentContent = agents as Record<string, string>;
    const sections: string[] = [];
    for (const [agentName, content] of Object.entries(agentContent)) {
      if (content && content.trim()) {
        sections.push(`## ${agentName}\n\n${content}`);
      }
    }
    if (sections.length > 0) {
      return sections.join('\n\n---\n\n');
    }
  }
  
  // Try narrativePossibility (camelCase from frontend)
  const np = result.narrativePossibility;
  if (np && typeof np === 'object' && Object.keys(np).length > 0) {
    return formatValueAsMarkdown(np);
  }
  
  // Try narrative_possibility (snake_case from backend)
  const npSnake = (result as Record<string, unknown>)['narrative_possibility'];
  if (npSnake && typeof npSnake === 'object' && Object.keys(npSnake as object).length > 0) {
    return formatValueAsMarkdown(npSnake);
  }
  
  // Try other common result keys
  const commonKeys = ['final_story', 'text', 'content', 'output', 'draft', 'result'];
  for (const key of commonKeys) {
    const val = (result as Record<string, unknown>)[key];
    if (val) {
      return formatValueAsMarkdown(val);
    }
  }
  
  // If result has any other keys, format them
  const resultKeys = Object.keys(result).filter(k => k !== 'error');
  if (resultKeys.length > 0) {
    return formatValueAsMarkdown(result);
  }
  
  return '*No content generated yet*';
}

type GenerationMode = 'full';

interface ProjectFormData {
  name: string;
  seedIdea: string;
  moralCompass: MoralCompass;
  customMoralSystem: string;
  targetAudience: string;
  themes: string;
  toneStyleReferences: string;
  outputFormat: OutputFormat;
  readerSensibilities: ReaderSensibilities;
  generationMode: GenerationMode;
  maxRevisions: number;
  narrativePov: NarrativePOV;
  narratorReliability: NarratorReliability;
  narratorStance: NarratorStance;
}

export function DashboardPage() {
  const navigate = useNavigate();
  const { hasAnyApiKey, getAgentConfig, getProviderKey, getResearchProviderKey } = useSettings();
  const { 
    projects, 
    createProject, 
    updateProject,
    startGeneration, 
    deleteProject,
  } = useProjects();
  
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState<StoredProject | null>(null);
    const [formData, setFormData] = useState<ProjectFormData>({
      name: '',
      seedIdea: '',
      moralCompass: 'ambiguous',
      customMoralSystem: '',
      targetAudience: '',
      themes: '',
      toneStyleReferences: '',
      outputFormat: 'short_story',
      readerSensibilities: { ...DEFAULT_READER_SENSIBILITIES },
      generationMode: 'full',
      maxRevisions: 2,
      narrativePov: 'third_person_limited',
      narratorReliability: 'reliable',
      narratorStance: 'objective',
    });

    const openNewProjectModal = () => {
      setEditingProject(null);
      setFormData({
        name: '',
        seedIdea: '',
        moralCompass: 'ambiguous',
        customMoralSystem: '',
        targetAudience: '',
        themes: '',
        toneStyleReferences: '',
        outputFormat: 'short_story',
        readerSensibilities: { ...DEFAULT_READER_SENSIBILITIES },
        generationMode: 'full',
        maxRevisions: 2,
        narrativePov: 'third_person_limited',
        narratorReliability: 'reliable',
        narratorStance: 'objective',
      });
      setError(null);
      setShowProjectModal(true);
    };

    const openEditProjectModal = (project: StoredProject) => {
      setEditingProject(project);
      setFormData({
        name: project.name,
        seedIdea: project.seedIdea,
        moralCompass: (project.moralCompass as MoralCompass) || 'ambiguous',
        customMoralSystem: '',
        targetAudience: project.targetAudience,
        themes: project.themes,
        toneStyleReferences: '',
        outputFormat: (project.outputFormat as OutputFormat) || 'short_story',
        readerSensibilities: (project.readerSensibilities as unknown as ReaderSensibilities) || { ...DEFAULT_READER_SENSIBILITIES },
        generationMode: 'full',
        maxRevisions: 2,
        narrativePov: 'third_person_limited',
        narratorReliability: 'reliable',
        narratorStance: 'objective',
      });
      setError(null);
      setShowProjectModal(true);
    };

  const closeProjectModal = () => {
    setShowProjectModal(false);
    setEditingProject(null);
    setError(null);
  };
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingProject, setViewingProject] = useState<StoredProject | null>(null);
  
  const [showResearchModal, setShowResearchModal] = useState(false);
  const [selectedResearchProvider, setSelectedResearchProvider] = useState<ResearchProvider | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [researchResult, setResearchResult] = useState<string | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);

  const hasAnyResearchKey = () => {
    return RESEARCH_PROVIDERS.some(p => getResearchProviderKey(p.id));
  };

  const handleResearch = async () => {
    if (!selectedResearchProvider) {
      setResearchError('Please select a research provider');
      return;
    }
    
    const apiKey = getResearchProviderKey(selectedResearchProvider);
    if (!apiKey) {
      setResearchError(`No API key configured for ${selectedResearchProvider}. Please add it in Settings.`);
      return;
    }
    
    if (!formData.seedIdea.trim()) {
      setResearchError('Please enter a seed idea first');
      return;
    }
    
    setIsResearching(true);
    setResearchError(null);
    setResearchResult(null);
    
    try {
      const response = await orchestratorFetch('/research', {
        method: 'POST',
        body: JSON.stringify({
          seed_idea: formData.seedIdea,
          target_audience: formData.targetAudience || '',
          themes: formData.themes || '',
          moral_compass: formData.moralCompass,
          provider: selectedResearchProvider,
          api_key: apiKey,
        }),
      });
      
      const data = await response.json();
      
      // Handle async job response - poll for results
      if (data.success && data.job_id && (data.status === 'pending' || data.status === 'running')) {
        console.log('[DashboardPage] Research job started:', data.job_id);
        
        // Poll for results every 5 seconds
        const pollInterval = 5000;
        const maxPolls = 120; // 10 minutes max
        let polls = 0;
        
        const pollForResults = async (): Promise<void> => {
          polls++;
          if (polls > maxPolls) {
            setResearchError('Research timed out. Please try again.');
            setIsResearching(false);
            return;
          }
          
          try {
            const pollResponse = await orchestratorFetch(`/research/job/${data.job_id}`, {
              method: 'GET',
            });
            const pollData = await pollResponse.json();
            
            if (pollData.status === 'completed' && pollData.content) {
              setResearchResult(pollData.content);
              if (pollData.content.length > 0) {
                const audienceMatch = pollData.content.match(/(?:target audience|audience analysis|primary audience)[:\s]*([^\n]+)/i);
                if (audienceMatch) {
                  setFormData(prev => ({ ...prev, targetAudience: audienceMatch[1].trim() }));
                }
              }
              setIsResearching(false);
            } else if (pollData.status === 'failed') {
              setResearchError(pollData.error || 'Research failed. Please try again.');
              setIsResearching(false);
            } else {
              // Still pending or running - poll again
              setTimeout(pollForResults, pollInterval);
            }
          } catch (pollErr) {
            console.error('[DashboardPage] Poll error:', pollErr);
            setResearchError('Failed to check research status. Please try again.');
            setIsResearching(false);
          }
        };
        
        // Start polling after initial delay
        setTimeout(pollForResults, pollInterval);
        return;
      }
      
      // Handle immediate response (cached result or error)
      if (data.success && data.content) {
        setResearchResult(data.content);
        if (data.content.length > 0) {
          const audienceMatch = data.content.match(/(?:target audience|audience analysis|primary audience)[:\s]*([^\n]+)/i);
          if (audienceMatch) {
            setFormData(prev => ({ ...prev, targetAudience: audienceMatch[1].trim() }));
          }
        }
        setIsResearching(false);
      } else {
        setResearchError(data.error || 'Research failed. Please try again.');
        setIsResearching(false);
      }
    } catch (err) {
      console.error('[DashboardPage] Research error:', err);
      setResearchError(err instanceof Error ? err.message : 'Network error');
      setIsResearching(false);
    }
  };

  // Continue an in-progress generation - navigate to generation page
  const continueGeneration = (project: StoredProject) => {
    if (project.runId) {
      navigate(`/generate/${project.id}?runId=${project.runId}`);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setError(null);
    
    const architectConfig = getAgentConfig('architect');
    if (!architectConfig) {
      setError('No agent configuration found. Please configure agents in Settings.');
      setIsGenerating(false);
      return;
    }
    
    const apiKey = getProviderKey(architectConfig.provider);
    console.log('[DashboardPage] Architect provider:', architectConfig.provider, 'API key present:', !!apiKey);
    if (!apiKey) {
      setError(`No API key found for "${architectConfig.provider}". The Architect agent is configured to use ${architectConfig.provider}. Please either add your ${architectConfig.provider} API key in Settings, or change the Architect's provider in "Agent Configuration" tab.`);
      setIsGenerating(false);
      return;
    }
    
    try {
      const response = await orchestratorFetch('/generate', {
        method: 'POST',
        body: JSON.stringify({
          provider: architectConfig.provider,
          model: architectConfig.model,
          api_key: apiKey,
          seed_idea: formData.seedIdea,
          moral_compass: formData.moralCompass,
          custom_moral_system: formData.moralCompass === 'user_defined' ? formData.customMoralSystem : undefined,
          target_audience: formData.targetAudience || undefined,
          themes: formData.themes || undefined,
          tone_style_references: formData.toneStyleReferences || undefined,
          output_format: formData.outputFormat,
          reader_sensibilities: formData.readerSensibilities,
          generation_mode: formData.generationMode,
          max_revisions: formData.maxRevisions,
          narrator_config: {
            pov: formData.narrativePov,
            reliability: formData.narratorReliability,
            stance: formData.narratorStance,
          },
          research_context: researchResult || undefined,
        }),
      });
      
      const data = await response.json();
      
      if (data.success && data.run_id) {
        let projectId: string;
        
        if (editingProject) {
          await updateProject(editingProject.id, {
            name: formData.name || 'Untitled Project',
            seedIdea: formData.seedIdea,
            moralCompass: formData.moralCompass,
            targetAudience: formData.targetAudience,
            themes: formData.themes,
            outputFormat: formData.outputFormat,
            readerSensibilities: formData.readerSensibilities as unknown as Record<string, unknown>,
            status: 'pending',
            result: null,
          });
          projectId = editingProject.id;
        } else {
          const newProject = await createProject({
            name: formData.name || 'Untitled Project',
            seedIdea: formData.seedIdea,
            moralCompass: formData.moralCompass,
            targetAudience: formData.targetAudience,
            themes: formData.themes,
            outputFormat: formData.outputFormat,
            readerSensibilities: formData.readerSensibilities as unknown as Record<string, unknown>,
          });
          projectId = newProject.id;
        }
        
        await startGeneration(projectId, data.run_id);
        
        closeProjectModal();
        // Navigate to the separate generation page
        navigate(`/generate/${projectId}?runId=${data.run_id}`);
      } else {
        setError(data.error || 'Failed to start generation. Please try again.');
      }
    } catch (err) {
      console.error('[DashboardPage] Generation error:', err);
      let errorMsg = 'Unknown error';
      if (err instanceof Error) {
        errorMsg = err.message || err.name || String(err);
      } else if (typeof err === 'string') {
        errorMsg = err;
      } else if (err && typeof err === 'object') {
        errorMsg = JSON.stringify(err, Object.getOwnPropertyNames(err)) || String(err);
      }
      setError(`Network error: ${errorMsg}`);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!hasAnyApiKey()) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-center">
          <h2 className="text-xl font-semibold text-amber-400 mb-2">No API Keys Configured</h2>
          <p className="text-slate-400 mb-4">
            Please configure at least one LLM provider API key in Settings before creating projects.
          </p>
          <a
            href="/settings"
            className="inline-block bg-amber-500 text-white px-6 py-2 rounded-lg hover:bg-amber-600 transition-colors"
          >
            Go to Settings
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-slate-400">Create and manage your narrative projects</p>
        </div>
        <button
          onClick={openNewProjectModal}
          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-500 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-red-400">Error</h3>
              <p className="text-sm text-slate-400 mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {showProjectModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">{editingProject ? 'Edit Project' : 'Create New Project'}</h2>
              <button
                onClick={closeProjectModal}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium mb-2">Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Epic Story"
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Seed Idea (What If?)</label>
                <textarea
                  value={formData.seedIdea}
                  onChange={(e) => setFormData({ ...formData, seedIdea: e.target.value })}
                  placeholder="What if a detective discovered that all the crimes in the city were connected to a single, immortal mastermind?"
                  rows={4}
                  className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors resize-none"
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Start with "What if..." to spark your narrative
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Moral Compass</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'ethical', label: 'Ethical', desc: 'Virtue, justice, moral clarity' },
                    { value: 'unethical', label: 'Unethical', desc: 'Darkness, taboos, moral ambiguity' },
                    { value: 'amoral', label: 'Amoral', desc: 'Non-judgmental observation' },
                    { value: 'ambiguous', label: 'Ambiguous', desc: 'Complex moral dilemmas' },
                    { value: 'user_defined', label: 'User Defined', desc: 'Custom moral framework' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, moralCompass: option.value as MoralCompass })}
                      className={`p-4 rounded-xl border text-left transition-all ${
                        formData.moralCompass === option.value
                          ? 'border-primary-500 bg-primary-500/10'
                          : 'border-slate-600 hover:border-slate-500'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="text-xs text-slate-500">{option.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {formData.moralCompass === 'user_defined' && (
                <div>
                  <label className="block text-sm font-medium mb-2">Custom Moral System</label>
                  <textarea
                    value={formData.customMoralSystem}
                    onChange={(e) => setFormData({ ...formData, customMoralSystem: e.target.value })}
                    placeholder="Describe your custom moral framework. E.g., 'A world where loyalty to family supersedes all other moral considerations, even at the cost of broader societal harm.'"
                    rows={3}
                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors resize-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Define the moral rules and ethical boundaries for your narrative
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Target Audience</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.targetAudience}
                    onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                    placeholder="Young adults, fans of psychological thrillers"
                    className="flex-1 bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                  />
                  {hasAnyResearchKey() && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowResearchModal(true);
                        setResearchResult(null);
                        setResearchError(null);
                        const firstAvailable = RESEARCH_PROVIDERS.find(p => getResearchProviderKey(p.id));
                        if (firstAvailable) {
                          setSelectedResearchProvider(firstAvailable.id);
                        }
                      }}
                      className="px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors flex items-center gap-2 whitespace-nowrap"
                      title="Deep Research"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Research
                    </button>
                  )}
                </div>
                {!hasAnyResearchKey() && (
                  <p className="text-xs text-slate-500 mt-1">
                    Add Perplexity or OpenAI Deep Research API keys in Settings to enable market research
                  </p>
                )}
              </div>

                            <div>
                              <label className="block text-sm font-medium mb-2">Core Themes (comma-separated)</label>
                              <input
                                type="text"
                                value={formData.themes}
                                onChange={(e) => setFormData({ ...formData, themes: e.target.value })}
                                placeholder="Identity, redemption, the nature of evil"
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                              />
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2">Tone & Style References</label>
                              <input
                                type="text"
                                value={formData.toneStyleReferences}
                                onChange={(e) => setFormData({ ...formData, toneStyleReferences: e.target.value })}
                                placeholder="Palahniuk-esque cynicism, Cormac McCarthy's sparse prose, Kafka's absurdism"
                                className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 transition-colors"
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                Reference authors, styles, or tonal qualities to guide the narrative voice
                              </p>
                            </div>

                            {/* Output Format Selection */}
                            <div className="border-t border-slate-700 pt-4 mt-2">
                              <h3 className="text-sm font-semibold text-slate-300 mb-3">Output Format</h3>
                              <div className="grid grid-cols-2 gap-3">
                                {OUTPUT_FORMAT_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, outputFormat: option.value })}
                                    className={`p-4 rounded-xl border text-left transition-all ${
                                      formData.outputFormat === option.value
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-slate-600 hover:border-slate-500'
                                    }`}
                                  >
                                    <div className="font-medium">{option.label}</div>
                                    <div className="text-xs text-slate-500">{option.desc}</div>
                                    <div className="text-xs text-slate-400 mt-1">{option.wordCount}</div>
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* Reader Sensibilities/Triggers */}
                            <div className="border-t border-slate-700 pt-4 mt-2">
                              <h3 className="text-sm font-semibold text-slate-300 mb-3">Reader Sensibilities</h3>
                              <p className="text-xs text-slate-500 mb-4">
                                Configure content sensitivity levels for your narrative
                              </p>
                              <div className="space-y-4">
                                {(['violence', 'sexualContent', 'profanity', 'drugUse', 'darkThemes'] as const).map((category) => (
                                  <div key={category} className="flex items-center justify-between">
                                    <label className="text-sm font-medium capitalize">
                                      {category === 'sexualContent' ? 'Sexual Content' : 
                                       category === 'drugUse' ? 'Drug Use' : 
                                       category === 'darkThemes' ? 'Dark Themes' : category}
                                    </label>
                                    <div className="flex gap-1">
                                      {CONTENT_SENSITIVITY_OPTIONS.map((option) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => setFormData({
                                            ...formData,
                                            readerSensibilities: {
                                              ...formData.readerSensibilities,
                                              [category]: option.value,
                                            },
                                          })}
                                          className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                                            formData.readerSensibilities[category] === option.value
                                              ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                                              : 'border-slate-600 hover:border-slate-500 text-slate-400'
                                          }`}
                                          title={option.desc}
                                        >
                                          {option.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                <div>
                                  <label className="block text-sm font-medium mb-2">Trigger Warnings (comma-separated)</label>
                                  <input
                                    type="text"
                                    value={formData.readerSensibilities.triggerWarnings.join(', ')}
                                    onChange={(e) => setFormData({
                                      ...formData,
                                      readerSensibilities: {
                                        ...formData.readerSensibilities,
                                        triggerWarnings: e.target.value.split(',').map(t => t.trim()).filter(t => t),
                                      },
                                    })}
                                    placeholder="death, trauma, abuse"
                                    className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                  />
                                  <p className="text-xs text-slate-500 mt-1">
                                    Specific content warnings to include in the generated story
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Narrator Design Section */}
                            <div className="border-t border-slate-700 pt-4 mt-2">
                              <h3 className="text-sm font-semibold text-slate-300 mb-3">Narrator Design</h3>
                              
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-sm font-medium mb-2">Point of View (POV)</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    {NARRATIVE_POV_OPTIONS.map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setFormData({ ...formData, narrativePov: option.value })}
                                        className={`p-3 rounded-lg border text-left transition-all ${
                                          formData.narrativePov === option.value
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-slate-600 hover:border-slate-500'
                                        }`}
                                      >
                                        <div className="font-medium text-sm">{option.label}</div>
                                        <div className="text-xs text-slate-500">{option.desc}</div>
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-sm font-medium mb-2">Narrator Reliability</label>
                                    <div className="space-y-2">
                                      {NARRATOR_RELIABILITY_OPTIONS.map((option) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => setFormData({ ...formData, narratorReliability: option.value })}
                                          className={`w-full p-3 rounded-lg border text-left transition-all ${
                                            formData.narratorReliability === option.value
                                              ? 'border-blue-500 bg-blue-500/10'
                                              : 'border-slate-600 hover:border-slate-500'
                                          }`}
                                        >
                                          <div className="font-medium text-sm">{option.label}</div>
                                          <div className="text-xs text-slate-500">{option.desc}</div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <label className="block text-sm font-medium mb-2">Narrator Stance</label>
                                    <div className="space-y-2">
                                      {NARRATOR_STANCE_OPTIONS.map((option) => (
                                        <button
                                          key={option.value}
                                          type="button"
                                          onClick={() => setFormData({ ...formData, narratorStance: option.value })}
                                          className={`w-full p-3 rounded-lg border text-left transition-all ${
                                            formData.narratorStance === option.value
                                              ? 'border-blue-500 bg-blue-500/10'
                                              : 'border-slate-600 hover:border-slate-500'
                                          }`}
                                        >
                                          <div className="font-medium text-sm">{option.label}</div>
                                          <div className="text-xs text-slate-500">{option.desc}</div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="block text-sm font-medium mb-2">
                                Max Revisions per Scene: {formData.maxRevisions}
                              </label>
                              <input
                                type="range"
                                min="1"
                                max="5"
                                value={formData.maxRevisions}
                                onChange={(e) => setFormData({ ...formData, maxRevisions: parseInt(e.target.value) })}
                                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                              />
                              <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>1 (faster)</span>
                                <span>5 (more refined)</span>
                              </div>
                              <p className="text-xs text-slate-500 mt-2">
                                Controls how many times the Writer and Critic can revise each scene before moving on.
                              </p>
                            </div>

                            <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeProjectModal}
                  className="flex-1 px-6 py-3 border border-slate-600 rounded-xl hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isGenerating ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating...
                    </>
                  ) : editingProject ? (
                    'Generate'
                  ) : (
                    'Create Project'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Result Viewer Modal */}
      {viewingProject && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-700 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  viewingProject.status === 'completed' ? 'bg-green-600' :
                  viewingProject.status === 'error' ? 'bg-red-600' :
                  'bg-slate-600'
                }`}>
                  {viewingProject.status === 'completed' ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : viewingProject.status === 'error' ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-semibold">{viewingProject.name}</h2>
                  <p className="text-xs text-slate-400">
                    {viewingProject.status === 'completed' ? 'Generation Complete' : 
                     viewingProject.status === 'error' ? 'Generation Failed' : 'View Result'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingProject(null)}
                className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Project Info */}
            <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-700">
              <p className="text-sm text-slate-400 italic">"{viewingProject.seedIdea}"</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span>Created: {formatDateDDMMYYYY(viewingProject.createdAt)}</span>
                <span>Moral Compass: {viewingProject.moralCompass}</span>
                {viewingProject.themes && <span>Themes: {viewingProject.themes}</span>}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {viewingProject.result ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 className="text-xl font-bold text-white mt-6 mb-3 first:mt-0">{children}</h2>,
                      p: ({ children }) => <p className="text-slate-300 mb-4 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
                      li: ({ children }) => <li className="text-slate-300">{children}</li>,
                      strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
                    }}
                  >
                    {formatResultAsMarkdown(viewingProject.result)}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-slate-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-slate-500">No result data available</p>
                  <p className="text-sm text-slate-600 mt-1">This project hasn't been generated yet</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 bg-slate-800/50 flex gap-3">
              <button
                onClick={() => {
                  setViewingProject(null);
                  openEditProjectModal(viewingProject);
                }}
                className="flex-1 px-4 py-2 border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors text-sm"
              >
                Regenerate
              </button>
              <button
                onClick={() => setViewingProject(null)}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div 
            key={project.id} 
            className={`bg-slate-800/50 border rounded-xl p-6 transition-colors ${
              project.status === 'completed' ? 'border-green-500/30 hover:border-green-500/50' :
              project.status === 'generating' ? 'border-amber-500/30 hover:border-amber-500/50' :
              project.status === 'error' ? 'border-red-500/30 hover:border-red-500/50' :
              'border-slate-700 hover:border-primary-500/50'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-lg">{project.name}</h3>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  project.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                  project.status === 'generating' ? 'bg-amber-500/20 text-amber-400' :
                  project.status === 'error' ? 'bg-red-500/20 text-red-400' :
                  'bg-slate-500/20 text-slate-400'
                }`}>
                  {project.status === 'generating' ? 'In Progress' : 
                   project.status.charAt(0).toUpperCase() + project.status.slice(1)}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-400 line-clamp-2 mb-4">
              {project.seedIdea.substring(0, 100)}...
            </p>
            
            {/* Action Buttons */}
            <div className="flex items-center gap-2 mb-3">
              {(project.status === 'completed' || project.status === 'error') && (
                <>
                  <button
                    onClick={() => navigate(`/generate/${project.id}`)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View
                  </button>
                  <a
                    href={`/generate/${project.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </>
              )}
              {project.status === 'generating' && project.runId && (
                <>
                  <button
                    onClick={() => continueGeneration(project)}
                    className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Continue
                  </button>
                  <a
                    href={`/generate/${project.id}?runId=${project.runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </>
              )}
              {project.status === 'pending' && (
                <>
                  <button
                    onClick={() => openEditProjectModal(project)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate
                  </button>
                  <a
                    href={`/generate/${project.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </>
              )}
              <button
                onClick={() => openEditProjectModal(project)}
                className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                title="Edit & Regenerate"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">
                {formatDateDDMMYYYY(project.createdAt)}
              </span>
              <button 
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await deleteProject(project.id);
                  } catch (err) {
                    console.error('[DashboardPage] Failed to delete project:', err);
                    setError(err instanceof Error ? err.message : 'Failed to delete project');
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        
        <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-primary-500/50 transition-colors cursor-pointer" onClick={openNewProjectModal}>
          <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="font-medium text-slate-400">{projects.length === 0 ? 'Create your first project' : 'New Project'}</h3>
          <p className="text-sm text-slate-500 mt-1">Start with a "What If?" idea</p>
        </div>
      </div>

      {showResearchModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-bold">Market Research</h2>
                  <p className="text-xs text-slate-400">Deep research on your target audience</p>
                </div>
              </div>
              <button
                onClick={() => setShowResearchModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Research Provider</label>
                <div className="grid grid-cols-2 gap-3">
                  {RESEARCH_PROVIDERS.map(provider => {
                    const hasKey = !!getResearchProviderKey(provider.id);
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => hasKey && setSelectedResearchProvider(provider.id)}
                        disabled={!hasKey}
                        className={`p-4 rounded-xl border text-left transition-all ${
                          selectedResearchProvider === provider.id
                            ? 'border-emerald-500 bg-emerald-500/10'
                            : hasKey
                              ? 'border-slate-600 hover:border-slate-500'
                              : 'border-slate-700 opacity-50 cursor-not-allowed'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white ${hasKey ? 'bg-emerald-600' : 'bg-slate-600'}`}>
                            {provider.icon}
                          </div>
                          <div>
                            <div className="font-medium">{provider.name}</div>
                            <div className="text-xs text-slate-500">{provider.description}</div>
                          </div>
                        </div>
                        {!hasKey && (
                          <p className="text-xs text-amber-400 mt-2">API key not configured</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
                <h4 className="text-sm font-medium mb-2">Research Context</h4>
                <div className="text-xs text-slate-400 space-y-1">
                  <p><span className="text-slate-500">Seed Idea:</span> {formData.seedIdea || 'Not set'}</p>
                  <p><span className="text-slate-500">Current Audience:</span> {formData.targetAudience || 'Not set'}</p>
                  <p><span className="text-slate-500">Themes:</span> {formData.themes || 'Not set'}</p>
                </div>
              </div>

              {researchError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-sm text-red-400">{researchError}</p>
                </div>
              )}

              {researchResult && (
                <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700 max-h-96 overflow-y-auto">
                  <h4 className="text-sm font-medium mb-3 text-emerald-400">Research Results</h4>
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{researchResult}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowResearchModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleResearch}
                  disabled={isResearching || !selectedResearchProvider}
                  className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isResearching ? (
                    <>
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Researching...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Start Research
                    </>
                  )}
                </button>
              </div>
              
              <p className="text-xs text-slate-500 text-center">
                Research may take 1-10 minutes depending on the provider. Results will help refine your target audience.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
