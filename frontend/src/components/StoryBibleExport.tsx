import { useState } from 'react';

interface ArtifactData {
  phase: string;
  artifactType: string;
  content: Record<string, unknown>;
  createdAt?: string;
}

interface StoryBibleExportProps {
  projectName: string;
  seedIdea: string;
  artifacts: ArtifactData[];
  agentOutputs?: Record<string, string>;
  onClose?: () => void;
}

export function StoryBibleExport({ 
  projectName, 
  seedIdea, 
  artifacts, 
  agentOutputs,
  onClose 
}: StoryBibleExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<'markdown' | 'json' | 'html'>('markdown');

  const formatContentAsMarkdown = (content: unknown, depth = 0): string => {
    if (content === null || content === undefined) return '';
    
    if (typeof content === 'string') return content;
    
    if (Array.isArray(content)) {
      if (content.length === 0) return '';
      if (content.every(item => typeof item === 'string')) {
        return content.map(item => `- ${item}`).join('\n');
      }
      return content.map((item, i) => `### Item ${i + 1}\n${formatContentAsMarkdown(item, depth + 1)}`).join('\n\n');
    }
    
    if (typeof content === 'object') {
      const obj = content as Record<string, unknown>;
      const sections: string[] = [];
      
      for (const [key, val] of Object.entries(obj)) {
        if (val === null || val === undefined || val === '') continue;
        
        const title = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const formatted = formatContentAsMarkdown(val, depth + 1);
        
        if (formatted) {
          const prefix = '#'.repeat(Math.min(depth + 3, 6));
          sections.push(`${prefix} ${title}\n\n${formatted}`);
        }
      }
      
      return sections.join('\n\n');
    }
    
    return String(content);
  };

  const generateMarkdown = (): string => {
    const sections: string[] = [];
    
    sections.push(`# Story Bible: ${projectName}`);
    sections.push(`\n*Generated on ${new Date().toLocaleDateString()}*\n`);
    
    sections.push(`## Seed Idea\n\n${seedIdea}\n`);
    
    const phaseOrder = ['genesis', 'characters', 'worldbuilding', 'outlining', 'motif_layer', 'advanced_planning', 'drafting', 'polish'];
    const phaseLabels: Record<string, string> = {
      genesis: 'Genesis (Story Foundation)',
      characters: 'Character Profiles',
      worldbuilding: 'World Building',
      outlining: 'Story Outline',
      motif_layer: 'Motif & Symbol Layer',
      advanced_planning: 'Advanced Planning',
      drafting: 'Draft Scenes',
      polish: 'Polish & Refinement',
    };
    
    const artifactsByPhase = new Map<string, ArtifactData[]>();
    artifacts.forEach(artifact => {
      const phase = artifact.phase.toLowerCase();
      if (!artifactsByPhase.has(phase)) {
        artifactsByPhase.set(phase, []);
      }
      artifactsByPhase.get(phase)!.push(artifact);
    });
    
    for (const phase of phaseOrder) {
      const phaseArtifacts = artifactsByPhase.get(phase);
      if (!phaseArtifacts || phaseArtifacts.length === 0) continue;
      
      const phaseLabel = phaseLabels[phase] || phase.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      sections.push(`\n---\n\n## ${phaseLabel}\n`);
      
      for (const artifact of phaseArtifacts) {
        const artifactLabel = artifact.artifactType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        sections.push(`### ${artifactLabel}\n`);
        sections.push(formatContentAsMarkdown(artifact.content));
      }
    }
    
    if (agentOutputs && Object.keys(agentOutputs).length > 0) {
      sections.push(`\n---\n\n## Agent Outputs\n`);
      
      for (const [agentName, output] of Object.entries(agentOutputs)) {
        if (output && output.trim()) {
          sections.push(`### ${agentName}\n\n${output}\n`);
        }
      }
    }
    
    return sections.join('\n');
  };

  const generateJSON = (): string => {
    return JSON.stringify({
      projectName,
      seedIdea,
      exportedAt: new Date().toISOString(),
      artifacts,
      agentOutputs,
    }, null, 2);
  };

  const generateHTML = (): string => {
    const markdown = generateMarkdown();
    const htmlContent = markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^\*(.+)\*$/gm, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n---\n/g, '<hr/>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br/>');
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Story Bible: ${projectName}</title>
  <style>
    body { font-family: Georgia, serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; color: #333; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #4a4e69; padding-bottom: 0.5rem; }
    h2 { color: #22223b; margin-top: 2rem; }
    h3 { color: #4a4e69; }
    hr { border: none; border-top: 1px solid #c9ada7; margin: 2rem 0; }
    li { margin-left: 1.5rem; }
    em { color: #666; }
  </style>
</head>
<body>
  <p>${htmlContent}</p>
</body>
</html>`;
  };

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      let content: string;
      let filename: string;
      let mimeType: string;
      
      switch (exportFormat) {
        case 'markdown':
          content = generateMarkdown();
          filename = `${projectName.replace(/\s+/g, '_')}_story_bible.md`;
          mimeType = 'text/markdown';
          break;
        case 'json':
          content = generateJSON();
          filename = `${projectName.replace(/\s+/g, '_')}_story_bible.json`;
          mimeType = 'application/json';
          break;
        case 'html':
          content = generateHTML();
          filename = `${projectName.replace(/\s+/g, '_')}_story_bible.html`;
          mimeType = 'text/html';
          break;
      }
      
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const totalArtifacts = artifacts.length;
  const phases = new Set(artifacts.map(a => a.phase)).size;

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">Story Bible Export</h3>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <p className="text-sm text-slate-400 mb-4">
        Export all story artifacts into a single document for reference or sharing.
      </p>

      <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Project:</span>
            <span className="text-slate-200 ml-2">{projectName}</span>
          </div>
          <div>
            <span className="text-slate-500">Phases:</span>
            <span className="text-slate-200 ml-2">{phases}</span>
          </div>
          <div>
            <span className="text-slate-500">Artifacts:</span>
            <span className="text-slate-200 ml-2">{totalArtifacts}</span>
          </div>
          <div>
            <span className="text-slate-500">Agent Outputs:</span>
            <span className="text-slate-200 ml-2">{agentOutputs ? Object.keys(agentOutputs).length : 0}</span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-300 mb-2">Export Format</label>
        <div className="flex gap-2">
          {(['markdown', 'json', 'html'] as const).map((format) => (
            <button
              key={format}
              onClick={() => setExportFormat(format)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                exportFormat === format
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {format.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {exportFormat === 'markdown' && 'Best for editing and version control'}
          {exportFormat === 'json' && 'Best for importing into other tools'}
          {exportFormat === 'html' && 'Best for viewing in browser or printing'}
        </p>
      </div>

      <button
        onClick={handleExport}
        disabled={isExporting || totalArtifacts === 0}
        className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-medium hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isExporting ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Exporting...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Story Bible
          </>
        )}
      </button>

      {totalArtifacts === 0 && (
        <p className="text-sm text-amber-400 mt-3 text-center">
          No artifacts available yet. Generate your story first.
        </p>
      )}
    </div>
  );
}

export default StoryBibleExport;
