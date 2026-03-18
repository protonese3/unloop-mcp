import { diagnose } from "../detection/diagnosis.js";
import type { FixAttempt } from "../types.js";

function makeAttempt(desc: string, category: "import" | "type" | "runtime" | "build" | "test" | "config" | "unknown" = "import"): FixAttempt {
  return {
    error_message: "Error",
    error_fingerprint: "abc",
    error_category: category,
    files_involved: ["a.ts"],
    fix_description: desc,
    fix_tokens: new Set(desc.toLowerCase().split(/\s+/)),
    timestamp: Date.now(),
  };
}

describe("diagnose", () => {
  it("returns undefined for NONE level", () => {
    const attempts = [makeAttempt("fix 1"), makeAttempt("fix 2")];
    expect(diagnose(attempts, "import", "NONE")).toBeUndefined();
  });

  it("returns undefined for single attempt", () => {
    expect(diagnose([makeAttempt("fix")], "import", "NUDGE")).toBeUndefined();
  });

  it("detects repeated path changes for import errors", () => {
    const attempts = [
      makeAttempt("Changed import path from ./Button to ../Button"),
      makeAttempt("Changed import path from ../Button to ../../Button"),
      makeAttempt("Changed import path to absolute path @/components/Button"),
    ];
    const diag = diagnose(attempts, "import", "NUDGE")!;
    expect(diag).toBeDefined();
    expect(diag.pattern).toContain("import");
    expect(diag.suggested_action).toContain("path");
    expect(diag.what_was_tried).toHaveLength(3);
    expect(diag.what_to_try_next.length).toBeGreaterThan(0);
  });

  it("detects repeated type annotations for type errors", () => {
    const attempts = [
      makeAttempt("Added type annotation to useState", "type"),
      makeAttempt("Added explicit type cast as User[]", "type"),
      makeAttempt("Changed generic type parameter on function", "type"),
    ];
    const diag = diagnose(attempts, "type", "NUDGE")!;
    expect(diag.pattern).toContain("type");
    expect(diag.suggested_action.toLowerCase()).toContain("runtime");
  });

  it("detects repeated null checks for runtime errors", () => {
    const attempts = [
      makeAttempt("Added null check for user object", "runtime"),
      makeAttempt("Added optional chaining to user?.name", "runtime"),
      makeAttempt("Added nullish coalescing with default value", "runtime"),
    ];
    const diag = diagnose(attempts, "runtime", "NUDGE")!;
    expect(diag.pattern).toContain("null");
    expect(diag.suggested_action.toLowerCase()).toContain("trace");
  });

  it("suggests untried approaches", () => {
    const attempts = [
      makeAttempt("Changed import path"),
      makeAttempt("Changed import path again"),
      makeAttempt("Changed import path once more"),
    ];
    const diag = diagnose(attempts, "import", "WARNING")!;
    expect(diag.what_to_try_next.toLowerCase()).toContain("config");
  });

  it("handles mixed approaches", () => {
    const attempts = [
      makeAttempt("Changed import path", "build"),
      makeAttempt("Modified webpack config", "build"),
      makeAttempt("Installed missing package", "build"),
    ];
    const diag = diagnose(attempts, "build", "NUDGE")!;
    expect(diag).toBeDefined();
    expect(diag.what_was_tried).toHaveLength(3);
  });

  it("works at CRITICAL level", () => {
    const attempts = Array.from({ length: 7 }, (_, i) =>
      makeAttempt(`Changed import path attempt ${i + 1}`)
    );
    const diag = diagnose(attempts, "import", "CRITICAL")!;
    expect(diag.pattern).toContain("7");
    expect(diag.suggested_action.length).toBeGreaterThan(0);
  });
});
