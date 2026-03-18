import { tokenize, jaccardSimilarity, SIMILARITY_THRESHOLD } from "../detection/similarity.js";

describe("tokenize", () => {
  it("lowercases and splits", () => {
    const tokens = tokenize("Add missing Import for Button component");
    expect(tokens.has("add")).toBe(true);
    expect(tokens.has("missing")).toBe(true);
    expect(tokens.has("import")).toBe(true);
    expect(tokens.has("button")).toBe(true);
    expect(tokens.has("component")).toBe(true);
  });

  it("removes stop words", () => {
    const tokens = tokenize("Fix the error in the main function");
    expect(tokens.has("the")).toBe(false);
    expect(tokens.has("in")).toBe(false);
    expect(tokens.has("fix")).toBe(true);
    expect(tokens.has("error")).toBe(true);
  });

  it("removes single-char words", () => {
    const tokens = tokenize("a b c add");
    expect(tokens.size).toBe(1);
    expect(tokens.has("add")).toBe(true);
  });

  it("strips punctuation", () => {
    const tokens = tokenize("fix: add semi-colon to line");
    expect(tokens.has("fix")).toBe(true);
    expect(tokens.has("semi")).toBe(true);
    expect(tokens.has("colon")).toBe(true);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["fix", "import", "error"]);
    expect(jaccardSimilarity(a, a)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["fix", "import"]);
    const b = new Set(["refactor", "component"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  it("returns correct partial overlap", () => {
    const a = new Set(["fix", "import", "button"]);
    const b = new Set(["fix", "import", "header"]);
    // intersection: 2, union: 4
    expect(jaccardSimilarity(a, b)).toBe(0.5);
  });

  it("returns 1 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  it("detects similar fix descriptions above threshold", () => {
    const a = tokenize("Add the missing import for React at the top of the file");
    const b = tokenize("Add missing import for React component at top of file");
    expect(jaccardSimilarity(a, b)).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("distinguishes different approaches below threshold", () => {
    const a = tokenize("Add missing import for React at the top of the file");
    const b = tokenize("Refactor component to use class-based approach with state management");
    expect(jaccardSimilarity(a, b)).toBeLessThan(SIMILARITY_THRESHOLD);
  });
});
