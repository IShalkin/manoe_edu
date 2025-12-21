export type LLMProvider = 'openai' | 'openrouter' | 'gemini' | 'anthropic' | 'deepseek' | 'venice';

export interface LLMModel {
  id: string;
  name: string;
  provider: LLMProvider;
  contextWindow: number;
  inputPrice: number;
  outputPrice: number;
  capabilities: string[];
  recommended?: string[];
}

export interface ProviderConfig {
  provider: LLMProvider;
  apiKey: string;
  isValid?: boolean;
}

export interface AgentConfig {
  agent: string;
  provider: LLMProvider;
  model: string;
}

export interface UserSettings {
  providers: ProviderConfig[];
  agents: AgentConfig[];
}

export type MoralCompass = 'ethical' | 'unethical' | 'amoral' | 'ambiguous' | 'user_defined';

// Output Format Types (based on Storyteller Framework Section 8.2)
export type OutputFormat = 'short_story' | 'novel_chapter' | 'screenplay' | 'novella';

export const OUTPUT_FORMAT_OPTIONS: { value: OutputFormat; label: string; desc: string; wordCount: string }[] = [
  { value: 'short_story', label: 'Short Story', desc: 'Complete narrative in condensed form', wordCount: '1,000-7,500 words' },
  { value: 'novel_chapter', label: 'Novel Chapter', desc: 'Single chapter of a larger work', wordCount: '3,000-5,000 words' },
  { value: 'novella', label: 'Novella', desc: 'Extended narrative with multiple scenes', wordCount: '17,500-40,000 words' },
  { value: 'screenplay', label: 'Screenplay', desc: 'Script format with dialogue and action', wordCount: '90-120 pages' },
];

// Reader Sensibilities/Triggers Types (based on Storyteller Framework Section 1.3)
export type ContentSensitivity = 'none' | 'mild' | 'moderate' | 'explicit';

export interface ReaderSensibilities {
  violence: ContentSensitivity;
  sexualContent: ContentSensitivity;
  profanity: ContentSensitivity;
  drugUse: ContentSensitivity;
  darkThemes: ContentSensitivity;
  triggerWarnings: string[];
}

export const CONTENT_SENSITIVITY_OPTIONS: { value: ContentSensitivity; label: string; desc: string }[] = [
  { value: 'none', label: 'None', desc: 'No content of this type' },
  { value: 'mild', label: 'Mild', desc: 'Implied or minimal' },
  { value: 'moderate', label: 'Moderate', desc: 'Present but not graphic' },
  { value: 'explicit', label: 'Explicit', desc: 'Detailed and graphic' },
];

export const DEFAULT_READER_SENSIBILITIES: ReaderSensibilities = {
  violence: 'moderate',
  sexualContent: 'mild',
  profanity: 'moderate',
  drugUse: 'mild',
  darkThemes: 'moderate',
  triggerWarnings: [],
};

// Narrator Design Types (based on Storyteller Framework Section 3.2)
export type NarrativePOV = 'first_person' | 'third_person_limited' | 'third_person_omniscient' | 'second_person';
export type NarratorReliability = 'reliable' | 'unreliable';
export type NarratorStance = 'objective' | 'judgmental' | 'sympathetic';

export interface NarratorConfig {
  pov: NarrativePOV;
  reliability: NarratorReliability;
  stance: NarratorStance;
}

export const NARRATIVE_POV_OPTIONS: { value: NarrativePOV; label: string; desc: string }[] = [
  { value: 'first_person', label: 'First Person', desc: 'I/We - intimate, limited perspective' },
  { value: 'third_person_limited', label: 'Third Person Limited', desc: 'He/She - follows one character' },
  { value: 'third_person_omniscient', label: 'Third Person Omniscient', desc: 'All-knowing narrator' },
  { value: 'second_person', label: 'Second Person', desc: 'You - immersive, experimental' },
];

export const NARRATOR_RELIABILITY_OPTIONS: { value: NarratorReliability; label: string; desc: string }[] = [
  { value: 'reliable', label: 'Reliable', desc: 'Trustworthy narrator' },
  { value: 'unreliable', label: 'Unreliable', desc: 'Biased or deceptive narrator' },
];

export const NARRATOR_STANCE_OPTIONS: { value: NarratorStance; label: string; desc: string }[] = [
  { value: 'objective', label: 'Objective', desc: 'Reports without judgment' },
  { value: 'judgmental', label: 'Judgmental', desc: 'Comments on characters/events' },
  { value: 'sympathetic', label: 'Sympathetic', desc: 'Empathizes with characters' },
];

