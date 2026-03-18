import { normalizeError, fingerprint, categorizeError } from "../detection/fingerprint.js";

describe("normalizeError", () => {
  it("strips file paths", () => {
    const result = normalizeError("Error in /Users/foo/bar/baz.ts:42:7");
    expect(result).not.toContain("/Users/foo");
    expect(result).toContain("<path>");
  });

  it("strips Windows paths", () => {
    const result = normalizeError("Error in C:\\Users\\dev\\project\\src\\index.ts:10");
    expect(result).not.toContain("C:\\Users");
    expect(result).toContain("<path>");
  });

  it("strips UUIDs", () => {
    const result = normalizeError("Record 550e8400-e29b-41d4-a716-446655440000 not found");
    expect(result).not.toContain("550e8400");
    expect(result).toContain("<uuid>");
  });

  it("strips timestamps", () => {
    const result = normalizeError("Error at 2026-03-17T14:30:00.000Z: timeout");
    expect(result).not.toContain("2026");
    expect(result).toContain("<ts>");
  });

  it("strips line/col references", () => {
    const result = normalizeError("SyntaxError: line 42, col 7");
    expect(result).toContain("<loc>");
    expect(result).not.toContain("42");
  });

  it("normalizes whitespace and lowercases", () => {
    const result = normalizeError("  TypeError:   Cannot   read  property  ");
    expect(result).toBe("typeerror: cannot read property");
  });

  it("produces same fingerprint for structurally identical errors on different files", () => {
    const fp1 = fingerprint("Cannot find module './components/Button' in /Users/a/project/src/App.ts:5");
    const fp2 = fingerprint("Cannot find module './components/Button' in /Users/b/other/src/Main.ts:12");
    expect(fp1).toBe(fp2);
  });

  it("produces different fingerprints for different errors", () => {
    const fp1 = fingerprint("TypeError: Cannot read property 'map' of undefined");
    const fp2 = fingerprint("SyntaxError: Unexpected token '}'");
    expect(fp1).not.toBe(fp2);
  });
});

describe("categorizeError", () => {
  it("detects syntax errors", () => {
    expect(categorizeError("SyntaxError: Unexpected token")).toBe("syntax");
  });

  it("detects type errors", () => {
    expect(categorizeError("TypeError: Cannot read property 'x' of undefined")).toBe("type");
    expect(categorizeError("Type 'string' is not assignable to type 'number'")).toBe("type");
  });

  it("detects import errors", () => {
    expect(categorizeError("Cannot find module './foo'")).toBe("import");
    expect(categorizeError("ModuleNotFoundError: No module named 'pandas'")).toBe("import");
  });

  it("detects build errors", () => {
    expect(categorizeError("Build failed with 3 errors")).toBe("build");
    expect(categorizeError("tsc error TS2304")).toBe("build");
  });

  it("detects test failures", () => {
    expect(categorizeError("Test failed: expect(received).toBe(expected)")).toBe("test");
    expect(categorizeError("FAIL src/app.test.ts - jest")).toBe("test");
  });

  it("detects runtime errors", () => {
    expect(categorizeError("ReferenceError: foo is not defined")).toBe("runtime");
    expect(categorizeError("Cannot read properties of undefined")).toBe("runtime");
  });

  it("detects config errors", () => {
    expect(categorizeError("Invalid configuration: unknown option 'target'")).toBe("config");
    expect(categorizeError("Error reading tsconfig.json")).toBe("config");
    expect(categorizeError("Configuration error in webpack.config.js")).toBe("build"); // "webpack" matches build first
    expect(categorizeError("Invalid option 'strictNullChecks2' in tsconfig")).toBe("config");
    expect(categorizeError("missing configuration file .env.local")).toBe("config");
  });

  it("detects Python errors", () => {
    expect(categorizeError("ModuleNotFoundError: No module named 'pandas'")).toBe("import");
    expect(categorizeError("IndentationError: unexpected indent")).toBe("syntax");
    expect(categorizeError("KeyError: 'username'")).toBe("runtime");
    expect(categorizeError("AttributeError: 'NoneType' object has no attribute 'get'")).toBe("runtime");
    expect(categorizeError("ValueError: invalid literal for int()")).toBe("runtime");
  });

  it("detects Rust errors", () => {
    expect(categorizeError("error[E0308]: mismatched types")).toBe("build");
    expect(categorizeError("trait `Display` is not implemented for `MyStruct`")).toBe("type");
    expect(categorizeError("cannot find crate `serde`")).toBe("build");
  });

  it("detects Go errors", () => {
    expect(categorizeError("goroutine 1 [running]: panic: runtime error")).toBe("runtime");
    expect(categorizeError("go build: cannot find module")).toBe("build");
  });

  it("returns unknown for unrecognized errors", () => {
    expect(categorizeError("Something went wrong")).toBe("unknown");
  });
});
