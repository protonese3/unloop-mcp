#!/usr/bin/env npx tsx

/**
 * Smoke test — verifies the Unloop MCP server is working correctly.
 * Run: npx tsx smoke-test.ts
 *
 * Tests all 4 tools and the full escalation path in under 2 seconds.
 * Exit code 0 = all good, 1 = something is broken.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./src/server.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ${GREEN}✓${RESET} ${name}`);
    passed++;
  } else {
    console.log(`  ${RED}✗${RESET} ${name}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args });
  return JSON.parse((result.content as { text: string }[])[0].text);
}

async function main() {
  console.log(`\n${BOLD}Unloop MCP — Smoke Test${RESET}\n`);

  const server = createServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await server.connect(st);
  const client = new Client({ name: "smoke", version: "1.0" });
  await client.connect(ct);

  // 1. Tools are registered
  const { tools } = await client.listTools();
  const names = tools.map(t => t.name).sort();
  check("Server exposes 4 tools", names.length === 4);
  check("log_fix_attempt exists", names.includes("log_fix_attempt"));
  check("check_loop_status exists", names.includes("check_loop_status"));
  check("get_escape_strategies exists", names.includes("get_escape_strategies"));
  check("resolve_loop exists", names.includes("resolve_loop"));

  // 2. log_fix_attempt works
  const r1 = await callTool(client, "log_fix_attempt", {
    error_message: "TypeError: x is undefined",
    files_involved: ["test.ts"],
    fix_description: "Added null check",
  });
  check("First attempt returns NONE", r1.loop_level === "NONE");
  check("Attempt number is 1", r1.attempt_number === 1);
  check("Status is ok", r1.status === "ok");

  // 3. Escalation works
  for (let i = 0; i < 2; i++) {
    await callTool(client, "log_fix_attempt", {
      error_message: "TypeError: x is undefined",
      files_involved: ["test.ts"],
      fix_description: `Fix attempt ${i + 2}`,
    });
  }
  const r3 = await callTool(client, "log_fix_attempt", {
    error_message: "TypeError: x is undefined",
    files_involved: ["test.ts"],
    fix_description: "Another fix attempt",
  });
  check("NUDGE triggers at attempt 4", r3.loop_level === "NUDGE");
  check("max_similarity is a number", typeof r3.max_similarity === "number");
  check("Status is loop_detected", r3.status === "loop_detected");
  check("Strategies are returned", Array.isArray(r3.strategies) && r3.strategies.length > 0);
  check("Previous attempts included", Array.isArray(r3.previous_attempts) && r3.previous_attempts.length > 0);
  check("Error category detected", typeof r3.error_category === "string" && r3.error_category !== "");

  // 4. check_loop_status is read-only
  const s1 = await callTool(client, "check_loop_status", {});
  const s2 = await callTool(client, "check_loop_status", {});
  check("check_loop_status is read-only", s1.attempt_number === s2.attempt_number);
  check("check_loop_status returns strategies", Array.isArray(s1.strategies));

  // 5. get_escape_strategies works
  const es = await callTool(client, "get_escape_strategies", { error_category: "import" });
  check("get_escape_strategies returns strategies", es.strategies.length > 0);
  check("Strategies have title/action/reasoning", es.strategies.every(
    (s: Record<string, string>) => s.title && s.action && s.reasoning
  ));

  // 6. resolve_loop resets
  const res = await callTool(client, "resolve_loop", {});
  check("resolve_loop returns resolved", res.status === "resolved");
  check("resolve_loop reports total attempts", res.total_attempts === 4);

  const after = await callTool(client, "log_fix_attempt", {
    error_message: "TypeError: x is undefined",
    files_involved: ["test.ts"],
    fix_description: "Fresh start after resolve",
  });
  check("Counter resets after resolve", after.attempt_number === 1);
  check("Level is NONE after resolve", after.loop_level === "NONE");

  // 7. Session isolation
  await callTool(client, "log_fix_attempt", {
    error_message: "Error A",
    files_involved: ["a.ts"],
    fix_description: "Fix A",
    session_id: "session-a",
  });
  const sb = await callTool(client, "log_fix_attempt", {
    error_message: "Error A",
    files_involved: ["a.ts"],
    fix_description: "Fix A",
    session_id: "session-b",
  });
  check("Sessions are isolated", sb.attempt_number === 1);

  // 8. Full escalation to CRITICAL
  for (let i = 0; i < 7; i++) {
    await callTool(client, "log_fix_attempt", {
      error_message: "Build failed",
      files_involved: ["x.ts"],
      fix_description: `Critical test attempt ${i}`,
      session_id: "critical-test",
    });
  }
  const crit = await callTool(client, "check_loop_status", { session_id: "critical-test" });
  check("CRITICAL at 7 attempts", crit.loop_level === "CRITICAL");
  check("CRITICAL message contains STOP", crit.message.includes("STOP"));

  // Summary
  console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ""}${failed} failed${RESET}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${RED}Smoke test crashed:${RESET}`, err);
  process.exit(1);
});
