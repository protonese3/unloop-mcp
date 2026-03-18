# Unloop — AI Fix Loop Detection & Recovery Protocol

## What is Unloop and why it exists

Unloop is an MCP server running alongside your coding session. It solves a specific, well-documented problem: **you get stuck in fix loops**. You encounter an error, try to fix it, the fix doesn't work, and you try a slightly different variation of the same approach — 5, 10, 20 times — without stepping back to reconsider. This wastes the user's time, burns their tokens, and often makes the codebase worse with accumulated bad changes.

You can't detect this yourself because:
- You have no structured memory of what you've already tried
- You're biased toward incremental variations of your last attempt
- Earlier attempts leave your context window after enough messages
- You have no meta-reasoning system that says "you're going in circles"

Unloop provides that meta-reasoning. It tracks every fix attempt, fingerprints the errors, measures the similarity between your approaches, and tells you — with increasing urgency — when to stop and change direction.

**This protocol is not optional. It is mandatory whenever you are fixing errors.**

---

## How the system works (technical details)

### Error fingerprinting
Every error message you report is normalized before comparison:
- File paths stripped (`/Users/alice/project/src/App.tsx:42` → `<PATH>`)
- Line/column numbers stripped (`line 42, col 7` → `<LOC>`)
- UUIDs, hex hashes (12+ chars), timestamps, semver versions stripped
- ANSI terminal color codes stripped
- Stack trace frames stripped (different stack traces for same error → same fingerprint)
- Whitespace collapsed, lowercased
- Result is SHA-256 hashed into a 16-character fingerprint

This means structurally identical errors on different files produce the same fingerprint:
- `Cannot find module './Button' in /Users/alice/src/App.tsx:42` →  fingerprint `a1b2c3...`
- `Cannot find module './Button' in /Users/bob/src/Main.tsx:7` → fingerprint `a1b2c3...` (SAME)
- `Cannot find module './Header' in /Users/alice/src/App.tsx:42` → fingerprint `d4e5f6...` (DIFFERENT — different module)

### Fix similarity detection
Your `fix_description` is tokenized:
1. Lowercased
2. Punctuation replaced with spaces
3. Split into words
4. Stop words removed (the, a, is, are, to, of, in, for, and, but, etc.)
5. Single-character words removed
6. Resulting word set compared using Jaccard similarity

Jaccard formula: `|intersection| / |union|`

Threshold: **0.55** (55% word overlap)

Example:
- Description A: "Added missing import for React at the top of the file" → tokens: {added, missing, import, react, top, file}
- Description B: "Add the missing import for React component at top of file" → tokens: {add, missing, import, react, component, top, file}
- Intersection: {missing, import, react, top, file} = 5
- Union: {added, add, missing, import, react, component, top, file} = 8
- Similarity: 5/8 = 0.625 → **above threshold → same approach detected**

Example of different approaches:
- Description A: "Added missing import for React" → tokens: {added, missing, import, react}
- Description B: "Refactored component to class-based with state management" → tokens: {refactored, component, class, based, state, management}
- Intersection: {} = 0
- Similarity: 0/10 = 0.0 → **below threshold → different approach**

**This is why specific descriptions matter.** Vague descriptions like "fix the error" make everything look identical and trigger false escalation. Detailed descriptions let the engine accurately distinguish new approaches from repeated ones.

### Escalation state machine

```
Attempt 1 ─→ NONE (silent tracking)
Attempt 2 ─→ NONE
Attempt 3 ─→ NUDGE  ⚠️  "Change approach"
Attempt 4 ─→ NUDGE
Attempt 5 ─→ WARNING 🛑 "STOP. Revert. Research."
Attempt 6 ─→ WARNING
Attempt 7 ─→ CRITICAL 🚨 "STOP IMMEDIATELY. Revert. Ask user."
Attempt 8+ → CRITICAL
```

Counts are per **error fingerprint** — different errors have independent counters. Counts reset when you call `resolve_loop()`.

### Strategy cascade
Higher escalation levels include strategies from lower levels:
- `NUDGE`: category-specific + general re-examination strategies
- `WARNING`: WARNING strategies + NUDGE strategies
- `CRITICAL`: CRITICAL strategies + WARNING strategies

Strategies are also matched to auto-detected error category:
| Category | Matched patterns |
|---|---|
| `syntax` | SyntaxError, unexpected token, parsing error, unterminated, invalid syntax |
| `type` | TypeError, type not assignable, TS errors, property doesn't exist, incompatible types |
| `import` | Cannot find module, module not found, failed/unable/could not resolve |
| `build` | Build failed, compilation error, webpack/esbuild/vite/tsc/cargo errors |
| `test` | Test failed, assertion errors, expect().toBe(), jest/vitest/pytest |
| `runtime` | ReferenceError, null pointer, cannot read property, ENOENT, ECONNREFUSED, unhandled rejection |

