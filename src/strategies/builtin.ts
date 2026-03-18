import type { EscalationLevel, ErrorCategory, EscapeStrategy } from "../types.js";

const STRATEGIES: Record<string, EscapeStrategy[]> = {

  // ── NUDGE: General ──────────────────────────────────────────────
  "NUDGE:*": [
    {
      title: "Re-read the full error",
      action: "Read the complete error message and stack trace from scratch. Identify the exact line and root cause — not just the symptom you've been fixating on.",
      reasoning: "After multiple attempts, tunnel vision sets in. You may be solving the wrong part of the error.",
    },
    {
      title: "Trace the root cause backward",
      action: "Follow the data/control flow backward from where the error occurs. Check each variable, return value, and function call in the chain. The real bug is often 2-3 steps upstream.",
      reasoning: "The error location and the bug location are frequently different. Fixing the symptom never fixes the cause.",
    },
    {
      title: "Diff against last working state",
      action: "Run `git diff` or review all your recent edits. Look at every change you've made since things last worked. The bug is in one of those changes.",
      reasoning: "Seeing all changes at once often reveals the mistake that incremental debugging misses.",
    },
    {
      title: "Question your assumptions",
      action: "Write down what you ASSUME is true about the code (types, values, execution order, API behavior). Then verify each assumption with a log statement, debugger, or documentation check.",
      reasoning: "Most loops happen because of an incorrect assumption that goes unchallenged across attempts.",
    },
  ],

  // ── WARNING: General ────────────────────────────────────────────
  "WARNING:*": [
    {
      title: "Revert and restart clean",
      action: "Undo ALL fix attempts: `git stash` or manually revert every change. Return to the exact state before your first fix. Then approach the problem from scratch with a different strategy.",
      reasoning: "Accumulated partial fixes create new problems on top of the original. A clean slate is faster than debugging your debugging.",
    },
    {
      title: "Minimal reproduction",
      action: "Create a new, minimal file that reproduces the error with the least possible code. Strip away everything unrelated. Fix it in isolation, then apply the fix to the real codebase.",
      reasoning: "Isolating the problem removes noise from unrelated code and makes the root cause obvious.",
    },
    {
      title: "Read the official documentation",
      action: "Look up the official docs for the exact API, library function, or language feature involved. Read the signature, the parameter types, the return type, and the edge cases. Don't skim — read carefully.",
      reasoning: "Your mental model of the API may be wrong. Five minutes reading docs saves thirty minutes of wrong guesses.",
    },
    {
      title: "Search for the exact error message",
      action: "Copy the core error message (without file paths and line numbers) and search for it in the project's GitHub issues, Stack Overflow, or the library's documentation. Someone has likely hit this before.",
      reasoning: "Many errors have known solutions that are non-obvious from the error message alone.",
    },
  ],

  // ── CRITICAL: General ───────────────────────────────────────────
  "CRITICAL:*": [
    {
      title: "FULL REVERT — return to working state",
      action: "Revert ALL changes since the error first appeared. Use `git stash`, `git checkout .`, or manual undo on every file. Confirm the codebase builds/runs without the error in its previous state.",
      reasoning: "After 7+ failed attempts, your changes are almost certainly making things worse. The fastest path forward starts from a known-good state.",
    },
    {
      title: "Ask the user for guidance",
      action: "Tell the user EXACTLY: (1) what error you're seeing, (2) a numbered list of every approach you've tried, (3) why each one failed, (4) what you think the root cause might be. Then ask: 'What would you like me to try next, or should we skip this?'",
      reasoning: "The user has context about the project, its history, and its constraints that you don't. They may know the fix instantly or decide the issue isn't worth pursuing right now.",
    },
    {
      title: "Redesign the approach entirely",
      action: "Stop trying to fix the current implementation. Step back and propose 2-3 alternative approaches that avoid the error entirely. Present them to the user with trade-offs.",
      reasoning: "Sometimes the right fix is to take a completely different path. The error may be a signal that the approach is fundamentally wrong.",
    },
    {
      title: "Check if the environment is broken",
      action: "Verify that the problem isn't environmental: check Node/Python/Go version, check that dependencies are installed correctly (`rm -rf node_modules && npm install`), check that no background process is interfering, check file permissions.",
      reasoning: "After many failed code fixes, the problem may not be in the code at all. Environmental issues look like code bugs but no code change can fix them.",
    },
  ],

  // ── Syntax errors ───────────────────────────────────────────────
  "NUDGE:syntax": [
    {
      title: "Check 20 lines above the error",
      action: "Look at the 20 lines BEFORE the reported syntax error location. The actual mistake is often an unclosed bracket, quote, template literal, or missing comma earlier in the file.",
      reasoning: "Parsers report syntax errors where they get confused, not where the mistake is. The real issue is usually upstream.",
    },
    {
      title: "Format the file and compare",
      action: "Run your formatter (prettier, black, gofmt) on the file. If it fails, the syntax error is real. If it changes something, compare what changed — the formatter found your mistake.",
      reasoning: "Formatters are much better at finding syntax issues than manual reading. Let the tool do the work.",
    },
  ],
  "WARNING:syntax": [
    {
      title: "Binary search for the error",
      action: "Comment out the bottom half of the file and see if the error moves. Keep bisecting until you find the exact line. This is faster than reading the whole file.",
      reasoning: "When you can't spot the syntax error visually, mechanical bisection is faster than staring at code.",
    },
  ],

  // ── Type errors ─────────────────────────────────────────────────
  "NUDGE:type": [
    {
      title: "Inspect the actual runtime type",
      action: "Add `console.log(typeof variable, variable)` or your language's equivalent to see the ACTUAL type and value at runtime. Don't guess — observe.",
      reasoning: "Your assumption about what type a variable has is likely wrong. Runtime inspection is the fastest way to find truth.",
    },
    {
      title: "Read the type definition",
      action: "Go to the type definition (Ctrl+click or equivalent) of every type involved in the error. Read what properties and methods it actually has vs. what you're trying to use.",
      reasoning: "IDE autocomplete and memory can mislead. The type definition is the source of truth.",
    },
  ],
  "WARNING:type": [
    {
      title: "Check dependency version alignment",
      action: "Verify that all related packages are on compatible versions. Check for duplicate packages (`npm ls <package>`). Check that @types packages match their runtime counterparts.",
      reasoning: "Type mismatches between library versions are a common source of unfixable-seeming type errors. Version skew creates impossible type constraints.",
    },
    {
      title: "Simplify the type chain",
      action: "If dealing with complex generics or nested types, break the expression into intermediate variables with explicit type annotations. Type each step separately to find where the mismatch occurs.",
      reasoning: "Complex type inference chains fail in non-obvious ways. Explicit intermediate types make the error location precise.",
    },
  ],

  // ── Import errors ───────────────────────────────────────────────
  "NUDGE:import": [
    {
      title: "Verify the package is installed",
      action: "Check your package manifest (package.json, requirements.txt, go.mod, Cargo.toml) for the dependency. If missing, install it. If present, delete your lockfile and install fresh.",
      reasoning: "The most common import error is simply a missing or corrupted installation.",
    },
    {
      title: "Compare with a working import",
      action: "Find another import in the same project that WORKS and compare everything: the path style (relative vs absolute), the casing, the extension, the default vs named export syntax.",
      reasoning: "Import resolution rules vary by bundler, runtime, and config. Copying a working pattern is more reliable than guessing the rules.",
    },
  ],
  "WARNING:import": [
    {
      title: "Check module resolution config",
      action: "Review your tsconfig.json paths/baseUrl, webpack resolve.alias, package.json exports field, or equivalent config. The module resolver may not work the way you think.",
      reasoning: "Import errors often stem from module resolution configuration, not from the import statement itself.",
    },
    {
      title: "Verify the export exists",
      action: "Open the target module and check that it actually exports the symbol you're importing. Check for typos, check if it's a default vs named export, check if it's re-exported from an index file.",
      reasoning: "You may be importing something that doesn't exist or is exported differently than you expect.",
    },
  ],

  // ── Build errors ────────────────────────────────────────────────
  "NUDGE:build": [
    {
      title: "Clean build from scratch",
      action: "Delete ALL build artifacts and caches: `rm -rf dist/ .next/ build/ __pycache__/ node_modules/.cache/ .tsbuildinfo`. Then rebuild from scratch.",
      reasoning: "Stale build caches are a common source of phantom errors that no source code change can fix.",
    },
    {
      title: "Build with verbose output",
      action: "Re-run the build with maximum verbosity flags to see the full error chain. Many build tools truncate errors by default. The truncated part often contains the real cause.",
      reasoning: "The visible error message may be a downstream effect. Verbose output shows the first error in the chain.",
    },
  ],
  "WARNING:build": [
    {
      title: "Check build configuration",
      action: "Review your build config (tsconfig.json, webpack.config, vite.config, Makefile, etc.) line by line. Check that target, module format, paths, and plugins are consistent. Compare with a known-working project if possible.",
      reasoning: "Build errors frequently stem from configuration issues that no source code fix can address.",
    },
    {
      title: "Isolate the failing module",
      action: "If the project has multiple entry points or modules, try building them individually to find which specific module is causing the failure.",
      reasoning: "A full build aggregates errors from many sources. Isolating narrows the search space dramatically.",
    },
  ],

  // ── Test failures ───────────────────────────────────────────────
  "NUDGE:test": [
    {
      title: "Print expected vs actual",
      action: "Log both the expected value and the actual value just before the assertion. Compare them character by character. The difference may be subtle (whitespace, encoding, floating point, object reference vs value).",
      reasoning: "Test failure messages can be misleading. Seeing the raw values reveals the actual discrepancy.",
    },
    {
      title: "Check if the test itself is wrong",
      action: "Re-read the test expectation. Is it testing the right thing? Has the specification changed? Is the expected value still correct after your other changes?",
      reasoning: "Sometimes the code is right and the test is wrong — especially after refactors that change behavior intentionally.",
    },
  ],
  "WARNING:test": [
    {
      title: "Run the test in isolation",
      action: "Run ONLY the failing test, not the full suite. Use `.only` or `--testNamePattern` or equivalent. If it passes alone, the problem is test pollution from another test.",
      reasoning: "Shared mutable state between tests is one of the most common and hardest-to-debug causes of test failures.",
    },
    {
      title: "Check test setup and teardown",
      action: "Review beforeEach/afterEach, setUp/tearDown, fixtures, and mocks. Ensure they properly reset state. Check if a mock is leaking between tests.",
      reasoning: "Flawed test infrastructure causes failures that look like code bugs but can't be fixed by changing application code.",
    },
  ],

  // ── Runtime errors ──────────────────────────────────────────────
  "NUDGE:runtime": [
    {
      title: "Add strategic logging",
      action: "Add log statements at the function entry, before the failing line, and at each branch point. Log the values of every variable involved in the error. Run again and read the output.",
      reasoning: "Runtime errors need runtime data. You can't fix what you can't observe.",
    },
    {
      title: "Check for null/undefined propagation",
      action: "Trace the variable that's null/undefined backward through the code. Find where it SHOULD have been assigned a value and check why that didn't happen. Check API responses, database queries, and function return values.",
      reasoning: "Null/undefined errors are symptoms. The cause is always earlier in the execution — an assignment that didn't happen or a function that returned unexpected results.",
    },
  ],
  "WARNING:runtime": [
    {
      title: "Use the debugger",
      action: "Set a breakpoint on the failing line and step through the execution. Inspect every variable in scope. Step INTO functions to see what they actually return.",
      reasoning: "A debugger gives you complete runtime state at every point. It's more reliable than log statements for complex issues.",
    },
    {
      title: "Check async timing",
      action: "If the code involves async operations, check for race conditions: missing awaits, promises that resolve in unexpected order, callbacks that fire before data is ready.",
      reasoning: "Async bugs are invisible in static code review. The code looks correct but executes in the wrong order.",
    },
  ],

  // ── Config errors ──────────────────────────────────────────────
  "NUDGE:config": [
    {
      title: "Read the config file top to bottom",
      action: "Open the config file the error mentions (tsconfig, webpack, vite, eslint, etc.) and read every field. Check for typos, deprecated options, and fields that conflict with each other.",
      reasoning: "Config files are rarely read carefully. A single typo or conflicting option causes errors that look like code bugs.",
    },
    {
      title: "Compare with a known-working config",
      action: "Find a project that works with a similar setup and compare configs side by side. Diff the two files to spot differences.",
      reasoning: "Config formats change between versions and documentation is often outdated. A working reference is more reliable.",
    },
  ],
  "WARNING:config": [
    {
      title: "Check config against the installed version",
      action: "Verify the version of the tool (tsc, webpack, eslint, etc.) and read the changelog for breaking config changes. An option that worked in v4 may not exist in v5.",
      reasoning: "Config errors after dependency updates are almost always version mismatches — the config format changed.",
    },
    {
      title: "Strip the config to minimal",
      action: "Remove everything from the config except the bare minimum needed to run. Add options back one at a time until the error returns. The last option you added is the problem.",
      reasoning: "Binary search on config options is faster than guessing which of 30 fields is wrong.",
    },
  ],
};

const LEVEL_CASCADE: Record<EscalationLevel, EscalationLevel[]> = {
  NONE: [],
  NUDGE: ["NUDGE"],
  WARNING: ["WARNING", "NUDGE"],
  CRITICAL: ["CRITICAL", "WARNING"],
};

export function getStrategies(level: EscalationLevel, category: ErrorCategory): EscapeStrategy[] {
  if (level === "NONE") return [];

  const seen = new Set<string>();
  const result: EscapeStrategy[] = [];

  for (const l of LEVEL_CASCADE[level]) {
    for (const key of [`${l}:${category}`, `${l}:*`]) {
      for (const s of STRATEGIES[key] ?? []) {
        if (!seen.has(s.title)) {
          seen.add(s.title);
          result.push(s);
        }
      }
    }
  }

  return result;
}
