import { getStrategies } from "../strategies/builtin.js";

describe("getStrategies", () => {
  it("returns empty for NONE level", () => {
    expect(getStrategies("NONE", "type")).toHaveLength(0);
  });

  it("returns general strategies for NUDGE with unknown category", () => {
    const strategies = getStrategies("NUDGE", "unknown");
    expect(strategies.length).toBeGreaterThan(0);
    expect(strategies.every(s => s.title && s.action && s.reasoning)).toBe(true);
  });

  it("returns category-specific + general strategies for import NUDGE", () => {
    const strategies = getStrategies("NUDGE", "import");
    const titles = strategies.map(s => s.title);
    expect(titles.some(t => t.toLowerCase().includes("package"))).toBe(true);
    expect(strategies.length).toBeGreaterThan(getStrategies("NUDGE", "unknown").length);
  });

  it("returns strategies for WARNING level", () => {
    const strategies = getStrategies("WARNING", "type");
    expect(strategies.length).toBeGreaterThan(0);
  });

  it("CRITICAL strategies include revert", () => {
    const strategies = getStrategies("CRITICAL", "unknown");
    const actions = strategies.map(s => s.action.toLowerCase()).join(" ");
    expect(actions).toContain("revert");
  });

  it("CRITICAL strategies include asking the user", () => {
    const strategies = getStrategies("CRITICAL", "unknown");
    const actions = strategies.map(s => s.action.toLowerCase()).join(" ");
    expect(actions).toContain("user");
  });

  it("all strategies have non-empty fields", () => {
    const levels = ["NUDGE", "WARNING", "CRITICAL"] as const;
    const categories = ["syntax", "type", "import", "build", "test", "runtime", "unknown"] as const;

    for (const level of levels) {
      for (const cat of categories) {
        const strategies = getStrategies(level, cat);
        for (const s of strategies) {
          expect(s.title.length).toBeGreaterThan(0);
          expect(s.action.length).toBeGreaterThan(0);
          expect(s.reasoning.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