// Narrative Possibilities Branching Types (based on Storyteller Framework Section 1.4)
export type ConflictType = 'vs_nature' | 'vs_society' | 'vs_self' | 'vs_other';
export type EstimatedTone = 'dark' | 'hopeful' | 'bittersweet' | 'intense' | 'contemplative';

export interface NarrativePossibility {
  id: number;
  title: string;
  genre_approach: string;
  plot_summary: string;
  setting_description: string;
  main_conflict: string;
  conflict_type: ConflictType;
  potential_characters: string[];
  possible_twists: string[];
  thematic_elements: string[];
  moral_compass_application: string;
  unique_appeal: string;
  estimated_tone: EstimatedTone;
}

export interface NarrativePossibilitiesRecommendation {
  preferred_id: number;
  rationale: string;
}

export interface NarrativePossibilitiesResult {
  narrative_possibilities: NarrativePossibility[];
  recommendation: NarrativePossibilitiesRecommendation;
}

export interface Project {
  id: string;
  name: string;
  seedIdea: string;
  moralCompass: MoralCompass;
  targetAudience: string;
  themes: string[];
  outputFormat?: OutputFormat;
  readerSensibilities?: ReaderSensibilities;
  status: 'draft' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  archetype: string;
  coreMotivation: string;
  innerTrap: string;
  copingMechanism: string;
  visualSignature: string;
}

export type RelationshipType = 'ally' | 'enemy' | 'rival' | 'mentor' | 'protege' | 'lover' | 'family' | 'neutral' | 'complex';

export interface CharacterRelationship {
  id: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  relationshipType: RelationshipType;
  description: string;
  dynamics: string;
  tension: number;
}

export const RELATIONSHIP_TYPE_OPTIONS: { value: RelationshipType; label: string; color: string }[] = [
  { value: 'ally', label: 'Ally', color: '#22c55e' },
  { value: 'enemy', label: 'Enemy', color: '#ef4444' },
  { value: 'rival', label: 'Rival', color: '#f97316' },
  { value: 'mentor', label: 'Mentor', color: '#3b82f6' },
  { value: 'protege', label: 'Protege', color: '#8b5cf6' },
  { value: 'lover', label: 'Lover', color: '#ec4899' },
  { value: 'family', label: 'Family', color: '#14b8a6' },
  { value: 'neutral', label: 'Neutral', color: '#6b7280' },
  { value: 'complex', label: 'Complex', color: '#eab308' },
];

export const PROVIDERS: { id: LLMProvider; name: string; icon: string }[] = [
  { id: 'openai', name: 'OpenAI', icon: 'O' },
  { id: 'openrouter', name: 'OpenRouter', icon: 'R' },
  { id: 'gemini', name: 'Google Gemini', icon: 'G' },
  { id: 'anthropic', name: 'Anthropic Claude', icon: 'A' },
  { id: 'deepseek', name: 'DeepSeek', icon: 'D' },
  { id: 'venice', name: 'Venice AI', icon: 'V' },
];

export type ResearchProvider = 'openai_deep_research' | 'perplexity';

export interface ResearchProviderConfig {
  provider: ResearchProvider;
  apiKey: string;
}

export const RESEARCH_PROVIDERS: { id: ResearchProvider; name: string; icon: string; description: string; keyPrefix: string }[] = [
  { id: 'perplexity', name: 'Perplexity', icon: 'P', description: 'Sonar Deep Research - exhaustive web research', keyPrefix: 'pplx-...' },
  { id: 'openai_deep_research', name: 'OpenAI Deep Research', icon: 'O', description: 'o3/o4-mini Deep Research models', keyPrefix: 'sk-...' },
];

export interface ResearchResult {
  success: boolean;
  provider?: string;
  model?: string;
  content?: string;
  citations?: Array<{ url: string; title?: string }>;
  searchResults?: Array<{ title: string; url: string; snippet?: string }>;
  webSearches?: Array<{ action: string; query: string }>;
  usage?: Record<string, number>;
  error?: string;
}

export const AGENTS = [
  { id: 'architect', name: 'Architect', description: 'Designs narrative structure and plot' },
  { id: 'profiler', name: 'Profiler', description: 'Creates deep character profiles' },
  { id: 'strategist', name: 'Strategist', description: 'Plans scene-by-scene outlines' },
  { id: 'writer', name: 'Writer', description: 'Drafts scenes with sensory details' },
  { id: 'critic', name: 'Critic', description: 'Reviews and provides feedback' },
];

// Model tiers for recommended models display
export type ModelTier = 'S+' | 'A+' | 'A' | 'B';

