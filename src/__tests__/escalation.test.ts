import { getEscalationLevel, getEscalationMessage } from "../detection/escalation.js";

describe("getEscalationLevel", () => {
  it("returns NONE for 0-2 attempts", () => {
    expect(getEscalationLevel(0)).toBe("NONE");
    expect(getEscalationLevel(1)).toBe("NONE");
    expect(getEscalationLevel(2)).toBe("NONE");
  });

  it("returns NUDGE at 3-4 attempts", () => {
    expect(getEscalationLevel(3)).toBe("NUDGE");
    expect(getEscalationLevel(4)).toBe("NUDGE");
  });

  it("returns WARNING at 5-6 attempts", () => {
    expect(getEscalationLevel(5)).toBe("WARNING");
    expect(getEscalationLevel(6)).toBe("WARNING");
  });

  it("returns CRITICAL at 7+ attempts", () => {
    expect(getEscalationLevel(7)).toBe("CRITICAL");
    expect(getEscalationLevel(15)).toBe("CRITICAL");
    expect(getEscalationLevel(100)).toBe("CRITICAL");
  });
});

describe("getEscalationMessage", () => {
  it("includes attempt count", () => {
    expect(getEscalationMessage("NUDGE", 3)).toContain("3");
    expect(getEscalationMessage("WARNING", 5)).toContain("5");
    expect(getEscalationMessage("CRITICAL", 7)).toContain("7");
  });

  it("CRITICAL message contains STOP", () => {
    expect(getEscalationMessage("CRITICAL", 10)).toContain("STOP");
  });

  it("NONE message is calm", () => {
    const msg = getEscalationMessage("NONE", 1);
    expect(msg).toContain("No loop");
  });
});
