/**
 * Zod Schemas for Agent Outputs
 * 
 * EDUCATIONAL NOTE: Zod Schema Validation for LLM Outputs
 * =========================================================
 * 
 * This file demonstrates a critical pattern in AI/LLM applications:
 * validating and normalizing unpredictable LLM outputs into structured data.
 * 
 * KEY CONCEPTS FOR STUDENTS:
 * 
 * 1. LLM OUTPUT VARIABILITY
 *    LLMs don't always return data in the exact format you request.
 *    For example, if you ask for role: "protagonist", the LLM might return:
 *    - "Protagonist" (title case)
 *    - "PROTAGONIST" (uppercase)
 *    - "main character" (synonym)
 *    
 * 2. DEFENSIVE SCHEMA DESIGN
 *    Schemas should be flexible enough to accept reasonable variations
 *    while still enforcing data quality. Use:
 *    - .transform() to normalize values (e.g., lowercase)
 *    - .optional() for fields LLM might skip
 *    - z.union() to accept multiple formats
 *    - .passthrough() to allow extra fields
 *    
 * 3. GRACEFUL DEGRADATION
 *    When validation fails, decide whether to:
 *    - Reject the data entirely (strict mode)
 *    - Accept with warnings (lenient mode)
 *    - Transform to closest valid format (normalization)
 * 
 * @see https://zod.dev/ for Zod documentation
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
 * 
 * EDUCATIONAL NOTE: Handling LLM Output Format Variations
 * ========================================================
 * 
 * This schema demonstrates several techniques for handling unpredictable LLM outputs:
 * 
 * PROBLEM 1: Case Sensitivity
 * ---------------------------
 * We ask for role: "protagonist" but LLM returns "Protagonist" (title case).
 * 
 * SOLUTION: Use .transform() to normalize before validation:
 *   z.string().transform(val => val.toLowerCase()).pipe(z.enum([...]))
 * 
 * The .pipe() chains the transformed value to the enum validator.
 * We also add .or(z.string()) as fallback for unexpected values.
 * 
 * PROBLEM 2: Missing Optional Fields
 * -----------------------------------
 * LLM might skip fields like "motivation" even if we asked for them.
 * 
 * SOLUTION: Use .optional() for fields that aren't strictly required.
 * Better to have partial data than validation failure.
 * 
 * PROBLEM 3: Flexible Data Structures
 * ------------------------------------
 * LLM might return relationships as:
 * - Array: ["friend of Alice", "enemy of Bob"]
 * - Object: { alice: "friend", bob: "enemy" }
 * - String: "Friend of Alice, enemy of Bob"
 * 
 * SOLUTION: Use z.union() to accept multiple formats:
 *   z.union([z.string(), z.array(z.string()), z.record(z.unknown())])
 * 
 * PROBLEM 4: Extra Fields
 * ------------------------
 * LLM might add fields we didn't ask for (e.g., "age", "height").
 * 
 * SOLUTION: Use .passthrough() to allow additional fields without failing.
 */
export const CharacterSchema = z.object({
  name: z.string().min(1),
  // TECHNIQUE: Transform + pipe for case normalization with fallback
  // LLM returns "Protagonist" but we need "protagonist"
  role: z.string().transform((val) => val.toLowerCase()).pipe(
    z.enum(["protagonist", "antagonist", "supporting"])
  ).or(z.string()), // Fallback to any string if transform fails
  archetype: z.string().optional(),
  // TECHNIQUE: Made optional since LLM doesn't always return it
  motivation: z.string().optional(),
  psychology: z.object({
    wound: z.string().optional(),
    innerTrap: z.string().optional(),
    arc: z.string().optional(),
  }).passthrough().optional(),
  backstory: z.string().optional(),
  visual: z.string().optional(),
  voice: z.string().optional(),
  // TECHNIQUE: Union type to accept multiple formats from LLM
  // LLM returns string, array, or object depending on its interpretation
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

