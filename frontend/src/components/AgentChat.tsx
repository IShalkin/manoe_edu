import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import type { ProjectResult } from '../hooks/useProjects';
import { orchestratorFetch, getAuthenticatedSSEUrl } from '../lib/api';
import type { NarrativePossibility, NarrativePossibilitiesRecommendation } from '../types';
import { NarrativePossibilitiesSelector } from './NarrativePossibilitiesSelector';

// Maximum input length for JSON parsing to prevent ReDoS attacks
const MAX_JSON_INPUT_LENGTH = 1_000_000; // 1MB limit

// Tolerant JSON parser that handles common LLM output issues
// Security: Input length is limited to prevent ReDoS attacks
function tolerantJsonParse(str: string): unknown | null {
  // Security: Reject excessively long inputs to prevent ReDoS
  if (!str || str.length > MAX_JSON_INPUT_LENGTH) {
    console.warn('[tolerantJsonParse] Input rejected: empty or exceeds max length');
    return null;
  }
  
  const trimmed = str.trim();
  
  // Try standard JSON.parse first (fastest path)
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue to tolerant parsing
  }
  
  // Try to fix common issues
  let fixed = trimmed;
  
  // Remove trailing commas before } or ]
  // Note: This regex is safe - linear time complexity
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
  
  // Replace Python-style booleans and None
  // Note: These regexes are safe - word boundary matching is O(n)
  fixed = fixed.replace(/\bTrue\b/g, 'true');
  fixed = fixed.replace(/\bFalse\b/g, 'false');
  fixed = fixed.replace(/\bNone\b/g, 'null');
  
  // Replace single quotes with double quotes (careful with apostrophes)
  // Only do this if there are no double quotes in the string
  if (!fixed.includes('"') && fixed.includes("'")) {
    fixed = fixed.replace(/'/g, '"');
  }
  
  try {
    return JSON.parse(fixed);
  } catch {
    // Continue
  }
  
  // Try to extract JSON from the string
  // Note: This regex could be slow on pathological inputs, but we've limited input size
  const jsonMatch = fixed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      // Try with fixes on extracted JSON
      let extracted = jsonMatch[0];
      extracted = extracted.replace(/,(\s*[}\]])/g, '$1');
      extracted = extracted.replace(/\bTrue\b/g, 'true');
      extracted = extracted.replace(/\bFalse\b/g, 'false');
      extracted = extracted.replace(/\bNone\b/g, 'null');
      try {
        return JSON.parse(extracted);
      } catch {
        // Give up
      }
    }
  }
  
  return null;
}

function formatAnyAsMarkdown(parsed: unknown): string {
  if (parsed === null || parsed === undefined) {
    return '';
  }
  if (typeof parsed === 'string') {
    // Check if the string itself is JSON (double-encoded)
    const trimmed = parsed.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const innerParsed = JSON.parse(trimmed);
        return formatAnyAsMarkdown(innerParsed);
      } catch {
        return parsed;
      }
    }
    return parsed;
  }
  if (typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed);
  }
  if (Array.isArray(parsed)) {
    return parsed.map((item, i) => {
      if (typeof item === 'object' && item !== null) {
        return `${i + 1}. ${formatObjectInline(item as Record<string, unknown>)}`;
      }
      return `${i + 1}. ${item}`;
    }).join('\n');
  }
  if (typeof parsed === 'object') {
    return formatJsonAsMarkdown(parsed as Record<string, unknown>);
  }
  return String(parsed);
}

// Extract clean story text from agent content (Polish or Writer)
function extractStoryText(content: string, agentType: 'Polish' | 'Writer' | 'other'): string {
  if (!content || typeof content !== 'string') {
    return '';
  }

  const trimmed = content.trim();
  
  // Try to parse as JSON first
  let parsed: unknown = null;
  
  // Check for ```json code blocks
  if (trimmed.includes('```json')) {
    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = tolerantJsonParse(jsonMatch[1]);
    }
  }
  
  // Try direct JSON parse
  if (parsed === null) {
    parsed = tolerantJsonParse(trimmed);
  }
  
  // Try to extract JSON from string
  if (parsed === null && (trimmed.includes('{') || trimmed.includes('['))) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      parsed = tolerantJsonParse(extracted);
    }
  }
  
  // If we have a parsed object, extract the story text
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    
    // For Polish agent, prefer polished_content
    if (agentType === 'Polish') {
      if (typeof obj.polished_content === 'string' && obj.polished_content.trim()) {
        return obj.polished_content;
      }
      // Fallback fields for Polish
      if (typeof obj.content === 'string' && obj.content.trim()) {
        return obj.content;
      }
    }
    
    // For Writer agent, prefer narrative_content
    if (agentType === 'Writer') {
      if (typeof obj.narrative_content === 'string' && obj.narrative_content.trim()) {
        return obj.narrative_content;
      }
      if (typeof obj.scene_content === 'string' && obj.scene_content.trim()) {
        return obj.scene_content;
      }
      if (typeof obj.content === 'string' && obj.content.trim()) {
        return obj.content;
      }
    }
    
    // Generic fallbacks for any agent
    if (typeof obj.polished_content === 'string' && obj.polished_content.trim()) {
      return obj.polished_content;
    }
    if (typeof obj.narrative_content === 'string' && obj.narrative_content.trim()) {
      return obj.narrative_content;
    }
    if (typeof obj.scene_content === 'string' && obj.scene_content.trim()) {
      return obj.scene_content;
    }
    if (typeof obj.content === 'string' && obj.content.trim()) {
      return obj.content;
    }
  }
  
  // If content doesn't look like JSON, return as-is (might be plain text)
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.includes('```json')) {
    return trimmed;
  }
  
  // Last resort: return the formatted content (will show JSON as markdown)
  return '';
}

function extractJsonFromString(content: string): string | null {
  // Try to find balanced JSON object or array
  const trimmed = content.trim();
  let startChar = '';
  let endChar = '';
  let startIdx = -1;
  
  // Find the first { or [
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '{') {
      startChar = '{';
      endChar = '}';
      startIdx = i;
      break;
    } else if (trimmed[i] === '[') {
      startChar = '[';
      endChar = ']';
      startIdx = i;
      break;
    }
  }
  
  if (startIdx === -1) return null;
  
  // Count brackets to find balanced end
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  
  for (let i = startIdx; i < trimmed.length; i++) {
    const char = trimmed[i];
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    
    if (!inString) {
      if (char === startChar) depth++;
      else if (char === endChar) {
        depth--;
        if (depth === 0) {
          return trimmed.substring(startIdx, i + 1);
        }
      }
    }
  }
  
  return null; // Incomplete JSON
}

function formatAgentContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  const trimmed = content.trim();
  
  // Check for ```json code blocks first
  if (content.includes('```json') || content.includes('```')) {
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const blockParsed = tolerantJsonParse(jsonMatch[1]);
      if (blockParsed !== null) {
        return formatAnyAsMarkdown(blockParsed);
      }
    }
  }
  
  // Try tolerant JSON parse (handles common LLM issues)
  const parsed = tolerantJsonParse(trimmed);
  if (parsed !== null && typeof parsed === 'object') {
    return formatAnyAsMarkdown(parsed);
  }
  
  // Try to extract JSON from string (handles prefix/suffix text)
  if (trimmed.includes('{') || trimmed.includes('[')) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      const extractedParsed = tolerantJsonParse(extracted);
      if (extractedParsed !== null && typeof extractedParsed === 'object') {
        return formatAnyAsMarkdown(extractedParsed);
      }
    }
  }
  
  // Return original content if nothing worked
  return content;
}

