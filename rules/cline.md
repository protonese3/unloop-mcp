# Unloop — AI Fix Loop Detection & Recovery Protocol

## What is Unloop and why it exists

Unloop is an MCP server running alongside your coding session. It solves a specific, well-documented problem: **you get stuck in fix loops**. You encounter an error, try to fix it, the fix doesn't work, and you try a slightly different variation of the same approach — 5, 10, 20 times — without stepping back to reconsider. This wastes the user's time, burns their tokens, and often makes the codebase worse.

You can't detect this yourself because:
- You have no structured memory of what you've already tried
- You're biased toward incremental variations of your last attempt
- Earlier attempts leave your context window after enough messages
- You have no meta-reasoning system that tells you "you're going in circles"

Unloop provides that meta-reasoning. It tracks every fix attempt, fingerprints errors, measures fix similarity, and tells you — with increasing urgency — when to stop and change direction.

**This protocol is mandatory whenever you are fixing errors.**

---

## System internals (so you understand the protocol)

### Error fingerprinting
Error messages are normalized before hashing:
- File paths → `<PATH>`
- Line/column numbers → `<LOC>`
- UUIDs, hex hashes (12+ chars), timestamps, semver → stripped
- ANSI terminal codes → stripped
- Stack frames → `<FRAME>`
- Whitespace collapsed, lowercased
- SHA-256 hashed → 16-char fingerprint

Structurally identical errors on different files/lines → same fingerprint.

### Fix similarity
Fix descriptions are tokenized (lowercase, no punctuation, no stop words, no single-char words) and compared via Jaccard similarity. Threshold: **55% word overlap = same approach**.

### Escalation
| Level | Trigger | Meaning |
|---|---|---|
| `NONE` | 1-2 attempts | Silent tracking |
| `NUDGE` | 3-4 attempts | Pattern emerging — change approach |
| `WARNING` | 5-6 attempts | Confirmed loop — stop, revert, research |
| `CRITICAL` | 7+ attempts | Emergency — stop, revert, ask user |

Counts are per error fingerprint. Reset on `resolve_loop()`.

### Strategy cascade
- NUDGE: re-examination strategies
- WARNING: WARNING + NUDGE strategies
- CRITICAL: CRITICAL + WARNING strategies

Matched to error category: syntax, type, import, build, test, runtime, unknown.

---

## THE PROTOCOL

### ━━━ Rule 1: Log every fix attempt ━━━

**After ANY action to fix an error**, call `log_fix_attempt`.

#### What to log

**MUST log:** Source code edits, config changes, package manifest changes, install commands, build commands after fixes, file permission/structure/name changes, env var changes, schema/migration changes, cache clearing, reverting as part of fix strategy, applying external suggestions, runtime version changes.

**Do NOT log:** New feature code, refactoring working code, writing tests for working code, reading files, diagnostic commands.

#### Parameters

##### `error_message` (required)
Full error with type, message body, and key stack trace lines.

**Good:**
```
"TypeError: Cannot read properties of undefined (reading 'map')\n  at UserList (src/components/UserList.tsx:23:18)"
```
```
"TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n  src/utils/calculate.ts(15,23)"
```
```
"Module not found: Can't resolve '@/components/Button' in '/project/src/pages'"
```
```
"FAIL src/__tests__/auth.test.ts\n  ● login › should return token\n    Expected: {token: 'abc123'}\n    Received: undefined"
```
```
"error[E0308]: mismatched types\n  --> src/main.rs:15:5\n  expected `String`, found `&str`"
```
```
"ENOENT: no such file or directory, open '/app/config/settings.json'"
```

**Bad:**
```
"error"          // No context
"it failed"      // Not the error message
"see above"      // Tool can't see conversation
```

##### `files_involved` (required)
Every file touched — source, config, test, lockfiles, migrations, env.

##### `fix_description` (required) — MOST IMPORTANT PARAMETER

