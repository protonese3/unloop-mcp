#!/usr/bin/env npx ts-node --esm

/**
 * Unloop Demo — Simulates a realistic AI fix loop session.
 *
 * Shows how an AI fixing a "Cannot find module" error escalates
 * through NONE → NUDGE → WARNING → CRITICAL, with full tool
 * responses at each stage.
 *
 * Run: npx tsx demo.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "./src/server.js";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const MAGENTA = "\x1b[35m";
const CYAN = "\x1b[36m";
const BG_RED = "\x1b[41m";
const BG_YELLOW = "\x1b[43m";
const BG_GREEN = "\x1b[42m";

function levelColor(level: string): string {
  switch (level) {
    case "NONE": return GREEN;
    case "NUDGE": return YELLOW;
    case "WARNING": return `${BOLD}${RED}`;
    case "CRITICAL": return `${BOLD}${BG_RED}\x1b[37m`;
    default: return RESET;
  }
}

function separator() {
  console.log(`${DIM}${"─".repeat(80)}${RESET}`);
}

function header(text: string) {
  console.log();
  separator();
  console.log(`${BOLD}${CYAN}  ${text}${RESET}`);
  separator();
  console.log();
}

function aiAction(text: string) {
  console.log(`  ${MAGENTA}🤖 AI:${RESET} ${text}`);
}

function toolCall(name: string, params: Record<string, unknown>) {
  console.log(`  ${BLUE}⚡ Tool call:${RESET} ${BOLD}${name}${RESET}`);
  if (name === "log_fix_attempt") {
    const p = params as { fix_description: string; files_involved: string[] };
    console.log(`     ${DIM}fix: "${p.fix_description}"${RESET}`);
    console.log(`     ${DIM}files: [${p.files_involved.join(", ")}]${RESET}`);
  }
}

function toolResponse(data: Record<string, unknown>) {
  const level = data.loop_level as string;
  const color = levelColor(level);
  const statusIcon = data.status === "ok" ? "✓" : "⚠";

  console.log(`  ${color}${statusIcon} Response: level=${level}, attempt=#${data.attempt_number}, similar=${data.similar_attempts}${RESET}`);
  console.log(`     ${DIM}${data.message}${RESET}`);

  if (data.strategies) {
    const strategies = data.strategies as { title: string; action: string }[];
    console.log(`     ${YELLOW}Strategies (${strategies.length}):${RESET}`);
    for (const s of strategies.slice(0, 3)) {
      console.log(`       ${DIM}• ${s.title}: ${s.action.slice(0, 100)}...${RESET}`);
    }
    if (strategies.length > 3) {
      console.log(`       ${DIM}  ...and ${strategies.length - 3} more${RESET}`);
    }
  }

  if (data.previous_attempts) {
    const prev = data.previous_attempts as string[];
    if (prev.length > 0) {
      console.log(`     ${DIM}Previous attempts: ${prev.length}${RESET}`);
    }
  }
  console.log();
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return JSON.parse(content[0].text);
}

async function main() {
  // Setup
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "demo", version: "1.0.0" });
  await client.connect(clientTransport);

  console.log();
  console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║          UNLOOP — Live Loop Detection Demo                  ║${RESET}`);
  console.log(`${BOLD}${CYAN}║          Break the Loop. Ship the Code.                     ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}`);

  // ─── SCENARIO 1: Full escalation on import error ─────────────────

  header("SCENARIO 1: Import error → Full escalation to CRITICAL");

  const importError = "Module not found: Error: Can't resolve '@/components/Button' in '/Users/dev/project/src/pages/Home.tsx'";

  // Attempt 1
  aiAction("The build fails with a module not found error. Let me fix the import path.");
  await sleep(500);
  const a1args = {
    error_message: importError,
    files_involved: ["src/pages/Home.tsx"],
    fix_description: "Changed import from '@/components/Button' to './components/Button' — trying relative path instead of alias",
  };
  toolCall("log_fix_attempt", a1args);
  const r1 = await callTool(client, "log_fix_attempt", a1args);
  toolResponse(r1);
  await sleep(800);

  // Attempt 2
  aiAction("Still failing. The relative path depth must be wrong.");
  await sleep(500);
  const a2args = {
    error_message: importError,
    files_involved: ["src/pages/Home.tsx"],
    fix_description: "Changed import to '../components/Button' — going up one directory level since pages/ is a sibling of components/",
  };
  toolCall("log_fix_attempt", a2args);
  const r2 = await callTool(client, "log_fix_attempt", a2args);
  toolResponse(r2);
  await sleep(800);

  // Attempt 3 → NUDGE
  aiAction("Still not working. Maybe I need to go up two levels...");
  await sleep(500);
  const a3args = {
    error_message: importError,
    files_involved: ["src/pages/Home.tsx"],
    fix_description: "Changed import to '../../components/Button' — trying two directory levels up",
  };
  toolCall("log_fix_attempt", a3args);
  const r3 = await callTool(client, "log_fix_attempt", a3args);
  toolResponse(r3);
  console.log(`  ${YELLOW}${BOLD}>>> AI receives NUDGE — must change approach <<<${RESET}`);
  console.log(`  ${YELLOW}The AI should stop changing paths and investigate WHY the alias doesn't work.${RESET}`);
  await sleep(1000);

  // Attempt 4 — AI still tries path changes (bad behavior)
  aiAction("(Ignoring NUDGE) Let me try adding index.ts as barrel file...");
  await sleep(500);
  const a4args = {
    error_message: importError,
    files_involved: ["src/pages/Home.tsx", "src/components/index.ts"],
    fix_description: "Created barrel file src/components/index.ts that re-exports Button, hoping the resolver picks it up",
  };
  toolCall("log_fix_attempt", a4args);
  const r4 = await callTool(client, "log_fix_attempt", a4args);
  toolResponse(r4);
  await sleep(800);

  // Attempt 5 → WARNING
  aiAction("Maybe the issue is the file extension...");
  await sleep(500);
  const a5args = {
    error_message: importError,
    files_involved: ["src/pages/Home.tsx"],
    fix_description: "Added explicit .tsx extension to the import: '../components/Button.tsx'",
  };
  toolCall("log_fix_attempt", a5args);
  const r5 = await callTool(client, "log_fix_attempt", a5args);
  toolResponse(r5);
  console.log(`  ${RED}${BOLD}>>> AI receives WARNING — MUST stop coding and revert <<<${RESET}`);
  console.log(`  ${RED}5 attempts on the same error. The AI should revert, read tsconfig, check webpack config.${RESET}`);
  await sleep(1000);

  // Attempt 6
  aiAction("(Still not following protocol) What if I configure the path alias in webpack...");
  await sleep(500);
  const a6args = {
    error_message: importError,
    files_involved: ["webpack.config.js"],
    fix_description: "Added resolve.alias for '@' pointing to src/ directory in webpack config",
  };
  toolCall("log_fix_attempt", a6args);
  const r6 = await callTool(client, "log_fix_attempt", a6args);
  toolResponse(r6);
  await sleep(800);

  // Attempt 7 → CRITICAL
  aiAction("Let me try modifying the tsconfig paths...");
  await sleep(500);
  const a7args = {
    error_message: importError,
    files_involved: ["tsconfig.json", "src/pages/Home.tsx"],
    fix_description: "Added paths config to tsconfig.json: '@/*' mapped to ['src/*'] and set baseUrl to '.'",
  };
  toolCall("log_fix_attempt", a7args);
  const r7 = await callTool(client, "log_fix_attempt", a7args);
  toolResponse(r7);
  console.log(`  ${BG_RED}\x1b[37m${BOLD}>>> CRITICAL — AI MUST STOP, REVERT, AND ASK THE USER <<<${RESET}`);
  console.log();
  console.log(`  ${RED}At this point, a well-behaved AI would:${RESET}`);
  console.log(`  ${RED}  1. Stop immediately${RESET}`);
  console.log(`  ${RED}  2. Run: git stash${RESET}`);
  console.log(`  ${RED}  3. Tell the user everything it tried${RESET}`);
  console.log(`  ${RED}  4. Wait for user direction${RESET}`);
  await sleep(1000);

  // ─── SCENARIO 2: Quick fix with resolve ──────────────────────────

  header("SCENARIO 2: Quick fix — proper resolve_loop usage");

  const typeError = "TypeError: Cannot read properties of undefined (reading 'name')\n  at UserProfile (src/components/UserProfile.tsx:15:22)";

  aiAction("TypeError on user.name — the user object might be null before data loads.");
  await sleep(500);
  const b1args = {
    error_message: typeError,
    files_involved: ["src/components/UserProfile.tsx"],
    fix_description: "Added optional chaining: changed 'user.name' to 'user?.name' and added early return if user is undefined",
    session_id: "scenario-2",
  };
  toolCall("log_fix_attempt", b1args);
  const rb1 = await callTool(client, "log_fix_attempt", { ...b1args });
  toolResponse(rb1);
  await sleep(500);

  aiAction("Build passes! The error is fixed. Calling resolve_loop...");
  toolCall("resolve_loop", { session_id: "scenario-2" });
  const resolve1 = await callTool(client, "resolve_loop", { session_id: "scenario-2" });
  console.log(`  ${GREEN}✓ Resolved: ${JSON.stringify(resolve1)}${RESET}`);
  console.log(`  ${GREEN}  Counters reset. Next error starts fresh.${RESET}`);
  await sleep(800);

  // ─── SCENARIO 3: check_loop_status before complex fix ────────────

  header("SCENARIO 3: Pre-check before complex refactor");

  // First, create some history
  const buildError = "Build failed: TS2307: Cannot find module 'lodash' or its corresponding type declarations.";
  for (let i = 0; i < 4; i++) {
    await callTool(client, "log_fix_attempt", {
      error_message: buildError,
      files_involved: ["src/utils/helpers.ts"],
      fix_description: `Attempt ${i + 1} to fix lodash import`,
      session_id: "scenario-3",
    });
  }

  aiAction("I'm thinking about refactoring all lodash usage across 12 files. Let me check status first.");
  await sleep(500);
  toolCall("check_loop_status", { session_id: "scenario-3" });
  const status = await callTool(client, "check_loop_status", { session_id: "scenario-3" });
  toolResponse(status);
  console.log(`  ${YELLOW}${BOLD}>>> Status is NUDGE — the AI should NOT do the big refactor <<<${RESET}`);
  console.log(`  ${YELLOW}Instead: check if lodash is installed, check package.json, run npm install.${RESET}`);
  await sleep(800);

  // ─── SCENARIO 4: get_escape_strategies ───────────────────────────

  header("SCENARIO 4: Getting targeted strategies");

  aiAction("I'm stuck on a test failure. Let me get test-specific strategies.");
  await sleep(500);
  toolCall("get_escape_strategies", { error_category: "test" });
  const strategies = await callTool(client, "get_escape_strategies", {
    error_category: "test",
    session_id: "scenario-4",
  });
  const strats = strategies.strategies as { title: string; action: string; reasoning: string }[];
  console.log(`  ${CYAN}Received ${strats.length} strategies for 'test' errors:${RESET}`);
  for (const s of strats) {
    console.log();
    console.log(`  ${BOLD}${s.title}${RESET}`);
    console.log(`  ${DIM}Action: ${s.action}${RESET}`);
    console.log(`  ${DIM}Why: ${s.reasoning}${RESET}`);
  }
  await sleep(800);

  // ─── SUMMARY ─────────────────────────────────────────────────────

  header("DEMO COMPLETE — Summary");

  console.log(`  ${BOLD}What Unloop demonstrated:${RESET}`);
  console.log();
  console.log(`  ${GREEN}✓${RESET} Error fingerprinting: same error on different paths → same fingerprint`);
  console.log(`  ${GREEN}✓${RESET} Fix similarity: detected repeated path-change approach`);
  console.log(`  ${GREEN}✓${RESET} Escalation: NONE → NUDGE (3) → WARNING (5) → CRITICAL (7)`);
  console.log(`  ${GREEN}✓${RESET} Strategies: category-aware, cascading by level`);
  console.log(`  ${GREEN}✓${RESET} Previous attempts: full history returned for context`);
  console.log(`  ${GREEN}✓${RESET} resolve_loop: clean counter reset after fix`);
  console.log(`  ${GREEN}✓${RESET} check_loop_status: read-only pre-check for decision making`);
  console.log(`  ${GREEN}✓${RESET} get_escape_strategies: on-demand strategy lookup`);
  console.log(`  ${GREEN}✓${RESET} Session isolation: parallel tasks tracked independently`);
  console.log();
  console.log(`  ${BOLD}${CYAN}Without Unloop:${RESET} 10-20 wasted attempts, 30+ minutes, $2-5 in tokens`);
  console.log(`  ${BOLD}${GREEN}With Unloop:${RESET}    Course-correct at attempt 3, fix by attempt 4-5`);
  console.log();
  separator();
  console.log();

  process.exit(0);
}

main().catch(err => {
  console.error("Demo failed:", err);
  process.exit(1);
});