// Strategist-specific formatter for outline data
function formatStrategistContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  const trimmed = content.trim();
  let parsed: unknown = null;
  
  // Try to parse JSON
  if (trimmed.includes('```json')) {
    const jsonMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      parsed = tolerantJsonParse(jsonMatch[1]);
    }
  }
  if (parsed === null) {
    parsed = tolerantJsonParse(trimmed);
  }
  if (parsed === null && trimmed.includes('{')) {
    const extracted = extractJsonFromString(trimmed);
    if (extracted) {
      parsed = tolerantJsonParse(extracted);
    }
  }
  
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return formatAgentContent(content);
  }
  
  const obj = parsed as Record<string, unknown>;
  const lines: string[] = [];
  
  // Structure overview
  if (obj.structure_type) {
    const structureNames: Record<string, string> = {
      'ThreeAct': 'Three Act Structure',
      'HeroJourney': "Hero's Journey",
      'FiveAct': 'Five Act Structure',
      'SevenPoint': 'Seven Point Story Structure',
      'SaveTheCat': 'Save the Cat Beat Sheet',
    };
    lines.push(`**Structure:** ${structureNames[obj.structure_type as string] || obj.structure_type}`);
  }
  
  if (obj.total_scenes) {
    lines.push(`**Total Scenes:** ${obj.total_scenes}`);
  }
  
  // Key structural points
  const keyPoints: string[] = [];
  if (obj.inciting_incident_scene) keyPoints.push(`Inciting Incident: Scene ${obj.inciting_incident_scene}`);
  if (obj.midpoint_scene) keyPoints.push(`Midpoint: Scene ${obj.midpoint_scene}`);
  if (obj.climax_scene) keyPoints.push(`Climax: Scene ${obj.climax_scene}`);
  if (obj.resolution_scene) keyPoints.push(`Resolution: Scene ${obj.resolution_scene}`);
  
  if (keyPoints.length > 0) {
    lines.push('');
    lines.push('**Key Story Beats:**');
    keyPoints.forEach(point => lines.push(`- ${point}`));
  }
  
  // Scenes summary (compact view)
  if (Array.isArray(obj.scenes) && obj.scenes.length > 0) {
    lines.push('');
    lines.push('**Scene Outline:**');
    const scenesToShow = obj.scenes.slice(0, 10) as Array<Record<string, unknown>>;
    scenesToShow.forEach((scene, idx) => {
      const sceneNum = scene.scene_number || idx + 1;
      const title = scene.title || `Scene ${sceneNum}`;
      const conflict = scene.conflict_type ? ` (${scene.conflict_type})` : '';
      lines.push(`${sceneNum}. **${title}**${conflict}`);
      if (scene.setting && typeof scene.setting === 'string' && scene.setting.length < 80) {
        lines.push(`   *${scene.setting}*`);
      }
    });
    if (obj.scenes.length > 10) {
      lines.push(`... and ${obj.scenes.length - 10} more scenes`);
    }
  }
  
  // Demo mode fields (opening_hook, turning_points, etc.)
  if (obj.opening_hook) {
    lines.push('');
    lines.push(`**Opening Hook:** ${obj.opening_hook}`);
  }
  if (Array.isArray(obj.turning_points) && obj.turning_points.length > 0) {
    lines.push('');
    lines.push('**Turning Points:**');
    obj.turning_points.forEach((point, idx) => {
      lines.push(`${idx + 1}. ${point}`);
    });
  }
  if (obj.climax && typeof obj.climax === 'string') {
    lines.push('');
    lines.push(`**Climax:** ${obj.climax}`);
  }
  if (obj.resolution && typeof obj.resolution === 'string') {
    lines.push('');
    lines.push(`**Resolution:** ${obj.resolution}`);
  }
  
  return lines.length > 0 ? lines.join('\n') : formatAgentContent(content);
}

