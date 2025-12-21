import { useState } from 'react';
import type { NarrativePossibility, NarrativePossibilitiesRecommendation } from '../types';

// Tone color mapping
const TONE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  dark: { bg: 'bg-slate-700/50', text: 'text-slate-300', border: 'border-slate-600' },
  hopeful: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', border: 'border-emerald-700' },
  bittersweet: { bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-700' },
  intense: { bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-700' },
  contemplative: { bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-700' },
};

// Conflict type labels
const CONFLICT_TYPE_LABELS: Record<string, string> = {
  vs_nature: 'vs. Nature',
  vs_society: 'vs. Society',
  vs_self: 'vs. Self',
  vs_other: 'vs. Other',
};

interface NarrativePossibilitiesSelectorProps {
  possibilities: NarrativePossibility[];
  recommendation?: NarrativePossibilitiesRecommendation;
  onSelect: (possibility: NarrativePossibility) => void;
  isLoading?: boolean;
}

export function NarrativePossibilitiesSelector({
  possibilities,
  recommendation,
  onSelect,
  isLoading = false,
}: NarrativePossibilitiesSelectorProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleSelect = (possibility: NarrativePossibility) => {
    setSelectedId(possibility.id);
  };

  const handleConfirm = () => {
    const selected = possibilities.find(p => p.id === selectedId);
    if (selected) {
      onSelect(selected);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  if (possibilities.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <p className="text-slate-400 font-medium">Generating narrative possibilities...</p>
        <p className="text-sm text-slate-500 mt-1">The Architect is exploring different story directions</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-1">Choose Your Narrative Direction</h2>
            <p className="text-slate-400">
              The Architect has generated {possibilities.length} distinct story directions based on your seed idea. 
              Each explores a different interpretation with unique themes, conflicts, and tones.
            </p>
          </div>
        </div>

        {/* Recommendation */}
        {recommendation && recommendation.rationale && (
          <div className="mt-4 p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-blue-400">Architect's Recommendation: Option {recommendation.preferred_id}</p>
                <p className="text-sm text-slate-400 mt-1">{recommendation.rationale}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Possibilities Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {possibilities.map((possibility) => {
          const isSelected = selectedId === possibility.id;
          const isExpanded = expandedId === possibility.id;
          const isRecommended = recommendation?.preferred_id === possibility.id;
          const toneColors = TONE_COLORS[possibility.estimated_tone] || TONE_COLORS.dark;

          return (
            <div
              key={possibility.id}
              className={`relative bg-slate-800/50 border rounded-xl overflow-hidden transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'border-cyan-500 ring-2 ring-cyan-500/30'
                  : 'border-slate-700 hover:border-slate-600'
              }`}
              onClick={() => handleSelect(possibility)}
            >
              {/* Recommended Badge */}
              {isRecommended && (
                <div className="absolute top-3 right-3 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded-full">
                  Recommended
                </div>
              )}

              {/* Header */}
              <div className="p-4 border-b border-slate-700">
                <div className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${toneColors.bg} ${toneColors.border} border flex items-center justify-center flex-shrink-0`}>
                    <span className={`text-sm font-bold ${toneColors.text}`}>{possibility.id}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{possibility.title}</h3>
                    <p className="text-sm text-slate-400">{possibility.genre_approach}</p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-4 space-y-3">
                {/* Plot Summary */}
                <div>
                  <p className={`text-sm text-slate-300 ${isExpanded ? '' : 'line-clamp-3'}`}>
                    {possibility.plot_summary}
                  </p>
                  {possibility.plot_summary.length > 150 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(possibility.id);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 mt-1"
                    >
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-0.5 text-xs rounded-full ${toneColors.bg} ${toneColors.text} ${toneColors.border} border`}>
                    {possibility.estimated_tone}
                  </span>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700/50 text-slate-400 border border-slate-600">
                    {CONFLICT_TYPE_LABELS[possibility.conflict_type] || possibility.conflict_type}
                  </span>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="pt-3 border-t border-slate-700 space-y-3">
                    {/* Setting */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Setting</p>
                      <p className="text-sm text-slate-400">{possibility.setting_description}</p>
                    </div>

                    {/* Main Conflict */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Main Conflict</p>
                      <p className="text-sm text-slate-400">{possibility.main_conflict}</p>
                    </div>

                    {/* Themes */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Themes</p>
                      <div className="flex flex-wrap gap-1">
                        {possibility.thematic_elements.map((theme, i) => (
                          <span key={i} className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Unique Appeal */}
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">What Makes It Unique</p>
                      <p className="text-sm text-slate-400">{possibility.unique_appeal}</p>
                    </div>

                    {/* Potential Characters */}
                    {possibility.potential_characters.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Potential Characters</p>
                        <div className="flex flex-wrap gap-1">
                          {possibility.potential_characters.map((char, i) => (
                            <span key={i} className="px-2 py-0.5 text-xs rounded bg-slate-700/50 text-slate-400">
                              {char}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute inset-0 pointer-events-none border-2 border-cyan-500 rounded-xl" />
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm Button */}
      <div className="flex justify-center">
        <button
          onClick={handleConfirm}
          disabled={selectedId === null || isLoading}
          className={`px-8 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 ${
            selectedId !== null && !isLoading
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-400 hover:to-blue-500 shadow-lg shadow-cyan-500/25'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Starting Generation...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Continue with Selected Direction
            </>
          )}
        </button>
      </div>
    </div>
  );
}