export interface RecommendedModel {
  id: string;
  name: string;
  tier: ModelTier;
  tierCategory: string;
  provider: LLMProvider;
  bestFor: string;
  verdict: string;
}

// Top recommended models (December 2025)
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: 'gemini-3-pro',
    name: 'Gemini 3 Pro',
    tier: 'S+',
    tierCategory: 'Logic',
    provider: 'gemini',
    bestFor: 'Complex plot logic',
    verdict: 'New king of AI. Google finally surpassed everyone. Deep Think integrated into core. Builds dynamic world model of your plot.',
  },
  {
    id: 'claude-opus-4.5-20251124',
    name: 'Claude Opus 4.5',
    tier: 'S+',
    tierCategory: 'Prose',
    provider: 'anthropic',
    bestFor: 'Living prose, RP',
    verdict: 'Most human-like AI. Talented writer. Best for RP and literature. Many prefer it for style over technically stronger models.',
  },
  {
    id: 'dolphin-mistral-24b-venice',
    name: 'Dolphin Mistral 24B Venice',
    tier: 'S+',
    tierCategory: 'Uncensored',
    provider: 'venice',
    bestFor: 'Dark plots, roleplay',
    verdict: 'Best uncensored model for creativity. No moralizing. Perfect for dark plots and political intrigue.',
  },
  {
    id: 'llama-4-maverick-venice',
    name: 'Llama 4 Maverick (Venice)',
    tier: 'A+',
    tierCategory: 'Context',
    provider: 'venice',
    bestFor: '256k context',
    verdict: '256k context with Venice jailbreak. 3x fewer refusals. Technically smarter than Dolphin.',
  },
  {
    id: 'gpt-5.2',
    name: 'GPT-5.2',
    tier: 'A',
    tierCategory: 'Fast Logic',
    provider: 'openai',
    bestFor: 'Fast logic',
    verdict: 'Improved routing (decides when to think deep vs fast). Less moralistic than 5.0.',
  },
];

