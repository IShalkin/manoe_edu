/**
 * Dialogue Bubble Component
 * 
 * Animated dialogue bubble for agent communication
 */

import { motion, AnimatePresence } from "framer-motion";
import { AgentType } from "../../types/agent";

interface DialogueBubbleProps {
  from: AgentType;
  to?: AgentType;
  message: string;
  type: "question" | "objection" | "approval" | "suggestion" | "thought";
  timestamp?: string;
}

const TYPE_COLORS = {
  question: "bg-blue-100 border-blue-300",
  objection: "bg-red-100 border-red-300",
  approval: "bg-green-100 border-green-300",
  suggestion: "bg-yellow-100 border-yellow-300",
  thought: "bg-gray-100 border-gray-300",
};

const TYPE_ICONS = {
  question: "❓",
  objection: "⚠️",
  approval: "✅",
  suggestion: "💡",
  thought: "💭",
};

export function DialogueBubble({ from, to, message, type, timestamp }: DialogueBubbleProps) {
  const colorClass = TYPE_COLORS[type];
  const icon = TYPE_ICONS[type];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`
          ${colorClass}
          border-2 rounded-lg p-3 mb-2 max-w-md
          shadow-md
        `}
      >
        <div className="flex items-start gap-2">
          <span className="text-lg">{icon}</span>
          <div className="flex-1">
            <div className="text-xs font-semibold text-gray-600 mb-1">
              {from} {to && `→ ${to}`}
            </div>
            <div className="text-sm text-gray-800">{message}</div>
            {timestamp && (
              <div className="text-xs text-gray-500 mt-1">{timestamp}</div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

