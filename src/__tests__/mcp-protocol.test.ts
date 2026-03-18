import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../server.js";

describe("MCP protocol integration", () => {
  let client: Client;

  beforeEach(async () => {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" });
    await client.connect(clientTransport);
  });

  it("lists all 4 tools", async () => {
    const { tools } = await client.listTools();
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual([
      "check_loop_status",
      "get_escape_strategies",
      "log_fix_attempt",
      "resolve_loop",
    ]);
  });

  it("log_fix_attempt returns ok on first attempt", async () => {
    const result = await client.callTool({
      name: "log_fix_attempt",
      arguments: {
        error_message: "TypeError: x is undefined",
        files_involved: ["src/app.ts"],
        fix_description: "Add null check for x",
      },
    });

    const content = result.content as { type: string; text: string }[];
    const data = JSON.parse(content[0].text);
    expect(data.status).toBe("ok");
    expect(data.loop_level).toBe("NONE");
    expect(data.attempt_number).toBe(1);
  });

  it("escalates to NUDGE after 3 same-error attempts", async () => {
    for (let i = 0; i < 2; i++) {
      await client.callTool({
        name: "log_fix_attempt",
        arguments: {
          error_message: "TypeError: x is undefined",
          files_involved: ["src/app.ts"],
          fix_description: `Fix attempt ${i}`,
        },
      });
    }

    const result = await client.callTool({
      name: "log_fix_attempt",
      arguments: {
        error_message: "TypeError: x is undefined",
        files_involved: ["src/app.ts"],
        fix_description: "Fix attempt 3",
      },
    });

    const data = JSON.parse((result.content as any)[0].text);
    expect(data.status).toBe("loop_detected");
    expect(data.loop_level).toBe("NUDGE");
    expect(data.strategies).toBeDefined();
    expect(data.strategies.length).toBeGreaterThan(0);
  });

  it("check_loop_status is read-only", async () => {
    await client.callTool({
      name: "log_fix_attempt",
      arguments: {
        error_message: "Error",
        files_involved: ["a.ts"],
        fix_description: "Fix",
      },
    });

    const r1 = await client.callTool({ name: "check_loop_status", arguments: {} });
    const r2 = await client.callTool({ name: "check_loop_status", arguments: {} });

    const d1 = JSON.parse((r1.content as any)[0].text);
    const d2 = JSON.parse((r2.content as any)[0].text);
    expect(d1.attempt_number).toBe(d2.attempt_number);
  });

  it("resolve_loop resets state", async () => {
    for (let i = 0; i < 5; i++) {
      await client.callTool({
        name: "log_fix_attempt",
        arguments: {
          error_message: "TypeError: fail",
          files_involved: ["x.ts"],
          fix_description: `Try ${i}`,
        },
      });
    }

    const resolveResult = await client.callTool({ name: "resolve_loop", arguments: {} });
    const resolved = JSON.parse((resolveResult.content as any)[0].text);
    expect(resolved.status).toBe("resolved");
    expect(resolved.total_attempts).toBe(5);

    const afterResult = await client.callTool({
      name: "log_fix_attempt",
      arguments: {
        error_message: "TypeError: fail",
        files_involved: ["x.ts"],
        fix_description: "Fresh start",
      },
    });
    const after = JSON.parse((afterResult.content as any)[0].text);
    expect(after.loop_level).toBe("NONE");
    expect(after.attempt_number).toBe(1);
  });

  it("get_escape_strategies returns strategies even without prior attempts", async () => {
    const result = await client.callTool({
      name: "get_escape_strategies",
      arguments: { error_category: "import" },
    });

    const data = JSON.parse((result.content as any)[0].text);
    expect(data.strategies.length).toBeGreaterThan(0);
    expect(data.error_category).toBe("import");
  });

  it("session isolation via session_id", async () => {
    for (let i = 0; i < 3; i++) {
      await client.callTool({
        name: "log_fix_attempt",
        arguments: {
          error_message: "Error",
          files_involved: ["a.ts"],
          fix_description: "Fix",
          session_id: "task-a",
        },
      });
    }

    const result = await client.callTool({
      name: "log_fix_attempt",
      arguments: {
        error_message: "Error",
        files_involved: ["a.ts"],
        fix_description: "Fix",
        session_id: "task-b",
      },
    });

    const data = JSON.parse((result.content as any)[0].text);
    expect(data.loop_level).toBe("NONE");
    expect(data.attempt_number).toBe(1);
  });

  it("full escalation to CRITICAL through MCP", async () => {
    for (let i = 0; i < 7; i++) {
      await client.callTool({
        name: "log_fix_attempt",
        arguments: {
          error_message: "Cannot find module './missing'",
          files_involved: ["index.ts"],
          fix_description: `Attempt ${i}: try fixing the import`,
        },
      });
    }

    const status = await client.callTool({ name: "check_loop_status", arguments: {} });
    const data = JSON.parse((status.content as any)[0].text);
    expect(data.loop_level).toBe("CRITICAL");
    expect(data.strategies).toBeDefined();
    expect(data.strategies.some((s: any) => s.action.toLowerCase().includes("revert"))).toBe(true);
  });
});
