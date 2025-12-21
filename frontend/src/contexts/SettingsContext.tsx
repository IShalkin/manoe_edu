import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserSettings, ProviderConfig, AgentConfig, LLMProvider, AGENTS, MODELS, LLMModel, ResearchProvider, ResearchProviderConfig } from '../types';
import { orchestratorFetch } from '../lib/api';
import { encryptData, decryptData, isEncrypted } from '../lib/crypto';

const STORAGE_KEY = 'manoe_settings';
const MODELS_CACHE_KEY = 'manoe_models_cache';
const RESEARCH_KEYS_STORAGE_KEY = 'manoe_research_keys';
const SETTINGS_VERSION = 4;

const OLD_DEFAULT_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];

async function encryptApiKeys(providers: ProviderConfig[]): Promise<ProviderConfig[]> {
  const encrypted: ProviderConfig[] = [];
  for (const provider of providers) {
    if (provider.apiKey && !isEncrypted(provider.apiKey)) {
      try {
        const encryptedKey = await encryptData(provider.apiKey);
        encrypted.push({ ...provider, apiKey: encryptedKey });
      } catch (e) {
        console.error('[SettingsContext] Failed to encrypt API key:', e);
        encrypted.push(provider);
      }
    } else {
      encrypted.push(provider);
    }
  }
  return encrypted;
}

async function decryptApiKeys(providers: ProviderConfig[]): Promise<ProviderConfig[]> {
  const decrypted: ProviderConfig[] = [];
  for (const provider of providers) {
    if (provider.apiKey && isEncrypted(provider.apiKey)) {
      try {
        const decryptedKey = await decryptData(provider.apiKey);
        decrypted.push({ ...provider, apiKey: decryptedKey });
      } catch (e) {
        console.error('[SettingsContext] Failed to decrypt API key, clearing:', e);
        decrypted.push({ ...provider, apiKey: '' });
      }
    } else {
      decrypted.push(provider);
    }
  }
  return decrypted;
}

async function encryptResearchKeys(providers: ResearchProviderConfig[]): Promise<ResearchProviderConfig[]> {
  const encrypted: ResearchProviderConfig[] = [];
  for (const provider of providers) {
    if (provider.apiKey && !isEncrypted(provider.apiKey)) {
      try {
        const encryptedKey = await encryptData(provider.apiKey);
        encrypted.push({ ...provider, apiKey: encryptedKey });
      } catch (e) {
        console.error('[SettingsContext] Failed to encrypt research API key:', e);
        encrypted.push(provider);
      }
    } else {
      encrypted.push(provider);
    }
  }
  return encrypted;
}

async function decryptResearchKeys(providers: ResearchProviderConfig[]): Promise<ResearchProviderConfig[]> {
  const decrypted: ResearchProviderConfig[] = [];
  for (const provider of providers) {
    if (provider.apiKey && isEncrypted(provider.apiKey)) {
      try {
        const decryptedKey = await decryptData(provider.apiKey);
        decrypted.push({ ...provider, apiKey: decryptedKey });
      } catch (e) {
        console.error('[SettingsContext] Failed to decrypt research API key, clearing:', e);
        decrypted.push({ ...provider, apiKey: '' });
      }
    } else {
      decrypted.push(provider);
    }
  }
  return decrypted;
}

function migrateSettings(parsed: UserSettings & { schemaVersion?: number }): UserSettings & { schemaVersion: number } {
  const currentVersion = parsed.schemaVersion || 1;
  
  if (currentVersion < 3) {
    parsed.agents = parsed.agents.map(agent => ({
      ...agent,
      model: OLD_DEFAULT_MODELS.includes(agent.model) ? '' : agent.model,
    }));
    
    localStorage.removeItem(MODELS_CACHE_KEY);
  }
  
  return { ...parsed, schemaVersion: SETTINGS_VERSION };
}

interface DynamicModel {
  id: string;
  name: string;
  context_length?: number;
  description?: string;
}

interface ModelsCache {
  [provider: string]: {
    models: DynamicModel[];
    timestamp: number;
  };
}

const defaultAgentConfigs: AgentConfig[] = AGENTS.map(agent => ({
  agent: agent.id,
  provider: 'openai' as LLMProvider,
  model: '',
}));

