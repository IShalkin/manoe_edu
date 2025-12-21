/**
 * Agent Avatar Component
 * 
 * Visual representation of an agent with state-based animations
 */

import { motion } from "framer-motion";
import { AgentType } from "../../types/agent";

interface AgentAvatarProps {
  agentType: AgentType;
  status: "idle" | "active" | "speaking" | "listening";
  size?: "sm" | "md" | "lg";
}

const AGENT_COLORS: Record<AgentType, string> = {
  architect: "bg-blue-500",
  profiler: "bg-purple-500",
  worldbuilder: "bg-green-500",
  strategist: "bg-yellow-500",
  writer: "bg-orange-500",
  critic: "bg-red-500",
  originality: "bg-pink-500",
  impact: "bg-indigo-500",
  archivist: "bg-gray-500",
};

const AGENT_NAMES: Record<AgentType, string> = {
  architect: "ARCH",
  profiler: "PROF",
  worldbuilder: "WORLD",
  strategist: "STRAT",
  writer: "WRITER",
  critic: "CRITIC",
  originality: "ORIG",
  impact: "IMPACT",
  archivist: "ARCHIV",
};

const SIZE_CLASSES = {
  sm: "w-12 h-12 text-xs",
  md: "w-16 h-16 text-sm",
  lg: "w-24 h-24 text-base",
};

export function AgentAvatar({ agentType, status, size = "md" }: AgentAvatarProps) {
  const colorClass = AGENT_COLORS[agentType];
  const name = AGENT_NAMES[agentType];
  const sizeClass = SIZE_CLASSES[size];

  const getAnimationProps = () => {
    switch (status) {
      case "active":
        return {
          scale: [1, 1.1, 1],
          transition: { repeat: Infinity, duration: 2 },
        };
      case "speaking":
        return {
          scale: [1, 1.15, 1],
          transition: { repeat: Infinity, duration: 1.5 },
        };
      case "listening":
        return {
          opacity: [0.7, 1, 0.7],
          transition: { repeat: Infinity, duration: 1 },
        };
      default:
        return {};
    }
  };

  return (
    <motion.div
      className={`
        ${colorClass} 
        ${sizeClass}
        rounded-full 
        flex items-center justify-center 
        text-white font-bold
        shadow-lg
        ${status === "idle" ? "opacity-50" : ""}
      `}
      animate={getAnimationProps()}
    >
      {name}
    </motion.div>
  );
}

