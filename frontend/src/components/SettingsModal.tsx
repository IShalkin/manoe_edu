import { useState } from 'react';
import { useSettings } from '../hooks/useSettings';
import { PROVIDERS, AGENTS, LLMProvider, RESEARCH_PROVIDERS } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
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
  const [activeTab, setActiveTab] = useState<'api-keys' | 'research' | 'agents'>('api-keys');

  const toggleShowKey = (provider: string) => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden border border-slate-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Profile & Settings</h2>
              <p className="text-xs text-slate-400">Configure your API keys and agent models</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-slate-700 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'api-keys'
                ? 'text-primary-400 border-b-2 border-primary-400 bg-primary-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            LLM Keys
          </button>
          <button
            onClick={() => setActiveTab('research')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'research'
                ? 'text-primary-400 border-b-2 border-primary-400 bg-primary-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Research
          </button>
          <button
            onClick={() => setActiveTab('agents')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'agents'
                ? 'text-primary-400 border-b-2 border-primary-400 bg-primary-500/10'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Agents
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'api-keys' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-4">
                Enter your API keys for the providers you want to use. Keys are stored locally in your browser.
              </p>
              
              {PROVIDERS.map(provider => {
                const currentKey = getProviderKey(provider.id) || '';
                const isVisible = showKeys[provider.id];
                
                return (
                  <div key={provider.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
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
                            {provider.id === 'deepseek' && 'sk-...'}
                            {provider.id === 'venice' && 'vvv-...'}
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
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
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
                          {isLoadingModels(provider.id) ? 'Loading...' : hasDynamicModels(provider.id) ? 'Refresh' : 'Load Models'}
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
          )}

          {activeTab === 'research' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-4">
                Configure research providers for deep market research on your target audience. Keys are stored locally in your browser.
              </p>
              
              {RESEARCH_PROVIDERS.map(provider => {
                const currentKey = getResearchProviderKey(provider.id) || '';
                const isVisible = showKeys[`research_${provider.id}`];
                
                return (
                  <div key={provider.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
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
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-primary-500 transition-colors"
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
              
              <div className="mt-4 p-4 bg-slate-900/30 rounded-xl border border-slate-700/50">
                <h4 className="text-sm font-medium text-slate-300 mb-2">About Research Providers</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Research providers enable deep market analysis for your storytelling projects. Perplexity uses web search to gather current market data, while OpenAI Deep Research provides comprehensive analysis using advanced reasoning models. Configure at least one provider to enable the research feature when creating projects.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'agents' && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-4">
                Assign a provider and model to each agent. Different agents may benefit from different models.
              </p>

              {AGENTS.map(agent => {
                const config = getAgentConfig(agent.id);
                const currentProvider = config?.provider || 'openai';
                const currentModel = config?.model || '';
                const availableModels = getAvailableModels(currentProvider);
                
                return (
                  <div key={agent.id} className="bg-slate-900/50 rounded-xl p-4 border border-slate-700">
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
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500"
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
                          className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-500 ${!currentModel ? 'border-amber-500 text-slate-400' : 'border-slate-600'}`}
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
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 bg-slate-800/50">
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-500 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