interface SettingsContextType {
  settings: UserSettings;
  loading: boolean;
  updateProvider: (provider: LLMProvider, apiKey: string) => void;
  updateAgentConfig: (agentId: string, provider: LLMProvider, model: string) => void;
  getProviderKey: (provider: LLMProvider) => string | undefined;
  getAgentConfig: (agentId: string) => AgentConfig | undefined;
  hasAnyApiKey: () => boolean;
  getAvailableModels: (provider: LLMProvider) => LLMModel[];
  fetchModelsForProvider: (provider: LLMProvider) => Promise<{ success: boolean; error?: string }>;
  isLoadingModels: (provider: LLMProvider) => boolean;
  hasDynamicModels: (provider: LLMProvider) => boolean;
  researchProviders: ResearchProviderConfig[];
  updateResearchProvider: (provider: ResearchProvider, apiKey: string) => void;
  getResearchProviderKey: (provider: ResearchProvider) => string | undefined;
}

const SettingsContext = createContext<SettingsContextType | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>({
    providers: [],
    agents: defaultAgentConfigs,
  });
  const [loading, setLoading] = useState(true);
  const [dynamicModels, setDynamicModels] = useState<ModelsCache>({});
  const [loadingModels, setLoadingModels] = useState<Record<string, boolean>>({});
  const [researchProviders, setResearchProviders] = useState<ResearchProviderConfig[]>([]);

  // Load settings from localStorage on mount (with decryption)
  useEffect(() => {
    const loadSettings = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      console.log('[SettingsContext] Loading settings from localStorage:', stored ? 'found' : 'empty');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const migrated = migrateSettings(parsed);
          
          // Decrypt API keys if they are encrypted
          if (migrated.providers && migrated.providers.length > 0) {
            migrated.providers = await decryptApiKeys(migrated.providers);
          }
          
          setSettings(migrated);
          console.log('[SettingsContext] Loaded providers:', migrated.providers?.length || 0);
        } catch (e) {
          console.error('[SettingsContext] Failed to parse settings:', e);
        }
      }
      
      // Load models cache (not encrypted - no sensitive data)
      const cachedModels = localStorage.getItem(MODELS_CACHE_KEY);
      if (cachedModels) {
        try {
          setDynamicModels(JSON.parse(cachedModels));
        } catch (e) {
          console.error('[SettingsContext] Failed to parse models cache:', e);
        }
      }
      
      // Load research provider keys (with decryption)
      const storedResearchKeys = localStorage.getItem(RESEARCH_KEYS_STORAGE_KEY);
      if (storedResearchKeys) {
        try {
          let researchKeys = JSON.parse(storedResearchKeys);
          researchKeys = await decryptResearchKeys(researchKeys);
          setResearchProviders(researchKeys);
          console.log('[SettingsContext] Loaded research providers');
        } catch (e) {
          console.error('[SettingsContext] Failed to parse research keys:', e);
        }
      }
      
      setLoading(false);
    };
    
    loadSettings();
  }, []);

  // Persist settings to localStorage whenever they change (with encryption)
  useEffect(() => {
    const saveSettings = async () => {
      if (!loading) {
        // Encrypt API keys before storing
        const settingsToStore = { ...settings };
        if (settingsToStore.providers && settingsToStore.providers.length > 0) {
          settingsToStore.providers = await encryptApiKeys(settingsToStore.providers);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsToStore));
        console.log('[SettingsContext] Saved settings to localStorage (encrypted)');
      }
    };
    
    saveSettings();
  }, [settings, loading]);

  const updateProvider = useCallback((provider: LLMProvider, apiKey: string) => {
    setSettings(prev => {
      const existing = prev.providers.find(p => p.provider === provider);
      let newProviders: ProviderConfig[];
      
      if (existing) {
        newProviders = prev.providers.map(p => 
          p.provider === provider ? { ...p, apiKey, isValid: undefined } : p
        );
      } else {
        newProviders = [...prev.providers, { provider, apiKey }];
      }
      
      console.log('[SettingsContext] Updated provider:', provider, 'key length:', apiKey.length);
      return { ...prev, providers: newProviders };
    });
  }, []);

  const updateAgentConfig = useCallback((agentId: string, provider: LLMProvider, model: string) => {
    setSettings(prev => {
      const newAgents = prev.agents.map(a =>
        a.agent === agentId ? { ...a, provider, model } : a
      );
      return { ...prev, agents: newAgents };
    });
  }, []);

  const getProviderKey = useCallback((provider: LLMProvider): string | undefined => {
    return settings.providers.find(p => p.provider === provider)?.apiKey;
  }, [settings.providers]);

  const getAgentConfig = useCallback((agentId: string): AgentConfig | undefined => {
    return settings.agents.find(a => a.agent === agentId);
  }, [settings.agents]);

  const hasAnyApiKey = useCallback((): boolean => {
    return settings.providers.some(p => p.apiKey && p.apiKey.length > 0);
  }, [settings.providers]);

  const getAvailableModels = useCallback((provider: LLMProvider): LLMModel[] => {
    // If we have dynamic models for this provider, use them
    const cached = dynamicModels[provider];
    if (cached && cached.models.length > 0) {
      return cached.models.map(m => ({
        id: m.id,
        name: m.name,
        provider,
        contextWindow: m.context_length || 128000,
        inputPrice: 0,
        outputPrice: 0,
        capabilities: [],
        description: m.description,
      }));
    }
    // Fall back to static models
    return MODELS[provider] || [];
  }, [dynamicModels]);

  const fetchModelsForProvider = useCallback(async (provider: LLMProvider): Promise<{ success: boolean; error?: string }> => {
    const apiKey = settings.providers.find(p => p.provider === provider)?.apiKey;
    if (!apiKey) {
      return { success: false, error: 'No API key configured for this provider' };
    }

    setLoadingModels(prev => ({ ...prev, [provider]: true }));

    try {
      // Use orchestrator API for dynamic model loading with JWT auth
      const response = await orchestratorFetch('/models', {
        method: 'POST',
        body: JSON.stringify({ provider, api_key: apiKey }),
      });

      const data = await response.json();

      if (data.success && data.models) {
        const newCache = {
          ...dynamicModels,
          [provider]: {
            models: data.models,
            timestamp: Date.now(),
          },
        };
        setDynamicModels(newCache);
        localStorage.setItem(MODELS_CACHE_KEY, JSON.stringify(newCache));
        return { success: true };
      } else {
        return { success: false, error: data.error || 'Failed to fetch models' };
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Network error' };
    } finally {
      setLoadingModels(prev => ({ ...prev, [provider]: false }));
    }
  }, [dynamicModels, settings.providers]);

  const isLoadingModels = useCallback((provider: LLMProvider): boolean => {
    return loadingModels[provider] || false;
  }, [loadingModels]);

  const hasDynamicModels = useCallback((provider: LLMProvider): boolean => {
    return !!dynamicModels[provider]?.models?.length;
  }, [dynamicModels]);

  const updateResearchProvider = useCallback((provider: ResearchProvider, apiKey: string) => {
    setResearchProviders(prev => {
      const existing = prev.find(p => p.provider === provider);
      let newProviders: ResearchProviderConfig[];
      
      if (existing) {
        newProviders = prev.map(p => 
          p.provider === provider ? { ...p, apiKey } : p
        );
      } else {
        newProviders = [...prev, { provider, apiKey }];
      }
      
      // Encrypt research keys before storing
      encryptResearchKeys(newProviders).then(encrypted => {
        localStorage.setItem(RESEARCH_KEYS_STORAGE_KEY, JSON.stringify(encrypted));
        console.log('[SettingsContext] Updated research provider (encrypted):', provider, 'key length:', apiKey.length);
      }).catch(e => {
        console.error('[SettingsContext] Failed to encrypt research keys:', e);
        localStorage.setItem(RESEARCH_KEYS_STORAGE_KEY, JSON.stringify(newProviders));
      });
      
      return newProviders;
    });
  }, []);

  const getResearchProviderKey = useCallback((provider: ResearchProvider): string | undefined => {
    return researchProviders.find(p => p.provider === provider)?.apiKey;
  }, [researchProviders]);

  return (
    <SettingsContext.Provider value={{
      settings,
      loading,
      updateProvider,
      updateAgentConfig,
      getProviderKey,
      getAgentConfig,
      hasAnyApiKey,
      getAvailableModels,
      fetchModelsForProvider,
      isLoadingModels,
      hasDynamicModels,
      researchProviders,
      updateResearchProvider,
      getResearchProviderKey,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