Must answer: **WHAT** changed, **WHY** you think it fixes the error, **HOW** it differs from previous attempts.

**Excellent:**
```
"Changed import from relative './components/Button' to absolute '@/components/Button' because tsconfig has '@/*' path alias with baseUrl='src'. Previous attempt used '../components/Button' which was wrong nesting."
```
```
"Added generic to useState<User[]>([]) to fix TS2322. Empty array inferred as never[] without generic. Previous try used 'as User[]' cast which only suppressed the error at call site."
```
```
"Replaced fs.readFileSync with await fs.readFile and added async to processConfig(). Error was 'await in non-async'. Previous fix wrapped in Promise constructor — unnecessary indirection."
```
```
"Deleted node_modules + lockfile, ran npm install fresh. Environment fix — previous code-level fixes couldn't work because duplicate React versions caused hooks invariant violation."
```
```
"Moved useEffect above early return on line 15. Hooks must be called unconditionally in same order. Previous fix wrapped early return in useMemo — doesn't solve hook ordering."
```

**Poor (defeats similarity detection):**
```
"Fixed the error"        // WHAT? HOW?
"Updated the import"     // TO what? WHY?
"Try different approach"  // WHAT approach?
"Fix"                    // Meaningless
"Changed code"           // What change?
"Added null check"       // WHERE? On what?
"Fixed types"            // Which? How?
```

##### `session_id` (optional)
For parallel independent error fixes. Defaults to "default".

---

### ━━━ Rule 2: Respond to escalation levels ━━━

Read `loop_level` immediately. Follow protocol. Do NOT "quickly try one more thing."

#### NONE
Continue normally. If `attempt_number` is 2, ensure next attempt is genuinely different.

#### NUDGE (3+ attempts)
Directive, not suggestion. You are beginning to loop.

**Steps in order:**
1. **STOP** current action
2. **Read `previous_attempts`** — your complete history
3. **Check `similar_attempts`** — if > 0, you're repeating
4. **Re-read the error from scratch** — you may be fixating on wrong part
5. **Read ALL strategies** — every `action` and `reasoning`
6. **Choose fundamentally different approach:**
   - Changed import paths 3x? → Check if package is installed
   - Modified types 3x? → Log actual runtime type
   - Edited function 3x? → Check if callers pass wrong args
   - Made code fixes 3x? → Check config/environment
   - Looked at file X 3x? → Look at file Y that calls X
7. **Tell user:** "Tried [N] approaches. Previous: [list]. Switching to: [new approach]."
8. Proceed

**Mistakes:** "One more try" / minor variation / ignoring strategies / not telling user

#### WARNING (5+ attempts)
Confirmed loop.

**Steps in order:**
1. **STOP writing code**
2. **Read full response** — previous_attempts + strategies
3. **Revert:**
   ```
   git stash
   ```
   5 failed attempts ≠ progress. Clean slate is faster.
4. **Research FIRST** — if strategies say read docs / check config / check env, do that BEFORE coding
5. **Formulate qualitatively new approach**
6. **Tell user:**
   ```
   "Stuck for [N] attempts:
   1. [Attempt 1]
   2. [Attempt 2]
   ...
   None worked. Research shows [theory]. New approach: [describe].
   Proceed, or do you have a suggestion?"
   ```
7. Wait for acknowledgment if possible

**Mistakes:** "One more try" / not reverting / skipping research / vague communication

#### CRITICAL (7+ attempts)
EMERGENCY.

**Steps in exact order:**
1. **STOP IMMEDIATELY**
2. **Revert ALL:** `git stash`
3. **Report to user:**
   ```
   "I've tried [N] times without success. I need your help.

   **Error:** [full message]

   **Attempts:**
   1. [Approach]: [what] → [why failed]
   2. [Approach]: [what] → [why failed]
   ...all attempts...

   **Root cause theory:** [your theory]
   **Untried approaches:** [ideas]
   **Recommendation:** [suggestion or "I don't know"]

   What would you like me to do?"
   ```
