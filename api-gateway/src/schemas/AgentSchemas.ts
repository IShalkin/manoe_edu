/**
 * Zod Schemas for Agent Outputs
 * 
 * Validates LLM outputs from all agents to ensure data quality and type safety
 */

import { z } from "zod";

/**
 * Theme schema - can be a string or an object with name/description
 */
const ThemeSchema = z.union([
  z.string(),
  z.object({
    name: z.string().optional(),
    theme: z.string().optional(),
    description: z.string().optional(),
    exploration: z.string().optional(),
  }).passthrough(),
]);

/**
 * Arc schema - can be a string or a structured object
 */
const ArcSchema = z.union([
  z.string(),
  z.object({
    structure: z.string().optional(),
    type: z.string().optional(),
    acts: z.array(z.unknown()).optional(),
    setup: z.string().optional(),
    confrontation: z.string().optional(),
    resolution: z.string().optional(),
  }).passthrough(),
]);

/**
 * Narrative schema (from ArchitectAgent - Genesis phase)
 * Flexible to handle various LLM output formats
 */
export const NarrativeSchema = z.object({
  premise: z.string().min(1),
  hook: z.string().min(1),
  themes: z.union([
    z.array(ThemeSchema).min(1),
    z.object({}).passthrough(), // Allow object format for themes
  ]),
  arc: ArcSchema,
  tone: z.union([z.string(), z.object({}).passthrough()]),
  audience: z.union([z.string(), z.object({}).passthrough()]).optional(),
  genre: z.union([z.string(), z.object({}).passthrough()]).optional(),
});

/**
 * Character schema (from ProfilerAgent - Characters phase)
 * Made flexible to handle various LLM output formats
 */
export const CharacterSchema = z.object({
  name: z.string().min(1),
  // Accept both lowercase and title case roles
  role: z.string().transform((val) => val.toLowerCase()).pipe(
    z.enum(["protagonist", "antagonist", "supporting"])
  ).or(z.string()), // Fallback to any string if transform fails
  archetype: z.string().optional(),
  // Make motivation optional since LLM doesn't always return it
  motivation: z.string().optional(),
  psychology: z.object({
    wound: z.string().optional(),
    innerTrap: z.string().optional(),
    arc: z.string().optional(),
  }).passthrough().optional(),
  backstory: z.string().optional(),
  visual: z.string().optional(),
  voice: z.string().optional(),
  // Accept string, array, or object for relationships (LLM returns various formats)
  relationships: z.union([
    z.string(),
    z.array(z.string()),
    z.record(z.unknown()),
  ]).optional(),
}).passthrough(); // Allow additional fields from LLM

/**
 * Characters array schema
 */
export const CharactersArraySchema = z.array(CharacterSchema).min(1);

/**
 * Worldbuilding schema (from WorldbuilderAgent)
 */
export const WorldbuildingSchema = z.object({
  geography: z.record(z.unknown()).optional(),
  timePeriod: z.string().optional(),
  technology: z.string().optional(),
  socialStructures: z.record(z.unknown()).optional(),
  culture: z.record(z.unknown()).optional(),
  economy: z.string().optional(),
  magic: z.record(z.unknown()).optional(),
  history: z.string().optional(),
  sensory: z.record(z.unknown()).optional(),
});

/**
 * Outline schema (from StrategistAgent - Outlining phase)
 */
export const OutlineSchema = z.object({
  scenes: z.array(z.object({
    sceneNumber: z.number().optional(),
    title: z.string().min(1),
    setting: z.string().optional(),
    characters: z.array(z.string()).optional(),
    goal: z.string().optional(),
    conflict: z.string().optional(),
    emotionalBeat: z.string().optional(),
    dialogue: z.string().optional(),
    hook: z.string().optional(),
    wordCount: z.number().optional(),
  })).min(1),
});

/**
 * Advanced Plan schema (from StrategistAgent - Advanced Planning phase)
 */
export const AdvancedPlanSchema = z.object({
  motifs: z.record(z.unknown()).optional(),
  subtext: z.record(z.unknown()).optional(),
  emotionalBeats: z.record(z.unknown()).optional(),
  sensory: z.record(z.unknown()).optional(),
  contradictions: z.record(z.unknown()).optional(),
  deepening: z.record(z.unknown()).optional(),
  complexity: z.record(z.unknown()).optional(),
});

/**
 * Critique schema (from CriticAgent)
 */
export const CritiqueSchema = z.object({
  approved: z.boolean().optional(),
  score: z.number().min(1).max(10).optional(),
  revision_needed: z.boolean().optional(),
  strengths: z.array(z.string()).optional(),
  issues: z.array(z.string()).optional(),
  revisionRequests: z.array(z.string()).optional(),
});

/**
 * Originality Report schema (from OriginalityAgent)
 */
export const OriginalityReportSchema = z.object({
  originality_score: z.number().min(1).max(10),
  cliches_found: z.array(z.string()),
  suggestions: z.array(z.string()),
});

/**
 * Impact Report schema (from ImpactAgent)
 */
export const ImpactReportSchema = z.object({
  impact_score: z.number().min(1).max(10),
  emotional_beats: z.array(z.string()),
  engagement_level: z.enum(["high", "medium", "low"]),
  recommendations: z.array(z.string()),
});

/**
 * Archivist Output schema (from ArchivistAgent)
 */
export const ArchivistOutputSchema = z.object({
  constraints: z.array(z.object({
    key: z.string().min(1),
    value: z.string().min(1),
    sceneNumber: z.number(),
    reasoning: z.string().optional(),
  })).optional(),
  conflicts_resolved: z.array(z.string()).optional(),
  discarded_facts: z.array(z.string()).optional(),
});

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(
    public readonly zodError: z.ZodError,
    public readonly agentType: string
  ) {
    super(`Validation failed for ${agentType}: ${zodError.message}`);
    this.name = "ValidationError";
  }
}

