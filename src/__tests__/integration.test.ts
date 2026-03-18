import { SessionStore } from "../session/store.js";
import { fingerprint, categorizeError } from "../detection/fingerprint.js";
import { tokenize, jaccardSimilarity, SIMILARITY_THRESHOLD } from "../detection/similarity.js";
import { getEscalationLevel, getEscalationMessage } from "../detection/escalation.js";
import { getStrategies } from "../strategies/registry.js";
import type { FixAttempt, LogFixAttemptResult } from "../types.js";

function simulateLogFixAttempt(
  store: SessionStore,
  sessionId: string,
  errorMessage: string,
  files: string[],
  fixDesc: string
): LogFixAttemptResult {
  const fp = fingerprint(errorMessage);
  const category = categorizeError(errorMessage);
  const tokens = tokenize(fixDesc);

  const attempt: FixAttempt = {
    error_message: errorMessage,
    error_fingerprint: fp,
    error_category: category,
    files_involved: files,
    fix_description: fixDesc,
    fix_tokens: tokens,
    timestamp: Date.now(),
  };

  const fpCount = store.addAttempt(sessionId, attempt);
  const level = getEscalationLevel(fpCount);
  store.updateLevel(sessionId, level);

  const previousAttempts = store.getAttemptsForFingerprint(sessionId, fp).slice(0, -1);
  const similarCount = previousAttempts.filter(
    prev => jaccardSimilarity(prev.fix_tokens, tokens) >= SIMILARITY_THRESHOLD
  ).length;

  const strategies = getStrategies(level, category);
  const message = getEscalationMessage(level, fpCount);

  return {
    status: level === "NONE" ? "ok" : "loop_detected",
    loop_level: level,
    attempt_number: fpCount,
    similar_attempts: similarCount,
    message,
    strategies: strategies.length > 0 ? strategies : undefined,
  };
}

describe("full loop simulation", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it("escalates through all levels on repeated same-error fixes", () => {
    const error = "TypeError: Cannot read properties of undefined (reading 'map')";
    const files = ["src/App.tsx"];

    // Attempts 1-2: NONE
    let r = simulateLogFixAttempt(store, "s1", error, files, "Add optional chaining before .map()");
    expect(r.loop_level).toBe("NONE");
    expect(r.status).toBe("ok");

    r = simulateLogFixAttempt(store, "s1", error, files, "Add null check with optional chaining for the array");
    expect(r.loop_level).toBe("NONE");

    // Attempt 3: NUDGE
    r = simulateLogFixAttempt(store, "s1", error, files, "Try adding a default empty array with nullish coalescing");
    expect(r.loop_level).toBe("NUDGE");
    expect(r.status).toBe("loop_detected");
    expect(r.strategies).toBeDefined();
    expect(r.strategies!.length).toBeGreaterThan(0);

    // Attempt 4: still NUDGE
    r = simulateLogFixAttempt(store, "s1", error, files, "Initialize the variable as empty array in useState");
    expect(r.loop_level).toBe("NUDGE");

    // Attempt 5: WARNING
    r = simulateLogFixAttempt(store, "s1", error, files, "Wrap the map call in a try-catch block");
    expect(r.loop_level).toBe("WARNING");
    expect(r.message).toContain("STOP");

    // Attempt 6: still WARNING
    r = simulateLogFixAttempt(store, "s1", error, files, "Add a guard clause returning null if data is falsy");
    expect(r.loop_level).toBe("WARNING");

    // Attempt 7: CRITICAL
    r = simulateLogFixAttempt(store, "s1", error, files, "Move the map call into a useEffect hook");
    expect(r.loop_level).toBe("CRITICAL");
    expect(r.message).toContain("CRITICAL");
    expect(r.strategies!.some(s => s.action.toLowerCase().includes("revert"))).toBe(true);
  });

  it("tracks similar attempts correctly", () => {
    const error = "Cannot find module './utils'";
    const files = ["src/index.ts"];

    simulateLogFixAttempt(store, "s1", error, files, "Add missing import for utils module");
    simulateLogFixAttempt(store, "s1", error, files, "Add the missing import for the utils module at top");

    const r = simulateLogFixAttempt(store, "s1", error, files, "Fix missing import for utils module file");
    // All three are similar (import + utils + missing), so similar_attempts should be > 0
    expect(r.similar_attempts).toBeGreaterThan(0);
  });

  it("does not escalate for different errors", () => {
    const files = ["src/app.ts"];

    simulateLogFixAttempt(store, "s1", "TypeError: x is not a function", files, "Fix type of x");
    simulateLogFixAttempt(store, "s1", "SyntaxError: Unexpected token", files, "Fix missing bracket");
    const r = simulateLogFixAttempt(store, "s1", "ReferenceError: y is not defined", files, "Define variable y");

    expect(r.loop_level).toBe("NONE");
    expect(store.get("s1").attempts).toHaveLength(3);
  });

  it("resets after resolve", () => {
    const error = "TypeError: null pointer";
    const files = ["src/main.ts"];

    for (let i = 0; i < 5; i++) {
      simulateLogFixAttempt(store, "s1", error, files, `Fix attempt ${i}`);
    }
    expect(store.get("s1").current_level).toBe("WARNING");

    store.resolve("s1");

    const r = simulateLogFixAttempt(store, "s1", error, files, "New attempt after resolve");
    expect(r.loop_level).toBe("NONE");
    expect(r.attempt_number).toBe(1);
  });

  it("isolates parallel sessions", () => {
    const error = "ImportError: no module named foo";
    const files = ["main.py"];

    for (let i = 0; i < 5; i++) {
      simulateLogFixAttempt(store, "task-a", error, files, `Install foo attempt ${i}`);
    }

    const r = simulateLogFixAttempt(store, "task-b", error, files, "Install foo");
    expect(r.loop_level).toBe("NONE");
    expect(store.get("task-a").current_level).toBe("WARNING");
  });

  it("handles same error on different paths producing same fingerprint", () => {
    const files = ["src/a.ts"];

    const r1 = simulateLogFixAttempt(store, "s1",
      "Cannot find module './Button' from '/Users/alice/project/src/a.ts:5'",
      files, "Fix import path"
    );
    const r2 = simulateLogFixAttempt(store, "s1",
      "Cannot find module './Button' from '/Users/bob/project/src/b.ts:12'",
      files, "Fix import path again"
    );
    const r3 = simulateLogFixAttempt(store, "s1",
      "Cannot find module './Button' from 'C:\\Work\\project\\src\\c.ts:3'",
      files, "Fix import path once more"
    );

    // All three should match the same fingerprint → NUDGE at attempt 3
    expect(r3.loop_level).toBe("NUDGE");
  });
});
