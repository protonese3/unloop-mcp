import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fingerprint, categorizeError } from "./detection/fingerprint.js";
import { tokenize, jaccardSimilarity, SIMILARITY_THRESHOLD } from "./detection/similarity.js";
import { getEscalationLevel, getEscalationMessage } from "./detection/escalation.js";
import { getStrategies } from "./strategies/registry.js";
import { diagnose } from "./detection/diagnosis.js";
import { SessionStore } from "./session/store.js";
import type { FixAttempt, ErrorCategory, LogFixAttemptResult, LoopStatusResult, ResolveResult } from "./types.js";

function summarizeAttemptHistory(attempts: FixAttempt[]): string[] {
  return attempts.map((a, i) =>
    `#${i + 1}: ${a.fix_description} [${a.error_category}] (${new Date(a.timestamp).toISOString().slice(11, 19)})`
  );
}

export function createServer(): McpServer {
  const store = new SessionStore();

  const server = new McpServer({
    name: "unloop",
    version: "0.1.0",
  });

  server.tool(
    "log_fix_attempt",
    `MANDATORY: Call this EVERY TIME you attempt to fix an error — after every code change, config edit, install command, or any action intended to resolve an error. This tool tracks your attempts and uses fingerprinting + similarity analysis to detect when you're stuck in a loop (repeating the same failing approach with minor variations).

HOW IT WORKS: The tool normalizes your error message into a fingerprint and compares your fix description against previous attempts. If you've tried the same error 3+ times, it escalates with increasing urgency (NUDGE → WARNING → CRITICAL) and provides concrete escape strategies.

WHAT TO DO WITH THE RESPONSE:
- "NONE": Continue normally, the tool is just tracking.
- "NUDGE": You're starting to loop. Change your approach NOW — read the strategies.
- "WARNING": Confirmed loop. STOP coding. Revert changes. Follow the strategies.
- "CRITICAL": STOP IMMEDIATELY. Revert everything. Ask the user for help.

IMPORTANT: The quality of detection depends on your fix_description. Be specific about WHAT you changed and WHY — not just "fixed the error". Example: "Changed import from relative './utils' to absolute '@/lib/utils' because tsconfig paths are configured for @ alias".`,
    {
      error_message: z.string().min(1).describe("The complete error message or most significant portion. Include error type, message body, and relevant stack trace lines — not just the first line."),
      files_involved: z.array(z.string().min(1)).min(1).describe("Every file you modified as part of this fix — source files, config files, test files, lockfiles."),
      fix_description: z.string().min(1).describe("Specific description of WHAT you changed and WHY you think it will fix the error. Include how this differs from previous attempts if applicable. Vague descriptions like 'fixed the error' defeat the similarity detection."),
      session_id: z.string().optional().describe("Optional session ID to isolate tracking for parallel tasks. Defaults to 'default'."),
    },
    async ({ error_message, files_involved, fix_description, session_id }) => {
      const sid = session_id ?? "default";
      const fp = fingerprint(error_message);
      const category = categorizeError(error_message);
      const tokens = tokenize(fix_description);

      const attempt: FixAttempt = {
        error_message,
        error_fingerprint: fp,
        error_category: category,
        files_involved,
        fix_description,
        fix_tokens: tokens,
        timestamp: Date.now(),
      };

      const fpCount = store.addAttempt(sid, attempt);
      const level = getEscalationLevel(fpCount);
      store.updateLevel(sid, level);

      const sameErrorAttempts = store.getAttemptsForFingerprint(sid, fp);
      const previousAttempts = sameErrorAttempts.slice(0, -1);
      let similarCount = 0;
      let maxSimilarity = 0;
      for (const prev of previousAttempts) {
        const sim = jaccardSimilarity(prev.fix_tokens, tokens);
        if (sim >= SIMILARITY_THRESHOLD) similarCount++;
        if (sim > maxSimilarity) maxSimilarity = sim;
      }
      maxSimilarity = Math.round(maxSimilarity * 100) / 100;

      const strategies = getStrategies(level, category);
      const message = getEscalationMessage(level, fpCount);
      const diag = diagnose(sameErrorAttempts, category, level);

      const result: LogFixAttemptResult = {
        status: level === "NONE" ? "ok" : "loop_detected",
        loop_level: level,
        attempt_number: fpCount,
        similar_attempts: similarCount,
        max_similarity: maxSimilarity,
        message,
        error_category: category,
        diagnosis: diag,
        strategies: strategies.length > 0 ? strategies : undefined,
        previous_attempts: fpCount > 1 ? summarizeAttemptHistory(previousAttempts) : undefined,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "check_loop_status",
    `Read-only status check — see if you're currently in a fix loop WITHOUT logging a new attempt. Use this BEFORE starting a complex multi-file fix to see if you should change approach first. Also useful for decision-making: "Am I already in a loop? Should I try a different strategy?"

Returns the current escalation level, attempt count, and strategies if in a loop. Does NOT increment any counters.`,
    {
      session_id: z.string().optional().describe("Session ID to check. Defaults to 'default'."),
    },
    async ({ session_id }) => {
      const sid = session_id ?? "default";
      const session = store.get(sid);

      const attempts = session.attempts;
      const result: LoopStatusResult = {
        loop_level: session.current_level,
        attempt_number: attempts.length,
        similar_attempts: 0,
        message: session.current_level === "NONE"
          ? `No loop detected. ${attempts.length} total attempt(s) tracked this session.`
          : getEscalationMessage(session.current_level, attempts.length),
        previous_attempts: attempts.length > 0 ? summarizeAttemptHistory(attempts) : undefined,
      };

      if (session.current_level !== "NONE" && attempts.length > 0) {
        const lastAttempt = attempts[attempts.length - 1];
        result.strategies = getStrategies(session.current_level, lastAttempt.error_category);
        result.diagnosis = diagnose(attempts, lastAttempt.error_category, session.current_level);
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_escape_strategies",
    `Get concrete, actionable strategies to escape a fix loop. Each strategy includes a title, specific steps to execute, and reasoning for why it helps.

Strategies are matched to your error category (syntax, type, import, build, test, runtime) and escalation level. Higher levels get more aggressive strategies (e.g., CRITICAL includes "revert everything" and "ask the user").

Call this when you want strategy suggestions without logging a new attempt — for example, when planning your next move after a NUDGE alert.`,
    {
      error_category: z.enum(["syntax", "type", "import", "build", "test", "runtime", "config", "unknown"]).optional().describe("Error category for targeted strategies. Auto-detected from your last logged attempt if omitted."),
      session_id: z.string().optional().describe("Session ID. Defaults to 'default'."),
    },
    async ({ error_category, session_id }) => {
      const sid = session_id ?? "default";
      const session = store.get(sid);

      let category: ErrorCategory = error_category ?? "unknown";
      if (!error_category && session.attempts.length > 0) {
        category = session.attempts[session.attempts.length - 1].error_category;
      }

      const level = session.current_level === "NONE" ? "NUDGE" : session.current_level;
      const strategies = getStrategies(level, category);

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ strategies, error_category: category, loop_level: level }, null, 2),
        }],
      };
    }
  );

  server.tool(
    "resolve_loop",
    `Call this when the error you were working on is FIXED — the build passes, the test passes, or the runtime error is gone. This resets all loop tracking counters for the session so the next error starts with a clean slate.

IMPORTANT: Always call this after resolving an error, especially one you were looping on. If you skip this, the next unrelated error may trigger false loop alerts because the stale attempt history is still active.`,
    {
      session_id: z.string().optional().describe("Session ID to resolve. Defaults to 'default'."),
    },
    async ({ session_id }) => {
      const sid = session_id ?? "default";
      const total = store.resolve(sid);

      const result: ResolveResult = {
        status: "resolved",
        total_attempts: total,
      };

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
