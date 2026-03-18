import type { EscalationLevel } from "../types.js";

const THRESHOLDS: [number, EscalationLevel][] = [
  [7, "CRITICAL"],
  [5, "WARNING"],
  [3, "NUDGE"],
];

export function getEscalationLevel(sameErrorCount: number): EscalationLevel {
  for (const [threshold, level] of THRESHOLDS) {
    if (sameErrorCount >= threshold) return level;
  }
  return "NONE";
}

const MESSAGES: Record<EscalationLevel, (count: number) => string> = {
  NONE: (n) => `Tracking attempt #${n}. No loop detected.`,
  NUDGE: (n) =>
    `You've attempted to fix this same error ${n} times. Consider a fundamentally different approach instead of incremental variations.`,
  WARNING: (n) =>
    `STOP. You've tried ${n} times with the same error. Do NOT try another incremental fix. You must change your approach entirely. Review the strategies below.`,
  CRITICAL: (n) =>
    `CRITICAL: ${n} failed attempts on the same error. STOP IMMEDIATELY. Do NOT attempt another fix. Revert your changes and ask the user for guidance. Follow the strategies below.`,
};

export function getEscalationMessage(level: EscalationLevel, count: number): string {
  return MESSAGES[level](count);
}