---

## THE PROTOCOL — Complete mandatory rules

### ━━━ Rule 1: Log every fix attempt ━━━

**After ANY action you take to fix an error**, call `log_fix_attempt`. No exceptions.

#### What MUST be logged

- Source code edits to fix an error
- Config file edits (tsconfig, webpack, eslint, babel, docker, nginx, etc.)
- Package manifest edits (package.json, requirements.txt, Cargo.toml, go.mod)
- Install commands to fix missing deps (`npm install`, `pip install`, etc.)
- Build/compile commands after a fix attempt
- File permission, structure, or name changes
- Environment variable changes
- Database schema or migration changes
- CI/CD config changes
- Cache clearing, rebuilding, restarting services
- Reverting code as part of a fix strategy
- Applying suggestions from docs, Stack Overflow, or other sources
- Runtime version changes (Node, Python, Go)

#### What does NOT need logging

- Writing new code unrelated to an error
- Refactoring working code
- Adding new features
- Writing tests for working code
- Reading files (no changes)
- Diagnostic commands that don't change anything

#### How to call — parameter details

```
log_fix_attempt({
  error_message: "...",      // required
  files_involved: ["..."],   // required
  fix_description: "...",    // required
  session_id: "..."          // optional
})
```

##### `error_message` — What to include

The full error or most meaningful portion. This gets fingerprinted.