export const MODELS: Record<LLMProvider, LLMModel[]> = {
  openai: [
    // GPT-5 (Latest - December 2025)
    { id: 'gpt-5.2', name: 'GPT-5.2 (A Tier)', provider: 'openai', contextWindow: 256000, inputPrice: 5, outputPrice: 20, capabilities: ['vision', 'function_calling', 'reasoning'], recommended: ['architect', 'strategist'] },
    { id: 'gpt-5', name: 'GPT-5', provider: 'openai', contextWindow: 256000, inputPrice: 4, outputPrice: 16, capabilities: ['vision', 'function_calling', 'reasoning'] },
    // GPT-4o Family
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', contextWindow: 128000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'function_calling'], recommended: ['critic'] },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', contextWindow: 128000, inputPrice: 0.15, outputPrice: 0.6, capabilities: ['vision', 'function_calling'], recommended: ['writer'] },
    // O-series Reasoning
    { id: 'o3', name: 'O3', provider: 'openai', contextWindow: 200000, inputPrice: 10, outputPrice: 40, capabilities: ['reasoning'], recommended: ['strategist'] },
    { id: 'o3-mini', name: 'O3 Mini', provider: 'openai', contextWindow: 200000, inputPrice: 1.1, outputPrice: 4.4, capabilities: ['reasoning'] },
    { id: 'o1', name: 'O1', provider: 'openai', contextWindow: 200000, inputPrice: 15, outputPrice: 60, capabilities: ['reasoning'] },
  ],
  openrouter: [
    // Top Tier - Claude Opus 4.5 (S+ Prose)
    { id: 'anthropic/claude-opus-4.5', name: 'Claude Opus 4.5 (S+ Prose)', provider: 'openrouter', contextWindow: 200000, inputPrice: 20, outputPrice: 100, capabilities: ['vision', 'prose'], recommended: ['architect', 'writer', 'critic'] },
    // Gemini 3 Pro (S+ Logic)
    { id: 'google/gemini-3-pro', name: 'Gemini 3 Pro (S+ Logic)', provider: 'openrouter', contextWindow: 2000000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'reasoning'], recommended: ['strategist'] },
    // Llama 4 Maverick (A+ Context - 256k)
    { id: 'meta-llama/llama-4-maverick', name: 'Llama 4 Maverick (A+ Context)', provider: 'openrouter', contextWindow: 256000, inputPrice: 0.5, outputPrice: 1.5, capabilities: ['long_context'], recommended: ['profiler', 'strategist'] },
    // Claude 3.5 Sonnet
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision'], recommended: ['architect', 'critic'] },
    // Gemini 2.0
    { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash', provider: 'openrouter', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['vision', 'grounding'] },
    // Llama 3.3
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', provider: 'openrouter', contextWindow: 131072, inputPrice: 0.12, outputPrice: 0.3, capabilities: [] },
    // DeepSeek
    { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'openrouter', contextWindow: 64000, inputPrice: 0.14, outputPrice: 0.28, capabilities: [] },
    // Qwen
    { id: 'qwen/qwen-2.5-72b-instruct', name: 'Qwen 2.5 72B', provider: 'openrouter', contextWindow: 131072, inputPrice: 0.35, outputPrice: 0.4, capabilities: [] },
  ],
  gemini: [
    // Gemini 3 (Latest - S+ Logic)
    { id: 'gemini-3-pro', name: 'Gemini 3 Pro (S+ Logic)', provider: 'gemini', contextWindow: 2000000, inputPrice: 2.5, outputPrice: 10, capabilities: ['vision', 'reasoning'], recommended: ['architect', 'strategist'] },
    { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'gemini', contextWindow: 1000000, inputPrice: 0.5, outputPrice: 2, capabilities: ['vision'], recommended: ['writer'] },
    // Gemini 2.0
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash Exp', provider: 'gemini', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['vision', 'grounding', 'code_execution'] },
    { id: 'gemini-2.0-flash-thinking-exp', name: 'Gemini 2.0 Flash Thinking', provider: 'gemini', contextWindow: 1000000, inputPrice: 0, outputPrice: 0, capabilities: ['reasoning'], recommended: ['critic'] },
    // Gemini 1.5
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', contextWindow: 2000000, inputPrice: 1.25, outputPrice: 5, capabilities: ['vision'] },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', contextWindow: 1000000, inputPrice: 0.075, outputPrice: 0.3, capabilities: ['vision'] },
  ],
  anthropic: [
    // Claude Opus 4.5 (S+ Prose - Best for living prose)
    { id: 'claude-opus-4.5-20251124', name: 'Claude Opus 4.5 (S+ Prose)', provider: 'anthropic', contextWindow: 200000, inputPrice: 20, outputPrice: 100, capabilities: ['vision', 'prose'], recommended: ['architect', 'writer', 'critic'] },
    // Claude 4 models
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision', 'computer_use'], recommended: ['profiler'] },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic', contextWindow: 200000, inputPrice: 15, outputPrice: 75, capabilities: ['vision', 'computer_use'], recommended: ['strategist'] },
    // Claude 3.5 models
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic', contextWindow: 200000, inputPrice: 3, outputPrice: 15, capabilities: ['vision', 'computer_use'] },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic', contextWindow: 200000, inputPrice: 0.8, outputPrice: 4, capabilities: ['vision'] },
  ],
  deepseek: [
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'deepseek', contextWindow: 64000, inputPrice: 0.14, outputPrice: 0.28, capabilities: ['function_calling'], recommended: ['writer', 'profiler'] },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'deepseek', contextWindow: 64000, inputPrice: 0.55, outputPrice: 2.19, capabilities: ['reasoning'], recommended: ['architect', 'strategist', 'critic'] },
  ],
  venice: [
    // S+ Uncensored - Best for dialogues, roleplay, dark plots without censorship
    { id: 'dolphin-mistral-24b-venice', name: 'Dolphin Mistral 24B Venice (S+ Uncensored)', provider: 'venice', contextWindow: 32000, inputPrice: 0.5, outputPrice: 1.5, capabilities: ['uncensored', 'roleplay'], recommended: ['writer', 'profiler'] },
    // Venice Large (Llama 4 Maverick)
    { id: 'llama-4-maverick-venice', name: 'Llama 4 Maverick Venice (A+ Context)', provider: 'venice', contextWindow: 256000, inputPrice: 0.8, outputPrice: 2.4, capabilities: ['long_context', 'uncensored'], recommended: ['architect', 'strategist'] },
    // Qwen 3 (Venice Medium/Large alternative - good for Eastern intrigue)
    { id: 'qwen-3-235b-venice', name: 'Qwen 3 235B Venice', provider: 'venice', contextWindow: 131072, inputPrice: 0.4, outputPrice: 1.2, capabilities: ['uncensored'], recommended: ['writer', 'profiler'] },
    // Other Venice models
    { id: 'llama-3.3-70b-venice', name: 'Llama 3.3 70B Venice', provider: 'venice', contextWindow: 131072, inputPrice: 0.3, outputPrice: 0.9, capabilities: ['uncensored'] },
    { id: 'mistral-large-venice', name: 'Mistral Large Venice', provider: 'venice', contextWindow: 128000, inputPrice: 0.4, outputPrice: 1.2, capabilities: ['uncensored'] },
  ],
};
