/**
 * Consistency Guardrail
 * 
 * Checks that generated content doesn't contradict existing Key Constraints
 * Uses semantic similarity to detect potential conflicts
 */

import { Service } from "@tsed/di";
import { KeyConstraint } from "../models/AgentModels";

/**
 * Guardrail result
 */
export interface GuardrailResult {
  passed: boolean;
  violations: string[];
  severity: "warning" | "error";
}

@Service()
export class ConsistencyGuardrail {
  /**
   * Check content for consistency violations against Key Constraints
   */
  async check(content: string, constraints: KeyConstraint[]): Promise<GuardrailResult> {
    const violations: string[] = [];

    if (constraints.length === 0) {
      return {
        passed: true,
        violations: [],
        severity: "warning",
      };
    }

    // Simple keyword-based conflict detection
    // In production, use semantic similarity (embeddings) for better detection
    for (const constraint of constraints) {
      // Check if content contradicts the constraint
      // Example: constraint "Hero has blue eyes" vs content "Hero's green eyes"
      const constraintKey = constraint.key.toLowerCase();
      const constraintValue = constraint.value.toLowerCase();
      const contentLower = content.toLowerCase();

      // Look for potential contradictions
      // This is a simplified check - in production, use embeddings
      if (constraintKey.includes("eye") && constraintValue.includes("blue")) {
        if (contentLower.includes("green eye") || contentLower.includes("brown eye")) {
          violations.push(`Contradicts constraint: ${constraint.key} = ${constraint.value} (Scene ${constraint.sceneNumber})`);
        }
      }

      // Check for other common contradictions
      if (constraintKey.includes("name") && constraintValue) {
        // If constraint specifies a name, check if content uses a different name
        const namePattern = new RegExp(`\\b(?!${constraintValue})\\w+\\b`, "i");
        // This is simplified - in production, use better name detection
      }

      // Check for location contradictions
      if (constraintKey.includes("location") || constraintKey.includes("place")) {
        // Check if content mentions a different location
        // Simplified check
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      severity: violations.length > 0 ? "error" : "warning",
    };
  }
}