function formatJsonAsMarkdown(obj: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  
  for (const [key, value] of Object.entries(obj)) {
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    
    if (Array.isArray(value)) {
      // Filter out empty/null items before rendering
      const filteredItems = value.filter(item => {
        if (item === null || item === undefined) return false;
        if (typeof item === 'string' && item.trim() === '') return false;
        if (typeof item === 'object' && Object.keys(item).length === 0) return false;
        return true;
      });
      
      if (filteredItems.length > 0) {
        lines.push(`${indent}**${formattedKey}:**`);
        lines.push('');  // Add blank line before list for proper markdown
        filteredItems.forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            // Format each field on its own line for better readability
            const itemLines: string[] = [];
            for (const [itemKey, itemValue] of Object.entries(item as Record<string, unknown>)) {
              const formattedItemKey = itemKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              if (itemValue !== null && itemValue !== undefined && itemValue !== '') {
                itemLines.push(`**${formattedItemKey}**: ${itemValue}`);
              }
            }
            if (itemLines.length > 0) {
              lines.push(`${indent}${i + 1}. ${itemLines.join(', ')}`);
            }
          } else {
            const itemText = String(item).trim();
            if (itemText) {
              lines.push(`${indent}${i + 1}. ${itemText}`);
            }
          }
        });
      }
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}**${formattedKey}:**`);
      lines.push(formatJsonAsMarkdown(value as Record<string, unknown>, depth + 1));
    } else if (typeof value === 'boolean') {
      lines.push(`${indent}**${formattedKey}:** ${value ? 'Yes' : 'No'}`);
    } else if (typeof value === 'number') {
      lines.push(`${indent}**${formattedKey}:** ${value}`);
    } else if (value) {
      const strValue = String(value);
      if (strValue.length > 100) {
        lines.push(`${indent}**${formattedKey}:**\n${indent}> ${strValue}`);
      } else {
        lines.push(`${indent}**${formattedKey}:** ${strValue}`);
      }
    }
  }
  
  // Use double newlines for proper markdown paragraph breaks
  return lines.join('\n\n');
}

function formatObjectInline(obj: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    // Format key: replace underscores with spaces and capitalize
    const formattedKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    if (typeof value === 'string' && value.length < 80) {
      parts.push(`**${formattedKey}**: ${value}`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`**${formattedKey}**: ${value}`);
    }
  }
  // Join with line breaks for better readability
  return parts.join(', ');
}

function MarkdownContent({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`prose prose-invert prose-sm max-w-none ${className}`}>
      <ReactMarkdown
        rehypePlugins={[rehypeSanitize]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-300 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
          em: ({ children }) => <em className="text-slate-400">{children}</em>,
          ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-slate-300">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-slate-600 pl-3 my-2 text-slate-400 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-slate-800 px-1.5 py-0.5 rounded text-xs text-cyan-400">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-slate-800/50 p-3 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap break-words">{children}</pre>
          ),
          h1: ({ children }) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold text-white mb-2">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-slate-200 mb-1">{children}</h3>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

interface AgentMessage {
  id: string;
  type: string;
  timestamp: string;
  data: {
    agent?: string;
    message_type?: string;
    content?: string;
    to_agent?: string;
    phase?: string;
    status?: string;
    error?: string;
    result?: Record<string, unknown>;
    result_summary?: string;
    round?: number;
  };
}

interface GenerationResult {
  narrative_possibility?: Record<string, unknown>;
  story?: string;
  agents?: Record<string, string>;
  error?: string;
}

interface AgentChatProps {
  runId: string | null;
  orchestratorUrl: string;
  onComplete?: (result: GenerationResult) => void;
  onClose?: () => void;
  projectResult?: ProjectResult | null;
  onUpdateResult?: (result: ProjectResult) => void;
  onRegenerate?: (constraints: RegenerationConstraints) => void;
  onNarrativePossibilitySelected?: (possibility: NarrativePossibility) => void;
  onResume?: (previousRunId: string, startFromPhase: string) => void;
}

export interface RegenerationConstraints {
  editComment: string;
  editedAgent: string;
  editedContent: string;
  lockedAgents: Record<string, string>;
  agentsToRegenerate: string[];
  scenesToRegenerate?: number[];
}

interface EditState {
  agent: string;
  content: string;
  originalContent: string;
}

const AGENTS = ['Architect', 'Profiler', 'Narrator', 'Strategist', 'Writer', 'Critic'] as const;
type AgentName = typeof AGENTS[number];

const AGENT_DEPENDENCIES: Record<AgentName, AgentName[]> = {
  Architect: ['Profiler', 'Narrator', 'Strategist', 'Writer', 'Critic'],
  Profiler: ['Narrator', 'Strategist', 'Writer', 'Critic'],
  Narrator: ['Strategist', 'Writer', 'Critic'],
  Strategist: ['Writer', 'Critic'],
  Writer: ['Critic'],
  Critic: ['Writer', 'Critic'],
};

// Phase taxonomy mapping - aligned with backend orchestrator phases
// Backend phases: genesis → characters → worldbuilding → outlining → motif_layer → advanced_planning → drafting → polish
const AGENT_TO_PHASE: Record<string, string> = {
  'Architect': 'Genesis',
  'Profiler': 'Characters',
  'Narrator': 'Narrator Design',
  'Worldbuilder': 'Worldbuilding',
  'Strategist': 'Outlining',
  'Writer': 'Drafting',
  'Critic': 'Drafting', // Critic is part of Writer↔Critic drafting loop, not a separate polish phase
};

// Phase order matching backend orchestrator flow
const PHASE_ORDER = ['Genesis', 'Characters', 'Narrator Design', 'Worldbuilding', 'Outlining', 'Motif Layer', 'Advanced Planning', 'Drafting', 'Polish'];

const getPhasesToRegenerate = (editedAgent: string): string[] => {
  const startPhase = AGENT_TO_PHASE[editedAgent] || 'Genesis';
  const startIndex = PHASE_ORDER.indexOf(startPhase);
  if (startIndex === -1) return PHASE_ORDER;
  return PHASE_ORDER.slice(startIndex);
};

const AGENT_COLORS: Record<string, string> = {
  Architect: 'bg-blue-500',
  Profiler: 'bg-cyan-500',
  Narrator: 'bg-indigo-500',
  Strategist: 'bg-green-500',
  Writer: 'bg-amber-500',
  Critic: 'bg-red-500',
  System: 'bg-neutral-500',
};

const AGENT_BORDER_COLORS: Record<string, string> = {
  Architect: 'border-blue-500/50',
  Profiler: 'border-cyan-500/50',
  Narrator: 'border-indigo-500/50',
  Strategist: 'border-green-500/50',
  Writer: 'border-amber-500/50',
  Critic: 'border-red-500/50',
  System: 'border-neutral-500/50',
};

const AGENT_GLOW_COLORS: Record<string, string> = {
  Architect: 'shadow-blue-500/20',
  Profiler: 'shadow-cyan-500/20',
  Narrator: 'shadow-indigo-500/20',
  Strategist: 'shadow-green-500/20',
  Writer: 'shadow-amber-500/20',
  Critic: 'shadow-red-500/20',
  System: 'shadow-neutral-500/20',
};

const AGENT_DESCRIPTIONS: Record<string, string> = {
  Architect: 'Narrative Designer',
  Profiler: 'Character Psychologist',
  Narrator: 'Voice Designer',
  Strategist: 'Plot Engineer',
  Writer: 'Scene Composer',
  Critic: 'Quality Analyst',
};

const AGENT_TEXT_COLORS: Record<string, string> = {
  Architect: 'text-blue-400',
  Profiler: 'text-cyan-400',
  Narrator: 'text-indigo-400',
  Strategist: 'text-green-400',
  Writer: 'text-amber-400',
  Critic: 'text-red-400',
  System: 'text-neutral-400',
};

const AGENT_ICONS: Record<string, string> = {
  Architect: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
  Profiler: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  Narrator: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z',
  Strategist: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  Writer: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  Critic: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  System: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
};

interface AgentState {
  status: 'idle' | 'thinking' | 'complete';
  messages: Array<{ content: string; round: number; timestamp: string }>;
  lastUpdate: string;
}

export function AgentChat({ runId, orchestratorUrl, onComplete, onClose, projectResult, onUpdateResult, onRegenerate, onNarrativePossibilitySelected, onResume }: AgentChatProps) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPhase, setCurrentPhase] = useState<string>('Initializing');
  const [isComplete, setIsComplete] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [narrativePossibilities, setNarrativePossibilities] = useState<NarrativePossibility[] | null>(null);
  const [narrativeRecommendation, setNarrativeRecommendation] = useState<NarrativePossibilitiesRecommendation | null>(null);
  const [isSelectingNarrative, setIsSelectingNarrative] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentRoundRef = useRef(1);
  const hasMessageInCurrentRoundRef = useRef(false);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [editState, setEditState] = useState<EditState | null>(null);
  const [lockedAgents, setLockedAgents] = useState<Record<string, boolean>>(() => projectResult?.locks || {});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [editComment, setEditComment] = useState('');
  const [agentsToRegenerate, setAgentsToRegenerate] = useState<string[]>([]);
  const [pendingEdit, setPendingEdit] = useState<{ agent: string; content: string } | null>(null);
  const [showSceneModal, setShowSceneModal] = useState(false);
  const [selectedScenes, setSelectedScenes] = useState<number[]>([]);
  const [sceneCount, setSceneCount] = useState(0);
  
  // Deepening Checkpoint state
  const [checkpointResults, setCheckpointResults] = useState<Record<string, {
    checkpoint_type: string;
    scene_number: number;
    passed: boolean;
    overall_score: number;
    criteria_scores?: Record<string, { score: number; feedback: string }>;
  }>>({});
  const [activeCheckpoint, setActiveCheckpoint] = useState<string | null>(null);

  // Motif Layer Planning state
  const [motifLayerResult, setMotifLayerResult] = useState<{
    core_symbols_count: number;
    character_motifs_count: number;
    scene_targets_count: number;
    has_structural_motifs: boolean;
  } | null>(null);
  const [isMotifPlanningActive, setIsMotifPlanningActive] = useState(false);

  // Diagnostic (Two-Pass Critic) state
  const [diagnosticResults, setDiagnosticResults] = useState<Record<number, {
    scene_number: number;
    rubric?: {
      overall_score: number;
      dimensions: Record<string, number>;
      didacticism_detected: boolean;
      cliches_found: string[];
      evidence_quotes: string[];
      weakness_candidates: Array<{ dimension: string; score: number; reason: string }>;
    };
    weakest_link?: {
      dimension: string;
      severity: string;
      evidence: string;
      revision_issues: string;
    };
    status: 'rubric_scanning' | 'analyzing_weakness' | 'revision_sent' | 'complete';
  }>>({});
  const [activeDiagnosticScene, setActiveDiagnosticScene] = useState<number | null>(null);

  // Interrupted run state (for resume after redeploy)
  const [isInterrupted, setIsInterrupted] = useState(false);
  const [canResume, setCanResume] = useState(false);
  const [resumeFromPhase, setResumeFromPhase] = useState<string | null>(null);
  const [lastCompletedPhase, setLastCompletedPhase] = useState<string | null>(null);
  const [isLoadingResumeState, setIsLoadingResumeState] = useState(false);

  useEffect(() => {
    if (projectResult?.locks) {
      setLockedAgents(projectResult.locks);
    }
  }, [projectResult?.locks]);

  // Reset state when runId changes (new generation or regeneration)
  useEffect(() => {
    if (runId) {
      // Close existing EventSource connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Reset all state for new run
      setMessages([]);
      setIsConnected(false);
      setError(null);
      setCurrentPhase('Initializing');
      setIsComplete(false);
      setIsCancelled(false);
      setIsCancelling(false);
      setSelectedRound(null);
      setIsPlaying(false);
      currentRoundRef.current = 1;
      hasMessageInCurrentRoundRef.current = false;
      // Reset edit state
      setEditState(null);
      setShowConfirmModal(false);
      setEditComment('');
      setAgentsToRegenerate([]);
      setPendingEdit(null);
      // Reset scene selection state
      setShowSceneModal(false);
      setSelectedScenes([]);
      setSceneCount(0);
      // Reset checkpoint state
      setCheckpointResults({});
      setActiveCheckpoint(null);
      // Reset motif layer state
      setMotifLayerResult(null);
      setIsMotifPlanningActive(false);
      // Reset diagnostic state
      setDiagnosticResults({});
      setActiveDiagnosticScene(null);
      // Reset interrupted state
      setIsInterrupted(false);
      setCanResume(false);
      setResumeFromPhase(null);
      setLastCompletedPhase(null);
      setIsLoadingResumeState(false);
    }
  }, [runId]);

  // Handle stop generation (uses pause so it can be resumed)
  const handleStopGeneration = useCallback(async () => {
    if (!runId || !orchestratorUrl || isCancelling || isComplete) return;
    
    setIsCancelling(true);
    
    try {
      // Close SSE connection first
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      // Call pause endpoint (not cancel) so generation can be resumed
      const response = await orchestratorFetch(`/runs/${runId}/pause`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setIsCancelled(true);
        setIsConnected(false);
        setCurrentPhase('Paused');
      }
    } catch (err) {
      console.error('Failed to pause generation:', err);
    } finally {
      setIsCancelling(false);
    }
  }, [runId, orchestratorUrl, isCancelling, isComplete]);

  // Handle resume generation
  const handleResumeGeneration = useCallback(async () => {
    if (!runId || !orchestratorUrl || isResuming || !isCancelled) return;
    
    setIsResuming(true);
    
    try {
      // Call resume endpoint
      const response = await orchestratorFetch(`/runs/${runId}/resume`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setIsCancelled(false);
        setCurrentPhase('Resuming...');
        // Trigger SSE reconnection via useEffect
        setReconnectTrigger(prev => prev + 1);
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('Failed to resume:', errorData);
        setError(`Failed to resume: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to resume generation:', err);
      setError('Failed to resume generation. Please try again.');
    } finally {
      setIsResuming(false);
    }
  }, [runId, orchestratorUrl, isResuming, isCancelled]);

  // Handle resume interrupted generation (after redeploy)
  const handleResumeInterrupted = useCallback(async () => {
    if (!runId || !onResume || isLoadingResumeState) return;
    
    setIsLoadingResumeState(true);
    
    try {
      // Fetch run state to get resume parameters
      const response = await orchestratorFetch(`/runs/${runId}/state`, {
        method: 'GET',
      });
      
      if (response.ok) {
        const state = await response.json();
        if (state.can_resume && state.resume_from_phase) {
          // Call parent's onResume with the parameters
          onResume(runId, state.resume_from_phase);
        } else {
          setError('This run cannot be resumed. Please start a new generation.');
        }
      } else {
        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
        console.error('Failed to get run state:', errorData);
        setError(`Failed to get run state: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Failed to resume interrupted generation:', err);
      setError('Failed to resume generation. Please try again.');
    } finally {
      setIsLoadingResumeState(false);
    }
  }, [runId, onResume, isLoadingResumeState]);

  const getAgentContent = useCallback((agent: string): string => {
    if (projectResult?.edits?.[agent]) {
      return projectResult.edits[agent].content;
    }
    if (projectResult?.agentOutputs?.[agent]) {
      return projectResult.agentOutputs[agent];
    }
    const agentMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === agent && m.data.content?.trim()
    );
    if (agentMessages.length > 0) {
      return agentMessages[agentMessages.length - 1].data.content || '';
    }
    return '';
  }, [messages, projectResult]);

  const handleStartEdit = useCallback((agent: string) => {
    const content = getAgentContent(agent);
    setEditState({
      agent,
      content,
      originalContent: content,
    });
  }, [getAgentContent]);

  const handleCancelEdit = useCallback(() => {
    setEditState(null);
  }, []);

  const handleApplyEdit = useCallback(() => {
    if (!editState) return;
    
    const affectedAgents = AGENT_DEPENDENCIES[editState.agent as AgentName] || [];
    const unlockedAffected = affectedAgents.filter(a => !lockedAgents[a]);
    
    setPendingEdit({ agent: editState.agent, content: editState.content });
    setAgentsToRegenerate(unlockedAffected);
    setEditComment('');
    setShowConfirmModal(true);
  }, [editState, lockedAgents]);

  const handleToggleLock = useCallback((agent: string) => {
    const newLocks = { ...lockedAgents, [agent]: !lockedAgents[agent] };
    setLockedAgents(newLocks);
    
    if (onUpdateResult && projectResult) {
      onUpdateResult({
        ...projectResult,
        locks: newLocks,
      });
    }
  }, [lockedAgents, onUpdateResult, projectResult]);

  const handleToggleAgentRegenerate = useCallback((agent: string) => {
    setAgentsToRegenerate(prev => 
      prev.includes(agent) 
        ? prev.filter(a => a !== agent)
        : [...prev, agent]
    );
  }, []);

  const handleConfirmRegenerate = useCallback(() => {
    if (!pendingEdit || !editComment.trim()) return;
    
    const lockedAgentContents: Record<string, string> = {};
    AGENTS.forEach(agent => {
      if (lockedAgents[agent]) {
        lockedAgentContents[agent] = getAgentContent(agent);
      }
    });
    
    if (onUpdateResult && projectResult) {
      const newEdits = {
        ...projectResult.edits,
        [pendingEdit.agent]: {
          content: pendingEdit.content,
          comment: editComment,
          updatedAt: new Date().toISOString(),
        },
      };
      onUpdateResult({
        ...projectResult,
        edits: newEdits,
      });
    }
    
    if (onRegenerate) {
      onRegenerate({
        editComment,
        editedAgent: pendingEdit.agent,
        editedContent: pendingEdit.content,
        lockedAgents: lockedAgentContents,
        agentsToRegenerate,
      });
    }
    
    setShowConfirmModal(false);
    setEditState(null);
    setPendingEdit(null);
    setEditComment('');
    setAgentsToRegenerate([]);
  }, [pendingEdit, editComment, lockedAgents, agentsToRegenerate, onUpdateResult, onRegenerate, projectResult, getAgentContent]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirmModal(false);
    setPendingEdit(null);
    setEditComment('');
    setAgentsToRegenerate([]);
  }, []);

  const handleOpenSceneModal = useCallback(() => {
    const writerMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
    );
    setSceneCount(writerMessages.length);
    setSelectedScenes([]);
    setShowSceneModal(true);
  }, [messages]);

  const handleToggleScene = useCallback((sceneNumber: number) => {
    setSelectedScenes(prev => 
      prev.includes(sceneNumber) 
        ? prev.filter(s => s !== sceneNumber)
        : [...prev, sceneNumber]
    );
  }, []);

  const handleSelectAllScenes = useCallback(() => {
    if (selectedScenes.length === sceneCount) {
      setSelectedScenes([]);
    } else {
      setSelectedScenes(Array.from({ length: sceneCount }, (_, i) => i + 1));
    }
  }, [selectedScenes.length, sceneCount]);

  const handleConfirmSceneRegenerate = useCallback(() => {
    if (selectedScenes.length === 0 || !onRegenerate) return;
    
    const lockedAgentContents: Record<string, string> = {};
    AGENTS.forEach(agent => {
      if (lockedAgents[agent]) {
        lockedAgentContents[agent] = getAgentContent(agent);
      }
    });
    
    onRegenerate({
      editComment: `Regenerating scenes: ${selectedScenes.sort((a, b) => a - b).join(', ')}`,
      editedAgent: 'Writer',
      editedContent: getAgentContent('Writer'),
      lockedAgents: lockedAgentContents,
      agentsToRegenerate: ['Writer', 'Critic'],
      scenesToRegenerate: selectedScenes,
    });
    
    setShowSceneModal(false);
    setSelectedScenes([]);
  }, [selectedScenes, onRegenerate, lockedAgents, getAgentContent]);

  const handleCancelSceneModal = useCallback(() => {
    setShowSceneModal(false);
    setSelectedScenes([]);
  }, []);

  useEffect(() => {
    if (!runId) return;

    // Connect to SSE endpoint with authentication
    let eventSource: EventSource | null = null;
    
    const connectSSE = async () => {
      try {
        const sseUrl = await getAuthenticatedSSEUrl(`/runs/${runId}/events`);
        eventSource = new EventSource(sseUrl);
        eventSourceRef.current = eventSource;

        eventSource.onopen = () => {
          setIsConnected(true);
          setError(null);
        };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as AgentMessage;
        
        if (data.type === 'phase_start' && data.data.phase) {
          setCurrentPhase(data.data.phase.charAt(0).toUpperCase() + data.data.phase.slice(1));
        }
        
        if (data.type === 'agent_message') {
          data.data.round = currentRoundRef.current;
          hasMessageInCurrentRoundRef.current = true;
        }
        
        if (data.type === 'agent_complete') {
          // Only increment round if we've seen at least one message in the current round
          // This prevents starting from round 2 if agent_complete arrives before agent_message
          if (hasMessageInCurrentRoundRef.current) {
            currentRoundRef.current += 1;
            hasMessageInCurrentRoundRef.current = false;
          }
        }

        // Handle narrative possibilities generated event (branching mode)
        if (data.type === 'narrative_possibilities_generated') {
          const possibilities = (data.data as unknown as { possibilities: NarrativePossibility[] }).possibilities || [];
          const recommendation = (data.data as unknown as { recommendation: NarrativePossibilitiesRecommendation }).recommendation || null;
          setNarrativePossibilities(possibilities);
          setNarrativeRecommendation(recommendation);
          setCurrentPhase('Select Narrative');
          setIsComplete(true);
          if (eventSource) eventSource.close();
          setIsConnected(false);
          return;
        }

        // Handle deepening checkpoint events
        if (data.type === 'checkpoint_start') {
          const checkpointType = (data.data as unknown as { checkpoint_type: string }).checkpoint_type;
          const sceneNumber = (data.data as unknown as { scene_number: number }).scene_number;
          setActiveCheckpoint(checkpointType);
          setCurrentPhase(`Checkpoint: ${checkpointType.replace(/_/g, ' ')}`);
          // Initialize checkpoint result as pending
          setCheckpointResults(prev => ({
            ...prev,
            [checkpointType]: {
              checkpoint_type: checkpointType,
              scene_number: sceneNumber,
              passed: false,
              overall_score: 0,
            }
          }));
        }

        if (data.type === 'checkpoint_complete') {
          const result = data.data as unknown as {
            checkpoint_type: string;
            scene_number: number;
            passed: boolean;
            overall_score: number;
            criteria_scores?: Record<string, { score: number; feedback: string }>;
          };
          setActiveCheckpoint(null);
          setCheckpointResults(prev => ({
            ...prev,
            [result.checkpoint_type]: result
          }));
        }

        // Handle motif layer planning events
        if (data.type === 'motif_planning_start') {
          setIsMotifPlanningActive(true);
          setCurrentPhase('Motif Layer Planning');
        }

        if (data.type === 'motif_planning_complete') {
          const result = data.data as unknown as {
            core_symbols_count: number;
            character_motifs_count: number;
            scene_targets_count: number;
            has_structural_motifs: boolean;
          };
          setIsMotifPlanningActive(false);
          setMotifLayerResult(result);
        }

        // Handle diagnostic (two-pass Critic) events
        if (data.type === 'diagnostic_pass_start') {
          const sceneNumber = (data.data as unknown as { scene_number: number }).scene_number;
          setActiveDiagnosticScene(sceneNumber);
          setCurrentPhase(`Diagnostic: Scene ${sceneNumber}`);
          setDiagnosticResults(prev => ({
            ...prev,
            [sceneNumber]: {
              scene_number: sceneNumber,
              status: 'rubric_scanning',
            }
          }));
        }

        if (data.type === 'diagnostic_rubric_complete') {
          const result = data.data as unknown as {
            scene_number: number;
            overall_score: number;
            dimensions: Record<string, number>;
            didacticism_detected: boolean;
            cliches_found: string[];
            evidence_quotes: string[];
            weakness_candidates: Array<{ dimension: string; score: number; reason: string }>;
          };
          setDiagnosticResults(prev => ({
            ...prev,
            [result.scene_number]: {
              ...prev[result.scene_number],
              scene_number: result.scene_number,
              rubric: {
                overall_score: result.overall_score,
                dimensions: result.dimensions,
                didacticism_detected: result.didacticism_detected,
                cliches_found: result.cliches_found || [],
                evidence_quotes: result.evidence_quotes || [],
                weakness_candidates: result.weakness_candidates || [],
              },
              status: 'analyzing_weakness',
            }
          }));
        }

        if (data.type === 'diagnostic_weakest_link') {
          const result = data.data as unknown as {
            scene_number: number;
            weakest_link: string;
            severity: string;
            evidence?: string;
            revision_issues: string;
          };
          setDiagnosticResults(prev => ({
            ...prev,
            [result.scene_number]: {
              ...prev[result.scene_number],
              weakest_link: {
                dimension: result.weakest_link,
                severity: result.severity,
                evidence: result.evidence || '',
                revision_issues: result.revision_issues,
              },
              status: 'revision_sent',
            }
          }));
          setActiveDiagnosticScene(null);
        }
        
        setMessages((prev) => [...prev, data]);
        
        // Handle cancellation event
        if (data.type === 'generation_cancelled') {
          setCurrentPhase('Cancelled');
          setIsCancelled(true);
          if (eventSource) eventSource.close();
          setIsConnected(false);
          return;
        }
        
        // Close connection when generation is complete or errored
        if (data.type === 'generation_complete' || data.type === 'generation_error') {
          const isInterruptedRun = data.type === 'generation_error' && data.data.status === 'interrupted';
          setCurrentPhase(data.type === 'generation_complete' ? 'Complete' : (isInterruptedRun ? 'Interrupted' : 'Error'));
          setIsComplete(true);
          if (eventSource) eventSource.close();
          setIsConnected(false);
          
          // Set interrupted state for resume functionality
          if (isInterruptedRun) {
            setIsInterrupted(true);
            // Fetch run state to check if resume is possible
            orchestratorFetch(`/runs/${runId}/state`, { method: 'GET' })
              .then(response => response.ok ? response.json() : null)
              .then(state => {
                if (state && state.can_resume) {
                  setCanResume(true);
                  setResumeFromPhase(state.resume_from_phase);
                  setLastCompletedPhase(state.last_completed_phase);
                }
              })
              .catch(err => console.error('Failed to fetch run state:', err));
          }
          
          // Call onComplete callback with result
          if (onComplete) {
            if (data.type === 'generation_error') {
              onComplete({ error: data.data.error || 'Unknown error' });
            } else {
              // Extract the best available result content
              const allMessages = [...messages, data];
              
              // Collect all agent outputs for persistence
              const agentMessages = allMessages.filter(
                m => m.type === 'agent_message' && m.data.content?.trim()
              );
              const agentOutputs: Record<string, string> = {};
              agentMessages.forEach(m => {
                const agent = m.data.agent || 'Unknown';
                if (m.data.content) {
                  agentOutputs[agent] = m.data.content;
                }
              });
              
              // Try phase_complete with result first
              const phaseCompleteEvents = allMessages.filter(m => m.type === 'phase_complete' && m.data.result);
              if (phaseCompleteEvents.length > 0) {
                const genesisComplete = phaseCompleteEvents.find(m => m.data.phase === 'genesis');
                const phaseComplete = genesisComplete || phaseCompleteEvents[phaseCompleteEvents.length - 1];
                onComplete({
                  narrative_possibility: phaseComplete.data.result,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Try generation_complete result_summary
              const completeEvent = allMessages.find(m => m.type === 'generation_complete');
              if (completeEvent?.data.result_summary) {
                onComplete({
                  story: completeEvent.data.result_summary,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Use Writer's last message as the story content
              const writerMessages = allMessages.filter(
                m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
              );
              if (writerMessages.length > 0) {
                onComplete({
                  story: writerMessages[writerMessages.length - 1].data.content,
                  agents: agentOutputs,
                });
                return;
              }
              
              // Fall back to all agent messages combined
              onComplete({
                agents: agentOutputs,
              });
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse SSE message:', e);
      }
    };

        eventSource.onerror = () => {
          setIsConnected(false);
          setError('Connection lost. Reconnecting...');
        };
      } catch (err) {
        console.error('Failed to connect to SSE:', err);
        setError(err instanceof Error ? err.message : 'Failed to connect');
      }
    };

    connectSSE();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [runId, orchestratorUrl, reconnectTrigger]);

  // Compute available rounds from messages
  const rounds = useMemo(() => {
    const roundSet = new Set<number>();
    messages.forEach(msg => {
      if (msg.type === 'agent_message' && msg.data.content) {
        // Use round from message, default to 1 if not set
        const round = msg.data.round ?? 1;
        roundSet.add(round);
      }
    });
    return Array.from(roundSet).sort((a, b) => a - b);
  }, [messages]);

  // Playback functionality for cinematic viewing
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      setSelectedRound(1);
      
      playbackIntervalRef.current = setInterval(() => {
        setSelectedRound(prev => {
          const currentIdx = prev ? rounds.indexOf(prev) : -1;
          const nextIdx = currentIdx + 1;
          if (nextIdx >= rounds.length) {
            if (playbackIntervalRef.current) {
              clearInterval(playbackIntervalRef.current);
              playbackIntervalRef.current = null;
            }
            setIsPlaying(false);
            return null;
          }
          return rounds[nextIdx];
        });
      }, 3000);
    }
  }, [isPlaying, rounds]);

  // Cleanup playback interval on unmount
  useEffect(() => {
    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, []);

  // Compute agent states from messages
  const agentStates = useMemo(() => {
    const states: Record<string, AgentState> = {};
    
    AGENTS.forEach(agent => {
      states[agent] = { status: 'idle', messages: [], lastUpdate: '' };
    });
    
    messages.forEach(msg => {
      // Defensive check: msg.data may be undefined for some event types
      if (!msg.data || typeof msg.data !== 'object') return;
      const agent = msg.data.agent as string | undefined;
      if (!agent || !states[agent]) return;
      
      if (msg.type === 'agent_start') {
        states[agent].status = 'thinking';
        states[agent].lastUpdate = msg.timestamp;
      } else if (msg.type === 'agent_complete') {
        states[agent].status = 'complete';
        states[agent].lastUpdate = msg.timestamp;
      } else if (msg.type === 'agent_message' && msg.data.content) {
        states[agent].messages.push({
          content: msg.data.content,
          round: msg.data.round || 1,
          timestamp: msg.timestamp,
        });
        states[agent].lastUpdate = msg.timestamp;
      }
    });
    
    return states;
  }, [messages]);

  // Determine which agent is currently active
  const activeAgent = useMemo(() => {
    for (const agent of AGENTS) {
      if (agentStates[agent].status === 'thinking') {
        return agent;
      }
    }
    return null;
  }, [agentStates]);

  // Extract final result from messages - prefer clean story text over JSON
  const finalResult = useMemo(() => {
    // Collect all Polish agent messages and extract clean story text from each
    const polishMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Polish' && m.data.content?.trim()
    );
    if (polishMessages.length > 0) {
      // Extract story text from all Polish messages and concatenate
      const storyTexts = polishMessages
        .map(m => extractStoryText(m.data.content || '', 'Polish'))
        .filter(text => text.trim());
      
      if (storyTexts.length > 0) {
        // Join multiple scenes with separator
        return storyTexts.join('\n\n---\n\n');
      }
    }
    
    // Fall back to Writer's messages (draft story content)
    const writerMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.agent === 'Writer' && m.data.content?.trim()
    );
    if (writerMessages.length > 0) {
      // Extract story text from all Writer messages and concatenate
      const storyTexts = writerMessages
        .map(m => extractStoryText(m.data.content || '', 'Writer'))
        .filter(text => text.trim());
      
      if (storyTexts.length > 0) {
        return storyTexts.join('\n\n---\n\n');
      }
    }
    
    // Try generation_complete result_summary as fallback
    const completeEvent = messages.find(m => m.type === 'generation_complete');
    if (completeEvent?.data.result_summary) {
      // Try to extract story text from result_summary too
      const extracted = extractStoryText(
        typeof completeEvent.data.result_summary === 'string' 
          ? completeEvent.data.result_summary 
          : JSON.stringify(completeEvent.data.result_summary),
        'other'
      );
      if (extracted) return extracted;
      return typeof completeEvent.data.result_summary === 'string'
        ? completeEvent.data.result_summary
        : JSON.stringify(completeEvent.data.result_summary, null, 2);
    }
    
    // Fall back to last substantial agent message (extract story text if possible)
    const agentMessages = messages.filter(
      m => m.type === 'agent_message' && m.data.content?.trim()
    );
    if (agentMessages.length > 0) {
      const lastMsg = agentMessages[agentMessages.length - 1];
      const extracted = extractStoryText(lastMsg.data.content || '', 'other');
      if (extracted) return extracted;
      return lastMsg.data.content || '';
    }
    
    return '';
  }, [messages]);

  // Check for errors
  const generationError = useMemo(() => {
    const errorEvent = messages.find(m => m.type === 'generation_error' || m.type === 'error');
    return errorEvent?.data.error || null;
  }, [messages]);

  if (!runId) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <p className="text-slate-400">Start a generation to see agent communication</p>
      </div>
    );
  }

  // Get message for display based on selected round
  const getDisplayMessage = (state: AgentState) => {
    if (state.messages.length === 0) return null;
    
    if (selectedRound !== null) {
      const roundMessages = state.messages.filter(m => m.round === selectedRound);
      return roundMessages.length > 0 ? roundMessages[roundMessages.length - 1] : null;
    }
    
    return state.messages[state.messages.length - 1];
  };

  return (
    <div className="bg-slate-800/30 border border-slate-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900/80 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0">
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          <h3 className="font-bold text-base sm:text-lg">Multi-Agent Orchestration</h3>
          <div className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-medium ${
            isCancelled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
            isConnected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
            isComplete ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 
            'bg-red-500/20 text-red-400 border border-red-500/30'
          }`}>
            <div className={`w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full ${
              isCancelled ? 'bg-amber-400' :
              isConnected ? 'bg-green-400 animate-pulse' : 
              isComplete ? 'bg-blue-400' : 
              'bg-red-400'
            }`} />
            {isCancelled ? 'Cancelled' : isConnected ? 'Live' : isComplete ? 'Complete' : 'Disconnected'}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-xs sm:text-sm text-slate-400">
            Phase: <span className="text-white font-medium">{currentPhase}</span>
          </span>
          {isConnected && !isComplete && !isCancelled && (
            <button 
              onClick={handleStopGeneration}
              disabled={isCancelling}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isCancelling 
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                  : 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
              }`}
            >
              {isCancelling ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Stopping...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                  </svg>
                  Stop
                </>
              )}
            </button>
          )}
          {isCancelled && !isComplete && (
            <button 
              onClick={handleResumeGeneration}
              disabled={isResuming}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isResuming 
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed' 
                  : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
              }`}
            >
              {isResuming ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Resuming...
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Resume
                </>
              )}
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 transition-colors">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Round Switcher */}
      {rounds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-slate-800/50 border-b border-slate-700">
          <span className="text-xs text-slate-400 font-medium">Steps:</span>
          
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setSelectedRound(null)}
              className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedRound === null 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              All
            </button>
            
            {rounds.map(round => (
              <button
                key={round}
                onClick={() => setSelectedRound(round)}
                className={`px-2 sm:px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  selectedRound === round 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                }`}
              >
                {round}
              </button>
            ))}
          </div>
          
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={togglePlayback}
              className={`flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs font-medium transition-all ${
                isPlaying 
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                  : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
              }`}
            >
              {isPlaying ? (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Motif Layer Planning Status */}
      {(isMotifPlanningActive || motifLayerResult) && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Motif Bible</span>
            {isMotifPlanningActive && (
              <svg className="w-3 h-3 animate-spin text-rose-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
          </div>
          {motifLayerResult ? (
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span>{motifLayerResult.core_symbols_count} Core Symbols</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{motifLayerResult.character_motifs_count} Character Motifs</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/30">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>{motifLayerResult.scene_targets_count} Scene Targets</span>
              </div>
              {motifLayerResult.has_structural_motifs && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>Structural Motifs</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-400">Planning symbolic layer...</div>
          )}
        </div>
      )}

      {/* Deepening Checkpoints Status */}
      {Object.keys(checkpointResults).length > 0 && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Structural Checkpoints</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['inciting_incident', 'midpoint', 'climax', 'resolution'].map(checkpointType => {
              const result = checkpointResults[checkpointType];
              const isActive = activeCheckpoint === checkpointType;
              const isPending = result && result.overall_score === 0;
              const passed = result?.passed;
              const score = result?.overall_score;
              
              return (
                <div
                  key={checkpointType}
                  className={`
                    flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all
                    ${isActive ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse' : ''}
                    ${!isActive && result && passed ? 'bg-green-500/20 text-green-400 border border-green-500/30' : ''}
                    ${!isActive && result && !passed && !isPending ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : ''}
                    ${!result ? 'bg-slate-700/50 text-slate-500 border border-slate-600/30' : ''}
                    ${isPending && !isActive ? 'bg-slate-700/50 text-slate-400 border border-slate-600/30' : ''}
                  `}
                  title={result ? `Scene ${result.scene_number}: ${passed ? 'Passed' : 'Needs Revision'} (${score?.toFixed(1)}/10)` : 'Not yet evaluated'}
                >
                  {isActive && (
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  )}
                  {!isActive && result && passed && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {!isActive && result && !passed && !isPending && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <span className="capitalize">{checkpointType.replace(/_/g, ' ')}</span>
                  {result && !isPending && (
                    <span className="text-[10px] opacity-75">({score?.toFixed(1)})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Diagnostic Analysis Panel (Two-Pass Critic) */}
      {Object.keys(diagnosticResults).length > 0 && (
        <div className="bg-slate-800/50 border-b border-slate-700 px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span className="text-xs font-medium text-slate-300">Diagnostic Analysis</span>
            {activeDiagnosticScene && (
              <span className="text-xs text-sky-400 animate-pulse">Analyzing Scene {activeDiagnosticScene}...</span>
            )}
          </div>
          
          <div className="space-y-3">
            {Object.values(diagnosticResults).map(diagnostic => (
              <div key={diagnostic.scene_number} className="rounded-lg overflow-hidden">
                {/* Scene Header */}
                <div className={`px-3 py-2 flex items-center justify-between ${
                  diagnostic.status === 'rubric_scanning' ? 'bg-sky-500/20 border border-sky-500/30' :
                  diagnostic.status === 'analyzing_weakness' ? 'bg-sky-500/20 border border-sky-500/30' :
                  diagnostic.status === 'revision_sent' ? 'bg-amber-500/20 border border-amber-500/30' :
                  'bg-emerald-500/20 border border-emerald-500/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${
                      diagnostic.status === 'rubric_scanning' || diagnostic.status === 'analyzing_weakness' ? 'text-sky-400' :
                      diagnostic.status === 'revision_sent' ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      Scene {diagnostic.scene_number}
                    </span>
                    {diagnostic.status === 'rubric_scanning' && (
                      <span className="text-[10px] text-sky-300 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Rubric Scan
                      </span>
                    )}
                    {diagnostic.status === 'analyzing_weakness' && (
                      <span className="text-[10px] text-sky-300 flex items-center gap-1">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Finding Weakest Link
                      </span>
                    )}
                    {diagnostic.status === 'revision_sent' && (
                      <span className="text-[10px] text-amber-300">Revision Requested</span>
                    )}
                  </div>
                  {diagnostic.rubric && (
                    <span className={`text-xs font-bold ${
                      diagnostic.rubric.overall_score >= 8 ? 'text-emerald-400' :
                      diagnostic.rubric.overall_score >= 6 ? 'text-amber-400' :
                      'text-red-400'
                    }`}>
                      {diagnostic.rubric.overall_score.toFixed(1)}/10
                    </span>
                  )}
                </div>

                {/* Rubric Details */}
                {diagnostic.rubric && (
                  <div className="bg-slate-900/50 px-3 py-2 border-x border-b border-slate-700/50">
                    {/* Dimension Scores */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                      {Object.entries(diagnostic.rubric.dimensions).map(([dim, score]) => (
                        <div key={dim} className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-400 truncate" title={dim.replace(/_/g, ' ')}>
                            {dim.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase()).join('')}
                          </span>
                          <span className={`font-medium ${
                            score >= 8 ? 'text-emerald-400' :
                            score >= 6 ? 'text-amber-400' :
                            'text-red-400'
                          }`}>{score}</span>
                        </div>
                      ))}
                    </div>

                    {/* Flags */}
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {diagnostic.rubric.didacticism_detected && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 border border-red-500/30">
                          Didacticism Detected
                        </span>
                      )}
                      {diagnostic.rubric.cliches_found.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          {diagnostic.rubric.cliches_found.length} Cliches
                        </span>
                      )}
                    </div>

                    {/* Weakness Candidates */}
                    {diagnostic.rubric.weakness_candidates.length > 0 && (
                      <div className="text-[10px] text-slate-400">
                        <span className="text-slate-500">Weaknesses: </span>
                        {diagnostic.rubric.weakness_candidates.map((w, i) => (
                          <span key={i} className="text-amber-400">
                            {w.dimension.replace(/_/g, ' ')} ({w.score})
                            {i < diagnostic.rubric!.weakness_candidates.length - 1 ? ', ' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Weakest Link Details */}
                {diagnostic.weakest_link && (
                  <div className={`px-3 py-2 border-x border-b rounded-b-lg ${
                    diagnostic.weakest_link.severity === 'critical' ? 'bg-red-500/10 border-red-500/30' :
                    diagnostic.weakest_link.severity === 'major' ? 'bg-amber-500/10 border-amber-500/30' :
                    'bg-yellow-500/10 border-yellow-500/30'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <svg className={`w-3 h-3 ${
                        diagnostic.weakest_link.severity === 'critical' ? 'text-red-400' :
                        diagnostic.weakest_link.severity === 'major' ? 'text-amber-400' :
                        'text-yellow-400'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span className={`text-xs font-medium ${
                        diagnostic.weakest_link.severity === 'critical' ? 'text-red-400' :
                        diagnostic.weakest_link.severity === 'major' ? 'text-amber-400' :
                        'text-yellow-400'
                      }`}>
                        {diagnostic.weakest_link.dimension.replace(/_/g, ' ')}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        diagnostic.weakest_link.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                        diagnostic.weakest_link.severity === 'major' ? 'bg-amber-500/20 text-amber-300' :
                        'bg-yellow-500/20 text-yellow-300'
                      }`}>
                        {diagnostic.weakest_link.severity}
                      </span>
                    </div>
                    {diagnostic.weakest_link.revision_issues && (
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        {diagnostic.weakest_link.revision_issues}
                      </p>
                    )}
                    {diagnostic.weakest_link.evidence && (
                      <p className="text-[10px] text-slate-500 mt-1 italic border-l-2 border-slate-600 pl-2">
                        "{diagnostic.weakest_link.evidence.substring(0, 100)}{diagnostic.weakest_link.evidence.length > 100 ? '...' : ''}"
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {(error || generationError) && (
        <div className={`border-b px-4 py-3 ${isInterrupted ? 'bg-amber-500/10 border-amber-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <p className={`text-sm ${isInterrupted ? 'text-amber-400' : 'text-red-400'}`}>
                {error || generationError}
              </p>
              {isInterrupted && lastCompletedPhase && (
                <p className="text-xs text-slate-400 mt-1">
                  Last completed phase: <span className="text-amber-300 font-medium">{lastCompletedPhase}</span>
                  {resumeFromPhase && (
                    <span> - Will resume from: <span className="text-emerald-300 font-medium">{resumeFromPhase}</span></span>
                  )}
                </p>
              )}
            </div>
            {isInterrupted && canResume && onResume && (
              <button
                onClick={handleResumeInterrupted}
                disabled={isLoadingResumeState}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
              >
                {isLoadingResumeState ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Loading...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Resume</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Narrative Possibilities Selector (Branching Mode) */}
      {narrativePossibilities && narrativePossibilities.length > 0 && (
        <div className="p-4">
          <NarrativePossibilitiesSelector
            possibilities={narrativePossibilities}
            recommendation={narrativeRecommendation || undefined}
            onSelect={(possibility) => {
              setIsSelectingNarrative(true);
              if (onNarrativePossibilitySelected) {
                onNarrativePossibilitySelected(possibility);
              }
            }}
            isLoading={isSelectingNarrative}
          />
        </div>
      )}

      {/* Agent Grid */}
      <div className="p-2 sm:p-4" style={{ display: narrativePossibilities && narrativePossibilities.length > 0 ? 'none' : 'block' }}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <p className="text-slate-400 font-medium">Initializing agents...</p>
              <p className="text-sm text-slate-500 mt-1">Preparing the storytelling ensemble</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENTS.map(agent => {
              const state = agentStates[agent];
              const color = AGENT_COLORS[agent];
              const borderColor = AGENT_BORDER_COLORS[agent];
              const glowColor = AGENT_GLOW_COLORS[agent];
              const textColor = AGENT_TEXT_COLORS[agent];
              const icon = AGENT_ICONS[agent];
              const description = AGENT_DESCRIPTIONS[agent];
              const isActive = activeAgent === agent && !isCancelled;
              const displayMessage = getDisplayMessage(state);
              const formattedContent = displayMessage ? formatAgentContent(displayMessage.content) : '';
              const isEditing = editState?.agent === agent;
              const isLocked = lockedAgents[agent] || false;
              const hasContent = displayMessage || getAgentContent(agent);
              
              return (
                <div 
                  key={agent}
                  className={`
                    relative rounded-xl overflow-hidden transition-all duration-500
                    ${isActive ? `border-2 ${borderColor} shadow-lg ${glowColor}` : 'border border-slate-700/50'}
                    ${state.status === 'idle' && !hasContent ? 'opacity-40' : 'opacity-100'}
                    ${isLocked ? 'ring-2 ring-amber-500/30' : ''}
                    hover:border-slate-600 hover:shadow-md
                    bg-gradient-to-b from-slate-800/80 to-slate-900/80
                  `}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse" />
                  )}
                  
                  {/* Agent Header */}
                  <div className={`px-4 py-3 flex items-center gap-3 border-b border-slate-700/50 ${
                    isActive ? 'bg-slate-800/50' : ''
                  }`}>
                    <div className={`
                      w-10 h-10 rounded-full ${color} flex items-center justify-center flex-shrink-0
                      ${isActive ? 'animate-pulse' : ''}
                      shadow-lg
                    `}>
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${textColor}`}>{agent}</span>
                        {isLocked && (
                          <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        {state.status === 'thinking' && !isCancelled && (
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        )}
                        {state.status === 'complete' && !isLocked && (
                          <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">{description}</span>
                    </div>
                    
                    {/* Edit and Lock buttons */}
                    {(isComplete || hasContent) && !isEditing && (
                      <div className="flex items-center gap-1">
                        {agent === 'Writer' && (
                          <button
                            onClick={handleOpenSceneModal}
                            className="p-1.5 rounded-lg text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-colors"
                            title="Regenerate specific scenes"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleToggleLock(agent)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            isLocked 
                              ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                              : 'text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                          }`}
                          title={isLocked ? 'Unlock agent' : 'Lock agent'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isLocked ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                            )}
                          </svg>
                        </button>
                        <button
                          onClick={() => handleStartEdit(agent)}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors"
                          title="Edit content"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* Agent Content */}
                  <div className="p-4 min-h-[120px] max-h-[300px] overflow-y-auto">
                    {isEditing ? (
                      <div className="space-y-3">
                        <textarea
                          value={editState.content}
                          onChange={(e) => setEditState({ ...editState, content: e.target.value })}
                          className="w-full h-40 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                          placeholder="Edit agent content..."
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 text-sm rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleApplyEdit}
                            className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    ) : !displayMessage && !getAgentContent(agent) ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-slate-500 italic">
                          {isCancelled ? 'Cancelled' : state.status === 'thinking' ? 'Processing...' : 'Awaiting turn...'}
                        </p>
                      </div>
                    ) : (
                      <MarkdownContent 
                        content={formattedContent || (agent === 'Strategist' ? formatStrategistContent(getAgentContent(agent)) : formatAgentContent(getAgentContent(agent)))} 
                        className="text-sm" 
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation Timeline */}
      {messages.filter(m => m.type === 'agent_message' && m.data.content).length > 0 && (
        <div className="border-t border-slate-700">
          <details className="group" open>
            <summary className="bg-slate-800/50 px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-800 transition-colors">
              <svg className="w-5 h-5 text-cyan-400 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <h4 className="font-semibold text-cyan-400">Conversation Timeline</h4>
              <span className="text-xs text-slate-500 ml-auto">
                {(() => {
                  const agentMsgs = messages.filter(m => m.type === 'agent_message' && m.data.content);
                  const filtered = selectedRound !== null 
                    ? agentMsgs.filter(m => m.data.round === selectedRound)
                    : agentMsgs;
                  return `${filtered.length} messages`;
                })()}
              </span>
            </summary>
            
            <div className="p-4 bg-slate-900/30 max-h-[400px] overflow-y-auto">
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-slate-700 via-slate-600 to-slate-700" />
                
                <div className="space-y-4">
                  {messages
                    .filter(m => m.type === 'agent_message' && m.data.content)
                    .filter(m => selectedRound === null || m.data.round === selectedRound)
                    .map((msg, idx) => {
                      const agent = msg.data.agent || 'System';
                      const color = AGENT_COLORS[agent] || AGENT_COLORS.System;
                      const textColor = AGENT_TEXT_COLORS[agent] || AGENT_TEXT_COLORS.System;
                      const content = msg.data.content || '';
                      const round = msg.data.round || 1;
                      
                      return (
                        <div key={msg.id || idx} className="relative flex gap-4 pl-2">
                          <div className={`
                            relative z-10 w-8 h-8 rounded-full ${color} flex items-center justify-center flex-shrink-0
                            shadow-lg ring-4 ring-slate-900
                          `}>
                            <span className="text-xs font-bold text-white">{idx + 1}</span>
                          </div>
                          
                          <div className="flex-1 bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 hover:border-slate-600 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                              <span className={`font-semibold ${textColor}`}>{agent}</span>
                              <button
                                onClick={() => setSelectedRound(round)}
                                className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400 hover:bg-slate-600 transition-colors"
                              >
                                Round {round}
                              </button>
                              <span className="text-xs text-slate-500 ml-auto">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <MarkdownContent content={formatAgentContent(content)} className="text-sm" />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </details>
        </div>
      )}

      {/* Result Section */}
      {(isComplete || finalResult) && (
        <div className="border-t border-slate-700">
          <div className="bg-slate-800/50 px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h4 className="font-semibold text-green-400">Generated Result</h4>
          </div>
          <div className="p-4 bg-slate-900/30 max-h-[300px] overflow-y-auto">
            {finalResult ? (
              <MarkdownContent content={formatAgentContent(finalResult)} />
            ) : (
              <p className="text-sm text-slate-500 italic">Processing result...</p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-slate-900/50 border-t border-slate-700 px-4 py-2 flex items-center justify-between text-xs text-slate-500">
        <span>Run ID: {runId.substring(0, 8)}...</span>
        <span>{messages.length} events</span>
      </div>

      {/* Edit Confirmation Modal */}
      {showConfirmModal && pendingEdit && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Confirm Edit & Regenerate</h3>
              <p className="text-sm text-slate-400 mt-1">
                You edited <span className={AGENT_TEXT_COLORS[pendingEdit.agent]}>{pendingEdit.agent}</span>. 
                This will affect downstream agents.
              </p>
              <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-xs text-blue-300">
                  <strong>Phase-Based Regeneration:</strong> Only phases from <span className="font-semibold">{AGENT_TO_PHASE[pendingEdit.agent] || 'Genesis'}</span> onwards will be regenerated.
                  Previous phases will be preserved from your last run.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {getPhasesToRegenerate(pendingEdit.agent).map((phase, idx) => (
                    <span key={phase} className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300">
                      {idx > 0 && <span className="mr-1">→</span>}
                      {phase}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Edit Comment */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  What did you change? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full h-24 bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                  placeholder="Describe your changes so the AI can understand the context..."
                />
              </div>
              
              {/* Dependency Graph */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Agent Dependency Flow
                </label>
                <div className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {AGENTS.map((agent, idx) => {
                      const isEdited = agent === pendingEdit.agent;
                      const isAffected = AGENT_DEPENDENCIES[pendingEdit.agent as AgentName]?.includes(agent as AgentName);
                      const isLocked = lockedAgents[agent];
                      const willRegenerate = agentsToRegenerate.includes(agent);
                      
                      return (
                        <div key={agent} className="flex items-center gap-2">
                          <div 
                            className={`
                              px-3 py-2 rounded-lg text-sm font-medium transition-all
                              ${isEdited ? 'bg-blue-500/30 border-2 border-blue-500 text-blue-300' : ''}
                              ${isAffected && !isEdited ? (isLocked ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300' : willRegenerate ? 'bg-green-500/20 border border-green-500/50 text-green-300' : 'bg-slate-700 border border-slate-600 text-slate-400') : ''}
                              ${!isEdited && !isAffected ? 'bg-slate-800 border border-slate-700 text-slate-500' : ''}
                            `}
                          >
                            <div className="flex items-center gap-1.5">
                              {isLocked && (
                                <svg className="w-3 h-3 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                </svg>
                              )}
                              {isEdited && (
                                <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              )}
                              {agent}
                            </div>
                          </div>
                          {idx < AGENTS.length - 1 && (
                            <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-center gap-4 mt-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-blue-500/30 border border-blue-500"></span> Edited
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-green-500/20 border border-green-500/50"></span> Will Regenerate
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded bg-amber-500/20 border border-amber-500/50"></span> Locked
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Agents to Regenerate */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Select agents to regenerate
                </label>
                <div className="space-y-2">
                  {AGENTS.filter(agent => agent !== pendingEdit.agent).map(agent => {
                    const isAffected = AGENT_DEPENDENCIES[pendingEdit.agent as AgentName]?.includes(agent as AgentName);
                    const isLocked = lockedAgents[agent];
                    const willRegenerate = agentsToRegenerate.includes(agent);
                    
                    return (
                      <div 
                        key={agent}
                        className={`
                          flex items-center justify-between p-3 rounded-lg border transition-all
                          ${isLocked ? 'bg-amber-500/10 border-amber-500/30' : willRegenerate ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-800/50 border-slate-700'}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={willRegenerate}
                            onChange={() => handleToggleAgentRegenerate(agent)}
                            disabled={isLocked}
                            className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/50 disabled:opacity-50"
                          />
                          <div className={`w-8 h-8 rounded-full ${AGENT_COLORS[agent]} flex items-center justify-center`}>
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={AGENT_ICONS[agent]} />
                            </svg>
                          </div>
                          <div>
                            <span className={`font-medium ${AGENT_TEXT_COLORS[agent]}`}>{agent}</span>
                            <span className="text-xs text-slate-500 ml-2">{AGENT_DESCRIPTIONS[agent]}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isAffected && !isLocked && !willRegenerate && (
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-600/50 text-slate-400">Downstream</span>
                          )}
                          {willRegenerate && (
                            <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">Will Regenerate</span>
                          )}
                          <button
                            onClick={() => handleToggleLock(agent)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isLocked 
                                ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' 
                                : 'text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                            }`}
                            title={isLocked ? 'Unlock agent' : 'Lock agent'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {isLocked ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={handleCancelConfirm}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRegenerate}
                disabled={!editComment.trim()}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scene Selection Modal */}
      {showSceneModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700">
              <h3 className="text-xl font-bold text-white">Regenerate Selected Scenes</h3>
              <p className="text-sm text-slate-400 mt-1">
                Select which scenes you want to regenerate. Unselected scenes will be kept as-is.
              </p>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">{sceneCount} scenes available</span>
                <button
                  onClick={handleSelectAllScenes}
                  className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {selectedScenes.length === sceneCount ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: sceneCount }, (_, i) => i + 1).map(sceneNum => (
                  <button
                    key={sceneNum}
                    onClick={() => handleToggleScene(sceneNum)}
                    className={`
                      p-3 rounded-lg border transition-all text-sm font-medium
                      ${selectedScenes.includes(sceneNum)
                        ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                        : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:border-slate-500'
                      }
                    `}
                  >
                    Scene {sceneNum}
                  </button>
                ))}
              </div>
              
              {selectedScenes.length > 0 && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
                  <p className="text-xs text-cyan-300">
                    <strong>{selectedScenes.length}</strong> scene{selectedScenes.length !== 1 ? 's' : ''} selected for regeneration.
                    The AI will maintain continuity with adjacent unchanged scenes.
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-700 flex justify-end gap-3">
              <button
                onClick={handleCancelSceneModal}
                className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSceneRegenerate}
                disabled={selectedScenes.length === 0}
                className="px-4 py-2 rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate {selectedScenes.length} Scene{selectedScenes.length !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