**Include:**
- Error type/class (TypeError, SyntaxError, TS2304, ENOENT, etc.)
- Full message body
- First 2-3 relevant stack trace lines (user's code, not library internals)
- Error codes if present
- Build/test output showing the failure

**Good examples:**
```
"TypeError: Cannot read properties of undefined (reading 'map')\n  at UserList (src/components/UserList.tsx:23:18)\n  at renderWithHooks (react-dom/...)"
```
```
"TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n  src/utils/calculate.ts(15,23)"
```
```
"Module not found: Error: Can't resolve '@/components/Button' in '/project/src/pages'"
```
```
"FAIL src/__tests__/auth.test.ts\n  ● AuthService › login › should return token\n    expect(received).toEqual(expected)\n    Expected: {token: 'abc123'}\n    Received: undefined"
```
```
"error[E0308]: mismatched types\n  --> src/main.rs:15:5\n   |    expected `String`, found `&str`"
```
```
"ENOENT: no such file or directory, open '/app/config/settings.json'"
```

**Bad examples:**
```
"error"                  // No context at all
"it failed"              // Not the actual error message
"see above"              // Tool can't see your conversation
"TypeError"              // Missing the actual message body
"something is wrong"     // Not an error message
```

##### `files_involved` — Be exhaustive

List EVERY file touched:

**Good:**
```
["src/components/UserList.tsx", "src/types/User.ts"]
["package.json", "package-lock.json", "src/utils/api.ts"]
["tsconfig.json", "src/index.ts", "src/types.d.ts"]
["src/__tests__/auth.test.ts", "src/services/auth.ts", "src/mocks/handlers.ts"]
[".env.local", "docker-compose.yml", "src/config/database.ts"]
["webpack.config.js", "src/index.tsx"]
```

**Bad:**
```
["file"]           // Which file?
["src"]            // Directory, not a file
[]                 // Empty — you touched something
["the file"]       // Not a file path
```

##### `fix_description` — The most critical parameter

Must answer three questions:
1. **WHAT** did you change? (Specific code/config changes)
2. **WHY** do you think this fixes the error? (Your reasoning)
3. **HOW** is this different from your last attempt? (If applicable)

**Excellent descriptions (engine can track approach effectively):**

```
"Changed the import of 'Button' from relative path './components/Button' to absolute path '@/components/Button' because tsconfig.json has baseUrl='src' with '@/*' alias configured. Previous attempt used '../components/Button' which was the wrong nesting level."
```

```
"Added explicit generic parameter to useState<User[]>([]) to fix TS2322. Empty array was inferred as never[] without the generic. Previous attempt tried 'as User[]' cast which only suppressed the error at the call site without fixing the type flow."
```

```
"Replaced synchronous fs.readFileSync with async fs.readFile and added async keyword to the enclosing processConfig() function. The error was 'Cannot use await in non-async function'. Previous fix wrapped it in a Promise constructor which was unnecessary indirection and didn't solve the type error."
```

```
"Deleted node_modules and package-lock.json, then ran npm install fresh. This is an environment fix — the previous code-level fixes (adding null checks, changing hook ordering) couldn't work because there were duplicate React versions causing the hooks invariant violation."
```

```
"Moved the useEffect hook call above the early return on line 15. React hooks must be called unconditionally in the same order every render. Previous fix tried wrapping the early return in useMemo which doesn't solve hook ordering — it's still conditional."
```

```
"Added 'type': 'module' to package.json and renamed config files from .js to .mjs. The error was 'require is not defined' because Node was running in ESM mode due to the .mjs entry point but the config files used CommonJS require(). Previous fix tried adding a shim for require which was fragile."
```

**Poor descriptions (engine cannot distinguish approaches):**
```
"Fixed the error"            // WHAT? HOW?
"Updated the import"         // FROM what TO what? WHY?
"Try a different approach"   // WHAT approach specifically?
"Fix"                        // Meaningless
"Changed the code"           // What code? What change?
"Added null check"           // WHERE? On what? Why null?
"Fixed types"                // Which types? What change?
"Updated config"             // Which config? What setting?
```

**Mediocre descriptions (better but still too vague):**
```
"Fixed the import path"      // FROM what TO what? Why was it wrong?
"Added error handling"       // What kind? Where? Try-catch? Fallback?
"Updated the test"           // How? Assertion? Input? Mock?
"Changed the function"       // What change? What parameter/return?
```

##### `session_id` — Parallel task isolation

For independent concurrent error fixes:
```
log_fix_attempt({ ..., session_id: "api-build" })      // API build error
log_fix_attempt({ ..., session_id: "frontend-test" })   // Separate test
```
Omit for single-error fixing (defaults to "default").

---

### ━━━ Rule 2: Respond to escalation levels ━━━

Read `loop_level` in every response. Follow the protocol below immediately — do not "quickly try one more thing" first.

#### NONE — Continue normally

Tracking only. Note `attempt_number` — if it's 2, ensure your next attempt is genuinely different.

#### NUDGE (3+ attempts) — Change approach NOW

This is a **directive**, not a suggestion. You are beginning to loop.

**Mandatory steps in order:**

1. **STOP** your current action.

2. **Read `previous_attempts`** in the response — your full history for this error.

3. **Check `similar_attempts`** — if > 0, you're demonstrably repeating yourself.

4. **Re-read the actual error from scratch.** You may be fixating on the wrong part.

5. **Read ALL strategies.** Read every `action` and `reasoning` field.

6. **Choose a fundamentally different approach.** Not a variation — a different mechanism:
   - Changed import paths 3 times? → Check if the package is installed at all
   - Modified type annotations 3 times? → Log the actual runtime type
   - Edited the function 3 times? → Check if callers pass wrong arguments
   - Made code fixes 3 times? → Check if the problem is config, environment, or a different file
   - Looked at file X 3 times? → Look at file Y that calls X

7. **Tell the user:** "I've tried [N] approaches for this error. Previous attempts: [brief list]. Switching to: [new approach]."

8. Proceed with new approach.

**Common NUDGE mistakes:**
- "This next try will definitely work" — you thought that the last 2 times
- Minor variation of same approach — not different enough
- Ignoring the returned strategies
- Not communicating with the user

#### WARNING (5+ attempts) — STOP coding. Revert. Research.

Confirmed loop. 5+ failed attempts on the same error.

**Mandatory steps in order:**

1. **STOP writing code.** Do not complete your current edit.

2. **Read full response** — `previous_attempts` and all `strategies`.

3. **Revert all changes:**
   ```
   git stash
   # or manually undo every change since the error first appeared
   ```
   Your "progress" was 5 failed attempts. That's not progress. A clean slate is faster.

4. **Research FIRST, code SECOND.** If strategies say read docs, check config, check environment — do that before writing any code. This is not optional.

5. **Formulate a qualitatively new approach** based on research and strategies.

6. **Tell the user:**
   ```
   "I've been stuck on this error for [N] attempts:
   1. [Attempt 1]
   2. [Attempt 2]
   ...
   None worked. Based on my research, I believe [theory]. I want to try: [new approach].
   Should I proceed, or do you have a suggestion?"
   ```

7. Wait for acknowledgment if possible.

**Common WARNING mistakes:**
- "Just one more try" — NO. STOP.
- Not reverting — accumulated bad changes compound the problem
- Skipping research — if 5 code changes failed, maybe it's not a code problem
- Vague communication with user

#### CRITICAL (7+ attempts) — EMERGENCY STOP

**Mandatory steps in this exact order:**

1. **STOP IMMEDIATELY.** No code. No commands.

2. **Revert ALL changes:**
   ```
   git stash
   ```

3. **Comprehensive report to user:**
   ```
   "I've attempted to fix this error [N] times without success. I need your help.

   **The error:** [full error message]

   **What I tried:**
   1. [Approach 1]: [what I did] → [why it failed]
   2. [Approach 2]: [what I did] → [why it failed]
   ...every attempt...

   **Root cause theory:** [your best theory]

   **Untried approaches:**
   - [idea 1]
   - [idea 2]

   **Recommendation:** [suggestion or honest "I don't know"]

   What would you like me to do?"
   ```

4. **WAIT for user.** Do NOT proceed.

5. If user says "keep trying":
   - Call `check_loop_status` first
   - Warn: "Loop detection recommends stopping. CRITICAL level with [N] attempts. Sure?"
   - If confirmed, use fundamentally different approach

---

### ━━━ Rule 3: Resolve when fixed ━━━

Call `resolve_loop()` when error is confirmed fixed (build passes, test passes, error gone).

**Why mandatory:** Without this, next unrelated error inherits inflated count → false NUDGE on attempt 1.

---

### ━━━ Rule 4: Pre-check before complex fixes ━━━

Before multi-file changes, major refactoring, or hard-to-revert changes, call `check_loop_status()`.

- `NONE` → proceed
- `NUDGE` → reconsider if approach is genuinely different
- `WARNING`/`CRITICAL` → follow escalation protocol first

---

### ━━━ Rule 5: Use get_escape_strategies for planning ━━━

Get strategies without logging an attempt:
```
get_escape_strategies({
  error_category: "type",    // optional: syntax/type/import/build/test/runtime/unknown
  session_id: "..."          // optional
})
```

Use when planning next move at NUDGE+, or for category-specific advice.

---

## Tool reference

| Tool | Purpose | State change |
|---|---|---|
| `log_fix_attempt` | Record attempt + get analysis | Yes |
| `check_loop_status` | Read current state | No |
| `get_escape_strategies` | Get strategies for planning | No |
| `resolve_loop` | Reset tracking after fix | Yes |

### Response format

```json
{
  "status": "ok | loop_detected",
  "loop_level": "NONE | NUDGE | WARNING | CRITICAL",
  "attempt_number": 5,
  "similar_attempts": 3,
  "error_category": "type",
  "message": "Escalation-calibrated guidance",
  "strategies": [
    { "title": "Strategy", "action": "Concrete steps", "reasoning": "Why" }
  ],
  "previous_attempts": [
    "#1: Changed import path from ./Button to ../Button [import] (14:23:01)",
    "#2: Changed import path from ../Button to @/Button [import] (14:24:15)"
  ]
}
```

**Key fields:**
- `similar_attempts`: How many previous fixes had >55% word overlap → repeating same approach
- `previous_attempts`: Your full history — study this to avoid repetition
- `strategies`: Ordered by relevance, category-specific first

---

## Scenarios

### Scenario 1: Clean fix
```
Edit file → log_fix_attempt → NONE → build passes → resolve_loop
```

### Scenario 2: NUDGE
```
Path fix A → NONE → Path fix B → NONE → Path fix C → NUDGE
CORRECT: Stop. Check if module exists. Check config. Different approach.
WRONG: Try path D.
```

### Scenario 3: WARNING
```
5 attempts → WARNING
CORRECT: git stash. Read docs. Check config. Fundamentally different approach.
WRONG: "One more try." Not reverting.
```

### Scenario 4: CRITICAL
```
7 attempts → CRITICAL
CORRECT: git stash. Full report to user. List all attempts. Wait.
WRONG: Attempt 8. Vague summary. Not reverting.
```

### Scenario 5: Environment issue
```
5 code fixes for "Cannot find module 'react'" → WARNING
CORRECT: Check node version, rm -rf node_modules && npm install, check version manager
This is fundamentally different from editing source code.
```

### Scenario 6: Forgot resolve_loop
```
Fix error A (4 attempts) → don't resolve → start error B
Error B attempt 1 → NUDGE (because A's count is still active)
FIX: Always call resolve_loop when done.
```

---

## Anti-patterns

1. **"One more try"** at NUDGE → you said that before. Change approach.
2. **Same approach, different words** → "Fix import" / "Correct module path" / "Update require" — all the same.
3. **Skipping resolve_loop** → false positives on next error.
4. **Ignoring strategies** → they exist because your approach failed.
5. **Not reverting** at WARNING/CRITICAL → accumulated bad changes make everything worse.
6. **Vague user communication** → list every attempt specifically.
7. **Not logging** to avoid escalation → gaming the system defeats its purpose.
8. **Vague descriptions** → "fixed it" defeats similarity detection.
9. **Logging non-fixes** → don't log feature work or refactoring.
10. **Continuing after CRITICAL** → STOP means STOP. Ask the user.
