import { normalizeError, fingerprint, categorizeError } from "../detection/fingerprint.js";
import { tokenize, jaccardSimilarity } from "../detection/similarity.js";
import { SessionStore } from "../session/store.js";
import type { FixAttempt } from "../types.js";

describe("fingerprint edge cases", () => {
  it("handles empty string", () => {
    const fp = fingerprint("");
    expect(fp).toBeDefined();
    expect(fp.length).toBe(16);
  });

  it("handles very long error messages", () => {
    const longMsg = "TypeError: " + "x".repeat(10000);
    const fp = fingerprint(longMsg);
    expect(fp.length).toBe(16);
  });

  it("handles unicode error messages", () => {
    const fp = fingerprint("エラー: ファイルが見つかりません");
    expect(fp).toBeDefined();
  });

  it("handles error with only paths and numbers", () => {
    const fp1 = fingerprint("/foo/bar.ts:1:2 /baz/qux.ts:3:4");
    const fp2 = fingerprint("/completely/different.ts:99:100 /other/file.ts:50:60");
    expect(fp1).toBe(fp2);
  });

  it("normalizes multiline errors with stack frames", () => {
    const fp1 = fingerprint("TypeError: x is undefined\n  at foo(src/a.ts:1)\n  at bar(src/b.ts:2)");
    const fp2 = fingerprint("TypeError: x is undefined\n  at baz(src/c.ts:5)\n  at qux(src/d.ts:10)");
    expect(fp1).toBe(fp2);
  });

  it("strips ANSI escape codes and produces same fingerprint", () => {
    const fp1 = fingerprint("\x1b[31mTypeError: x is undefined\x1b[0m");
    const fp2 = fingerprint("TypeError: x is undefined");
    expect(fp1).toBe(fp2);
  });
});

describe("similarity edge cases", () => {
  it("handles empty descriptions", () => {
    const a = tokenize("");
    const b = tokenize("fix the bug");
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("handles descriptions that are all stop words", () => {
    const tokens = tokenize("the a an is are was to of in for");
    expect(tokens.size).toBe(0);
  });

  it("handles very long descriptions", () => {
    const long = "fix ".repeat(5000);
    const tokens = tokenize(long);
    expect(tokens.has("fix")).toBe(true);
    expect(tokens.size).toBe(1);
  });
});

describe("categorizeError edge cases", () => {
  it("handles mixed-case errors", () => {
    expect(categorizeError("SYNTAXERROR: Unexpected token")).toBe("syntax");
    expect(categorizeError("TYPEERROR: Cannot read")).toBe("type");
  });

  it("prioritizes first match (syntax before runtime)", () => {
    expect(categorizeError("SyntaxError at runtime: unexpected")).toBe("syntax");
  });

  it("handles multiline error messages", () => {
    const msg = `TypeError: Cannot read properties of undefined
      at Object.<anonymous> (src/index.ts:5:10)
      at Module._compile`;
    expect(categorizeError(msg)).toBe("type");
  });
});

describe("session edge cases", () => {
  let store: SessionStore;
  beforeEach(() => { store = new SessionStore(); });
  afterEach(() => { store.destroy(); });

  it("resolve on empty session returns 0", () => {
    expect(store.resolve("empty")).toBe(0);
  });

  it("handles rapid sequential adds", () => {
    const attempt: FixAttempt = {
      error_message: "err",
      error_fingerprint: "fp1",
      error_category: "unknown",
      files_involved: ["a.ts"],
      fix_description: "fix",
      fix_tokens: new Set(["fix"]),
      timestamp: Date.now(),
    };

    for (let i = 0; i < 100; i++) {
      store.addAttempt("s1", { ...attempt, timestamp: Date.now() + i });
    }
    expect(store.get("s1").attempts).toHaveLength(100);
    expect(store.get("s1").fingerprint_counts.get("fp1")).toBe(100);
  });

  it("double resolve is safe", () => {
    const attempt: FixAttempt = {
      error_message: "err",
      error_fingerprint: "fp1",
      error_category: "unknown",
      files_involved: ["a.ts"],
      fix_description: "fix",
      fix_tokens: new Set(["fix"]),
      timestamp: Date.now(),
    };
    store.addAttempt("s1", attempt);
    store.resolve("s1");
    expect(store.resolve("s1")).toBe(0);
  });
});