4. **WAIT.** Do not proceed.
5. If user says "keep trying":
   - Call `check_loop_status` first
   - Warn: "System recommends stopping. CRITICAL with [N] attempts. Sure?"
   - If confirmed, fundamentally different approach

**Mistakes:** Try attempt 8 / vague summary / not reverting / not offering alternatives

---

### ━━━ Rule 3: Resolve when fixed ━━━

Call `resolve_loop()` when error is confirmed fixed.

Without this: next error inherits inflated count → false NUDGE on attempt 1.

Call when: build passes, test passes, runtime error gone, user confirms.
Don't call when: error unverified, moved on without fixing, user said stop.

---

### ━━━ Rule 4: Pre-check before complex fixes ━━━

Before multi-file changes, refactoring, dependency changes, hard-to-revert work:

```
check_loop_status()
```

- NONE → proceed
- NUDGE → reconsider if genuinely different
- WARNING/CRITICAL → follow escalation protocol first

---

### ━━━ Rule 5: get_escape_strategies for planning ━━━

Strategies without logging:
```
get_escape_strategies({ error_category: "import" })
```
Categories: syntax, type, import, build, test, runtime, unknown.

---

## Tool reference

| Tool | When | State |
|---|---|---|
| `log_fix_attempt` | After every fix attempt | Writes |
| `check_loop_status` | Before complex fixes | Read-only |
| `get_escape_strategies` | Planning next move | Read-only |
| `resolve_loop` | Error confirmed fixed | Resets |

### Response shape

```json
{
  "status": "ok | loop_detected",
  "loop_level": "NONE | NUDGE | WARNING | CRITICAL",
  "attempt_number": 5,
  "similar_attempts": 3,
  "error_category": "type",
  "message": "Guidance text",
  "strategies": [
    { "title": "Name", "action": "Steps", "reasoning": "Why" }
  ],
  "previous_attempts": [
    "#1: Description [category] (timestamp)",
    "#2: Description [category] (timestamp)"
  ]
}
```

---

## Scenarios

### Clean fix
```
Edit → log_fix_attempt → NONE → passes → resolve_loop
```

### NUDGE
```
Import path A → NONE
Import path B → NONE
Import path C → NUDGE
CORRECT: Stop paths. Check module exists. Check tsconfig. Different approach.
WRONG: Import path D.
```

### WARNING
```
5 attempts → WARNING
CORRECT: git stash. Read docs. Check config. New approach category.
WRONG: "One more." Not reverting.
```

### CRITICAL
```
7 attempts → CRITICAL
CORRECT: git stash. Comprehensive report listing all 7 attempts. Wait.
WRONG: Attempt 8. Vague summary.
```

### Environment issue
```
5 code fixes for "Cannot find module 'react'" → WARNING
CORRECT: rm -rf node_modules && npm install. Check node version. Check nvm.
Fundamentally different from source code edits.
```

### Parallel tasks
```
log_fix_attempt({ ..., session_id: "api-build" })
log_fix_attempt({ ..., session_id: "test-fix" })
Independent tracking.
```

### Forgot resolve
```
Fix error A (4 attempts, no resolve) → start error B → B attempt 1 triggers NUDGE
Always resolve_loop() when done.
```

---

## Anti-patterns

1. **"One more try"** at NUDGE — change approach NOW
2. **Same approach, different words** — "Fix import" / "Correct path" / "Update require"
3. **Skipping resolve_loop** — false positives on next error
4. **Ignoring strategies** — they address your failure pattern
5. **Not reverting** — accumulated failures compound
6. **Vague communication** — list every attempt
7. **Not logging** — gaming the system
8. **Vague descriptions** — "fixed it" defeats detection
9. **Continuing after CRITICAL** — STOP means STOP
10. **Logging non-fixes** — protocol is for error fixing only
