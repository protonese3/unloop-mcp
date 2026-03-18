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
    `You've attempted to fix this same error ${n} times. You are starting to loop. Read the strategies below and try a fundamentally different approach — not another variation of what you've already tried.`,
  WARNING: (n) =>
    `STOP. ${n} failed attempts on the same error. Do NOT write more code. Revert your changes (git stash), then read the strategies below. If they say to read docs or check config, do that BEFORE touching any code.`,
  CRITICAL: (n) =>
    `CRITICAL: ${n} failed attempts. STOP IMMEDIATELY. Revert ALL changes since this error first appeared. Tell the user exactly what you tried and why each attempt failed. Do NOT continue without user direction.`,
};

export function getEscalationMessage(level: EscalationLevel, count: number): string {
  return MESSAGES[level](count);
}
