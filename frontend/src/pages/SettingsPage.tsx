import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';
import { PROVIDERS, AGENTS, LLMProvider, RESEARCH_PROVIDERS } from '../types';
import { orchestratorFetch } from '../lib/api';

interface ResearchHistoryItem {
  id: string;
  provider: string;
  model?: string;
  seed_idea: string;
  target_audience?: string;
  themes?: string;
  moral_compass?: string;
  content?: string;
  prompt_context?: string;
  citations?: Array<{ url: string; title?: string }>;
  created_at: string;
}

export function SettingsPage() {
  const { 
    updateProvider, 
    updateAgentConfig, 
    getProviderKey, 
    getAgentConfig, 
    getAvailableModels,
    fetchModelsForProvider,
    isLoadingModels,
    hasDynamicModels,
    updateResearchProvider,
    getResearchProviderKey,
  } = useSettings();
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [researchHistory, setResearchHistory] = useState<ResearchHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedResearch, setExpandedResearch] = useState<string | null>(null);

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const fetchResearchHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await orchestratorFetch('/research/history?limit=20');
      const data = await response.json();
      if (data.success && data.research) {
        setResearchHistory(data.research);
      } else {
        setHistoryError(data.error || 'Failed to load research history');
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchResearchHistory();
  }, []);

  const formatDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">Settings</h1>
      <p className="text-slate-400 mb-8">Configure your LLM providers and agent models</p>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 text-sm">1</span>
          API Keys (BYOK)
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Enter your API keys for the providers you want to use. Keys are stored locally in your browser.
        </p>
        
        <div className="grid gap-4">
          {PROVIDERS.map(provider => {
            const currentKey = getProviderKey(provider.id) || '';
            const isVisible = showKeys[provider.id];
            
            return (
              <div key={provider.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white">
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      <p className="text-xs text-slate-500">
                        {provider.id === 'openai' && 'sk-...'}
                        {provider.id === 'openrouter' && 'sk-or-...'}
                        {provider.id === 'gemini' && 'AI...'}
                        {provider.id === 'anthropic' && 'sk-ant-...'}
                      </p>
                    </div>
                  </div>
                  {currentKey && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                      Configured
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={currentKey}
                      onChange={(e) => updateProvider(provider.id, e.target.value)}
                      placeholder={`Enter your ${provider.name} API key`}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => toggleShowKey(provider.id)}
                    className="px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm"
                  >
                    {isVisible ? 'Hide' : 'Show'}
                  </button>
                  {currentKey && (
                    <button
                      onClick={async () => {
                        setLoadErrors(prev => ({ ...prev, [provider.id]: '' }));
                        const result = await fetchModelsForProvider(provider.id);
                        if (!result.success) {
                          setLoadErrors(prev => ({ ...prev, [provider.id]: result.error || 'Failed to load models' }));
                        }
                      }}
                      disabled={isLoadingModels(provider.id)}
                      className="px-3 py-2 bg-primary-600 rounded-lg hover:bg-primary-500 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isLoadingModels(provider.id) ? 'Loading...' : hasDynamicModels(provider.id) ? 'Refresh Models' : 'Load Models'}
                    </button>
                  )}
                </div>
                {loadErrors[provider.id] && (
                  <p className="mt-2 text-xs text-red-400">{loadErrors[provider.id]}</p>
                )}
                {hasDynamicModels(provider.id) && (
                  <p className="mt-2 text-xs text-green-400">
                    {getAvailableModels(provider.id).length} models loaded from API
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm">2</span>
          Research Providers
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Configure research providers for deep market research on your target audience. Keys are stored locally in your browser.
        </p>
        
        <div className="grid gap-4">
          {RESEARCH_PROVIDERS.map(provider => {
            const currentKey = getResearchProviderKey(provider.id) || '';
            const isVisible = showKeys[`research_${provider.id}`];
            
            return (
              <div key={provider.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white">
                      {provider.icon}
                    </div>
                    <div>
                      <h3 className="font-medium">{provider.name}</h3>
                      <p className="text-xs text-slate-500">{provider.description}</p>
                    </div>
                  </div>
                  {currentKey && (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-400">
                      Configured
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={isVisible ? 'text' : 'password'}
                      value={currentKey}
                      onChange={(e) => updateResearchProvider(provider.id, e.target.value)}
                      placeholder={`Enter your ${provider.name} API key (${provider.keyPrefix})`}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => toggleShowKey(`research_${provider.id}`)}
                    className="px-3 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm"
                  >
                    {isVisible ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        
        <div className="mt-4 p-4 bg-slate-900/30 rounded-xl border border-slate-700/50">
          <h4 className="text-sm font-medium text-slate-300 mb-2">About Research Providers</h4>
          <p className="text-xs text-slate-500 leading-relaxed">
            Research providers enable deep market analysis for your storytelling projects. Perplexity uses web search to gather current market data, while OpenAI Deep Research provides comprehensive analysis using advanced reasoning models. Configure at least one provider to enable the research feature when creating projects.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-sm">3</span>
            Research History
          </h2>
          <button
            onClick={fetchResearchHistory}
            disabled={isLoadingHistory}
            className="px-3 py-1.5 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors text-sm disabled:opacity-50"
          >
            {isLoadingHistory ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <p className="text-slate-400 text-sm mb-4">
          View your past research results. These are stored for reuse via the "Eternal Memory" feature.
        </p>

        {historyError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {historyError}
          </div>
        )}

        {isLoadingHistory ? (
          <div className="flex items-center justify-center py-8">
            <svg className="w-6 h-6 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        ) : researchHistory.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>No research history yet</p>
            <p className="text-xs mt-1">Conduct research from the Dashboard to see results here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {researchHistory.map(item => (
              <div key={item.id} className="bg-slate-800/50 rounded-xl border border-slate-700 overflow-hidden">
                <button
                  onClick={() => setExpandedResearch(expandedResearch === item.id ? null : item.id)}
                  className="w-full p-4 text-left hover:bg-slate-700/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-xs rounded-full bg-cyan-500/20 text-cyan-400 capitalize">
                          {item.provider.replace('_', ' ')}
                        </span>
                        {item.model && (
                          <span className="text-xs text-slate-500">{item.model}</span>
                        )}
                      </div>
                      <h4 className="font-medium text-sm truncate">{item.seed_idea}</h4>
                      <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                        {item.target_audience && (
                          <span>Audience: {item.target_audience.substring(0, 30)}...</span>
                        )}
                        <span>{formatDate(item.created_at)}</span>
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-slate-400 transition-transform ${expandedResearch === item.id ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {expandedResearch === item.id && (
                  <div className="px-4 pb-4 border-t border-slate-700/50">
                    <div className="mt-4 space-y-4">
                      {item.themes && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-400 mb-1">Themes</h5>
                          <p className="text-sm text-slate-300">{item.themes}</p>
                        </div>
                      )}
                      {item.moral_compass && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-400 mb-1">Moral Compass</h5>
                          <p className="text-sm text-slate-300 capitalize">{item.moral_compass}</p>
                        </div>
                      )}
                      {item.content && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-400 mb-1">Research Content</h5>
                          <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3 max-h-64 overflow-y-auto whitespace-pre-wrap">
                            {item.content}
                          </div>
                        </div>
                      )}
                      {item.prompt_context && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-400 mb-1">Prompt Context (for AI agents)</h5>
                          <div className="text-sm text-slate-300 bg-slate-900/50 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-xs">
                            {item.prompt_context}
                          </div>
                        </div>
                      )}
                      {item.citations && item.citations.length > 0 && (
                        <div>
                          <h5 className="text-xs font-medium text-slate-400 mb-1">Citations ({item.citations.length})</h5>
                          <ul className="space-y-1">
                            {item.citations.map((citation, idx) => (
                              <li key={idx} className="text-xs">
                                <a
                                  href={citation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:text-cyan-300 hover:underline"
                                >
                                  {citation.title || citation.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-accent-500/20 flex items-center justify-center text-accent-400 text-sm">4</span>
          Agent Configuration
        </h2>
        <p className="text-slate-400 text-sm mb-4">
          Assign a provider and model to each agent. Different agents may benefit from different models.
        </p>

        <div className="grid gap-4">
          {AGENTS.map(agent => {
            const config = getAgentConfig(agent.id);
            const currentProvider = config?.provider || 'openai';
            const currentModel = config?.model || '';
            const availableModels = getAvailableModels(currentProvider);
            
            return (
              <div key={agent.id} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-medium capitalize">{agent.name}</h3>
                    <p className="text-xs text-slate-500">{agent.description}</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Provider</label>
                    <select
                      value={currentProvider}
                      onChange={(e) => {
                        const newProvider = e.target.value as LLMProvider;
                        const models = getAvailableModels(newProvider);
                        const defaultModel = models[0]?.id || '';
                        updateAgentConfig(agent.id, newProvider, defaultModel);
                      }}
                      className="w-full bg-slate-900/50 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
                    >
                      {PROVIDERS.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Model</label>
                    <select
                      value={currentModel}
                      onChange={(e) => updateAgentConfig(agent.id, currentProvider, e.target.value)}
                      className={`w-full bg-slate-900/50 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 ${!currentModel ? 'border-amber-500 text-slate-400' : 'border-slate-600'}`}
                    >
                      {!currentModel && (
                        <option value="" disabled>Select a model...</option>
                      )}
                      {availableModels.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} {m.contextWindow ? `(${m.contextWindow >= 1000000 ? `${m.contextWindow / 1000000}M` : `${m.contextWindow / 1000}K`})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {availableModels.find(m => m.id === currentModel)?.recommended?.includes(agent.id) && (
                  <div className="mt-2 text-xs text-green-400 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Recommended for this agent
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
