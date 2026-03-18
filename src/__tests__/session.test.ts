import { SessionStore } from "../session/store.js";
import type { FixAttempt } from "../types.js";

function makeAttempt(overrides: Partial<FixAttempt> = {}): FixAttempt {
  return {
    error_message: "TypeError: x is undefined",
    error_fingerprint: "abc123",
    error_category: "type",
    files_involved: ["src/app.ts"],
    fix_description: "Add null check",
    fix_tokens: new Set(["add", "null", "check"]),
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it("creates a new session on first get", () => {
    const session = store.get("test");
    expect(session.id).toBe("test");
    expect(session.attempts).toHaveLength(0);
    expect(session.current_level).toBe("NONE");
    expect(session.resolved).toBe(false);
  });

  it("returns the same session on subsequent gets", () => {
    const s1 = store.get("test");
    const s2 = store.get("test");
    expect(s1).toBe(s2);
  });

  it("tracks attempts and increments fingerprint count", () => {
    const count1 = store.addAttempt("s1", makeAttempt());
    expect(count1).toBe(1);

    const count2 = store.addAttempt("s1", makeAttempt());
    expect(count2).toBe(2);

    expect(store.get("s1").attempts).toHaveLength(2);
  });

  it("tracks different fingerprints separately", () => {
    store.addAttempt("s1", makeAttempt({ error_fingerprint: "aaa" }));
    store.addAttempt("s1", makeAttempt({ error_fingerprint: "bbb" }));
    const count = store.addAttempt("s1", makeAttempt({ error_fingerprint: "aaa" }));
    expect(count).toBe(2);
  });

  it("resolves and resets counters", () => {
    store.addAttempt("s1", makeAttempt());
    store.addAttempt("s1", makeAttempt());
    store.addAttempt("s1", makeAttempt());

    const total = store.resolve("s1");
    expect(total).toBe(3);

    const session = store.get("s1");
    expect(session.attempts).toHaveLength(0);
    expect(session.current_level).toBe("NONE");
    expect(session.resolved).toBe(true);
  });

  it("filters attempts by fingerprint", () => {
    store.addAttempt("s1", makeAttempt({ error_fingerprint: "aaa" }));
    store.addAttempt("s1", makeAttempt({ error_fingerprint: "bbb" }));
    store.addAttempt("s1", makeAttempt({ error_fingerprint: "aaa" }));

    const filtered = store.getAttemptsForFingerprint("s1", "aaa");
    expect(filtered).toHaveLength(2);
  });

  it("isolates sessions", () => {
    store.addAttempt("s1", makeAttempt());
    store.addAttempt("s2", makeAttempt());

    expect(store.get("s1").attempts).toHaveLength(1);
    expect(store.get("s2").attempts).toHaveLength(1);
  });
});
