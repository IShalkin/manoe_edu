/**
 * Content Guardrail
 * 
 * Checks generated content for problematic content (violence, explicit material, etc.)
 * and ensures content adheres to safety guidelines
 */

import { Service } from "@tsed/di";

/**
 * Guardrail result
 */
export interface GuardrailResult {
  passed: boolean;
  violations: string[];
  severity: "warning" | "error";
}

@Service()
export class ContentGuardrail {
  /**
   * Check content for violations
   */
  async check(content: string): Promise<GuardrailResult> {
    const violations: string[] = [];
    
    // Simple keyword-based check (in production, use more sophisticated methods)
    const problematicPatterns = [
      { pattern: /\b(kill|murder|death|violence)\b/gi, severity: "warning" as const, message: "Contains potentially violent content" },
      { pattern: /\b(explicit|adult|nsfw)\b/gi, severity: "error" as const, message: "Contains explicit content" },
    ];

    for (const { pattern, severity, message } of problematicPatterns) {
      if (pattern.test(content)) {
        violations.push(message);
        if (severity === "error") {
          return {
            passed: false,
            violations: [message],
            severity: "error",
          };
        }
      }
    }

    return {
      passed: violations.length === 0,
      violations,
      severity: violations.length > 0 ? "warning" : "warning",
    };
  }
}

