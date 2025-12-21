import { motion, AnimatePresence } from 'framer-motion';
import type { FactUpdate } from '../../hooks/useGenerationStream';

// Category colors (avoiding purple per user preference)
const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  char: {
    bg: 'bg-emerald-900/30',
    border: 'border-emerald-600/50',
    text: 'text-emerald-400',
    icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  world: {
    bg: 'bg-blue-900/30',
    border: 'border-blue-600/50',
    text: 'text-blue-400',
    icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  plot: {
    bg: 'bg-amber-900/30',
    border: 'border-amber-600/50',
    text: 'text-amber-400',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
};

interface WorldStatePanelProps {
  facts: FactUpdate[];
  currentScene?: number;
}

export function WorldStatePanel({ facts, currentScene }: WorldStatePanelProps) {
  // Group facts by category
  const groupedFacts = facts.reduce((acc, fact) => {
    const category = fact.category || 'plot';
    if (!acc[category]) acc[category] = [];
    acc[category].push(fact);
    return acc;
  }, {} as Record<string, FactUpdate[]>);

  const categoryOrder = ['char', 'world', 'plot'];
  const categoryLabels: Record<string, string> = {
    char: 'Characters',
    world: 'World',
    plot: 'Plot',
  };

  return (
    <div className="h-full flex flex-col bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300">World State</h3>
          {currentScene && (
            <span className="text-xs text-slate-500">Scene {currentScene}</span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5">
          {facts.length} fact{facts.length !== 1 ? 's' : ''} collected
        </p>
      </div>

      {/* Facts list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {facts.length === 0 ? (
          <div className="text-center py-8">
            <svg
              className="w-8 h-8 text-slate-600 mx-auto mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            <p className="text-xs text-slate-500">No facts yet</p>
            <p className="text-xs text-slate-600 mt-1">
              Facts will appear as the story develops
            </p>
          </div>
        ) : (
          categoryOrder.map((category) => {
            const categoryFacts = groupedFacts[category];
            if (!categoryFacts || categoryFacts.length === 0) return null;

            const colors = CATEGORY_COLORS[category];

            return (
              <div key={category} className="space-y-1">
                <div className="flex items-center gap-1.5 px-1">
                  <svg
                    className={`w-3.5 h-3.5 ${colors.text}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={colors.icon}
                    />
                  </svg>
                  <span className={`text-xs font-medium ${colors.text}`}>
                    {categoryLabels[category]}
                  </span>
                  <span className="text-xs text-slate-600">
                    ({categoryFacts.length})
                  </span>
                </div>

                <AnimatePresence mode="popLayout">
                  <ul className="space-y-1">
                    {categoryFacts.map((fact, index) => (
                      <motion.li
                        key={`${fact.subject}-${fact.change}-${index}`}
                        // CRITICAL: layout prop for smooth animations when new facts arrive
                        layout
                        initial={{ opacity: 0, x: -20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        transition={{
                          type: 'spring',
                          stiffness: 500,
                          damping: 30,
                          layout: { duration: 0.2 },
                        }}
                        className={`
                          px-2 py-1.5 rounded border text-xs
                          ${colors.bg} ${colors.border}
                        `}
                      >
                        <span className="font-medium text-slate-200">
                          {fact.subject}
                        </span>
                        <span className="text-slate-400">: </span>
                        <span className="text-slate-300">{fact.change}</span>
                      </motion.li>
                    ))}
                  </ul>
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      {facts.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-700 flex-shrink-0">
          <p className="text-xs text-slate-600 text-center">
            Raw facts from Writer (Archivist will canonicalize)
          </p>
        </div>
      )}
    </div>
  );
}
