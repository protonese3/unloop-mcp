export type EscalationLevel = "NONE" | "NUDGE" | "WARNING" | "CRITICAL";

export type ErrorCategory = "syntax" | "type" | "import" | "build" | "test" | "runtime" | "config" | "unknown";

export interface FixAttempt {
  error_message: string;
  error_fingerprint: string;
  error_category: ErrorCategory;
  files_involved: string[];
  fix_description: string;
  fix_tokens: Set<string>;
  timestamp: number;
}

export interface SessionState {
  id: string;
  attempts: FixAttempt[];
  fingerprint_counts: Map<string, number>;
  current_level: EscalationLevel;
  created_at: number;
  resolved: boolean;
}

export interface EscapeStrategy {
  title: string;
  action: string;
  reasoning: string;
}

export interface Diagnosis {
  pattern: string;
  suggested_action: string;
  what_was_tried: string[];
  what_to_try_next: string;
}

export interface LogFixAttemptResult {
  status: "ok" | "loop_detected";
  loop_level: EscalationLevel;
  attempt_number: number;
  similar_attempts: number;
  max_similarity: number;
  message: string;
  error_category: ErrorCategory;
  diagnosis?: Diagnosis;
  strategies?: EscapeStrategy[];
  previous_attempts?: string[];
}

export interface LoopStatusResult {
  loop_level: EscalationLevel;
  attempt_number: number;
  similar_attempts: number;
  message: string;
  diagnosis?: Diagnosis;
  strategies?: EscapeStrategy[];
  previous_attempts?: string[];
}

export interface ResolveResult {
  status: "resolved";
  total_attempts: number;
}
