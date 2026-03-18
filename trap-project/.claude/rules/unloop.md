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

## How the system works

### Error fingerprinting
Every error message you report is normalized: file paths, line numbers, UUIDs, timestamps, hex hashes, ANSI codes, version numbers, and stack frames are stripped out. The normalized string is hashed into a 16-char fingerprint. Structurally identical errors on different files or lines produce the same fingerprint.

Example: these two errors produce the same fingerprint:
- `Cannot find module './Button' in /Users/alice/project/src/App.tsx:42:5`
- `Cannot find module './Button' in /Users/bob/project/src/Main.tsx:7:12`

### Fix similarity detection
Your `fix_description` is tokenized (lowercased, punctuation removed, stop-words filtered) and compared against every previous description for the same error fingerprint using Jaccard similarity on the word sets. If two descriptions share more than 55% of their meaningful words, they're flagged as "the same approach."

**This is why specific fix descriptions are critical.** Vague descriptions like "fix the error" make every attempt look identical and accelerate escalation. Specific descriptions let the engine distinguish genuinely new approaches.

### Escalation thresholds

| Level | Same-error attempts | Severity |
|---|---|---|
| `NONE` | 1-2 | Silent tracking |
| `NUDGE` | 3-4 | Early warning — change approach |
| `WARNING` | 5-6 | Confirmed loop — stop and revert |
| `CRITICAL` | 7+ | Emergency — full stop, ask user |

### Strategy cascade
Strategies returned at each level are cumulative:
- `NUDGE`: re-examine strategies
- `WARNING`: NUDGE strategies + revert/isolate strategies
- `CRITICAL`: WARNING strategies + full-revert/ask-user strategies

Strategies are also matched to the auto-detected error category (syntax, type, import, build, test, runtime) for targeted advice.

---

## THE PROTOCOL

### ━━━ Rule 1: Log every fix attempt ━━━

**After ANY action intended to fix an error**, call `log_fix_attempt`. No exceptions.

#### What counts as a fix attempt

**MUST log:**
- Editing source code to fix an error
- Editing config files (tsconfig, webpack, eslint, babel, docker, nginx, etc.)
- Editing package manifests (package.json, requirements.txt, Cargo.toml, go.mod)
- Running install commands to fix missing dependencies
- Running build/compile commands after a fix
- Changing file permissions, structure, or names to fix an error
- Adding/removing/modifying environment variables
- Changing database schema or migrations
- Reverting code as part of a fix strategy
- Clearing caches, rebuilding, or restarting services
- Any action where your intent is "this should fix the error"

**Do NOT log:**
- Writing new code that isn't fixing an error
- Refactoring working code
- Adding features
- Writing tests for working code
- Reading files (no changes made)
- Diagnostic commands that don't change anything

#### Parameter guide

##### `error_message`

Include the complete error or the most meaningful portion:
- Error type/class (TypeError, SyntaxError, TS2304, etc.)
- Full message body
- First 2-3 relevant stack trace lines (user's code, not library internals)
- Error codes if present

**Good:**
```
"TypeError: Cannot read properties of undefined (reading 'map')\n  at UserList (src/components/UserList.tsx:23:18)"
```
```
"TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.\n  src/utils/calculate.ts(15,23)"
```
```
"FAIL src/__tests__/auth.test.ts\n  ● AuthService › login › should return token\n    expect(received).toEqual(expected)\n    Expected: {token: 'abc123'}\n    Received: undefined"
```

**Bad:**
```
"error"              // No context
"it failed"          // Not the actual error
"see above"          // Tool can't see your conversation
```

##### `files_involved`

Every file you touched — source, config, test, lockfiles, migrations, env files. Be exhaustive.

**Good:**
```
["src/components/UserList.tsx", "src/types/User.ts"]
["package.json", "package-lock.json", "tsconfig.json"]
```

**Bad:**
```
["file"]       // Which file?
[]             // You must have touched something
```

##### `fix_description`

The most important parameter. Must answer:
1. **WHAT** did you change? (Specific code/config changes)
2. **WHY** do you think this fixes it? (Your reasoning)
3. **HOW** is this different from previous attempts? (If applicable)

**Excellent descriptions:**
```
"Changed the import of 'Button' from relative path './components/Button' to absolute path '@/components/Button' because the tsconfig.json has baseUrl set to 'src' with '@/*' path alias. Previous attempt used '../components/Button' which was wrong nesting level."
```
```
"Added explicit generic parameter to useState<User[]>([]) to fix TS2322. The empty array was inferred as never[] without the generic. Previous attempt tried casting with 'as User[]' which only suppressed the error at that line without fixing the root type."
```
```
"Replaced synchronous fs.readFileSync with async fs.readFile and added async keyword to processConfig function. Previous fix wrapped it in a Promise constructor which was unnecessary indirection."
```
```
"Deleted node_modules and package-lock.json, then ran npm install fresh. This is an environment fix — previous code-level fixes couldn't work because there were duplicate React versions causing hooks to fail."
```

**Poor descriptions (defeat the detection engine):**
```
"Fixed the error"        // WHAT? HOW?
"Updated the import"     // FROM what TO what? WHY?
"Try different approach"  // WHAT approach?
"Fixed types"            // WHICH types? WHAT change?
```

##### `session_id` (optional)

Use different IDs when fixing multiple independent errors in parallel:
```
log_fix_attempt({ ..., session_id: "build-fix" })   // API build error
log_fix_attempt({ ..., session_id: "test-fix" })     // Separate test failure
```
Omit for single error fixing (defaults to "default").

---

### ━━━ Rule 2: Respond to escalation levels ━━━

Read `loop_level` in the response and follow the protocol below. Do not skip this. Do not "quickly try one more thing" first.

#### NONE — Continue normally

No loop detected. Continue your fix. Note the `attempt_number` — if it's 2, make sure your next attempt is genuinely different to avoid NUDGE.

#### NUDGE (3+ attempts) — Change approach NOW

You are beginning to loop. This is a **directive**, not a suggestion.

**Mandatory steps, in order:**

1. **STOP** your current action. Do not continue with the edit you were planning.

2. **Read `previous_attempts`** in the response — your complete history for this error.

3. **Read `similar_attempts`** — if > 0, you are demonstrably repeating yourself.

4. **Re-read the error from scratch.** Go back to the actual error. You may be fixating on the wrong part.

5. **Read ALL strategies** in the response. Read each `action` and `reasoning` field.

6. **Choose a fundamentally different approach.** "Fundamentally different" means a different mechanism, not a different value:
   - Tried changing import paths? → Check if the package is installed
   - Tried modifying type annotations? → Check what the API actually returns
   - Tried editing the function? → Check if callers pass wrong arguments
   - Tried fixing the code? → Check if the config is wrong
   - Tried fixing file X? → Look at file Y that calls it

7. **Tell the user:** "I've tried [N] approaches for this error without success. Previous attempts: [brief list]. Switching to: [new approach]."

8. Proceed with new approach.

**Mistakes at NUDGE:**
- "This next try will definitely work" — that's what you thought before
- Minor variation of same approach — not different enough
- Ignoring strategies — they exist because your ideas haven't worked
- Not telling the user

#### WARNING (5+ attempts) — STOP and revert

You are in a confirmed loop.

**Mandatory steps, in order:**

1. **STOP writing code.** Do not complete your current edit.

2. **Read the full response** — `previous_attempts`, all `strategies`.

3. **Revert your changes.** 5 failed attempts means accumulated changes are likely making things worse:
   ```
   git stash
   ```
   Reverting feels like losing progress. Your "progress" was 5 failed attempts — it's not progress.

4. **Do research FIRST.** If strategies say read docs, check config, investigate environment — do that BEFORE writing more code.

5. **Formulate a completely new approach** — not a variation, a different category of fix.

6. **Tell the user explicitly:**
   "I've been stuck on this error for [N] attempts. Here's what I tried:
   1. [Attempt 1]
   2. [Attempt 2]
   ...
   None worked. I'm changing to: [describe new approach].
   Should I proceed, or do you have a suggestion?"

7. Wait for acknowledgment if possible.

**Mistakes at WARNING:**
- "Just one more try" — NO. 5 attempts. STOP.
- Not reverting — most common and damaging mistake
- Skipping research — if 5 code changes didn't work, maybe the problem isn't the code
- Not communicating with user

#### CRITICAL (7+ attempts) — EMERGENCY STOP

**Mandatory steps, in this exact order:**

1. **STOP IMMEDIATELY.** No more code. No more commands. STOP.

2. **Revert ALL changes** since the error first appeared:
   ```
   git stash
   ```

3. **Send the user a comprehensive report:**
   ```
   "I've attempted to fix this error [N] times without success. I need your help.

   **The error:** [full error message]

   **What I tried (in order):**
   1. [Approach 1]: [what I did] → [why it failed]
   2. [Approach 2]: [what I did] → [why it failed]
   ...all attempts...

   **Root cause theory:** [your best theory]

   **Approaches I haven't tried:**
   - [idea 1]
   - [idea 2]

   **Recommendation:** [your suggestion or honest "I don't know"]

   What would you like me to do?"
   ```

4. **WAIT for user response.** Do NOT proceed on your own.

5. **If user says "keep trying":**
   - Call `check_loop_status` first
   - Tell them: "The loop detection system recommends stopping. I'm at CRITICAL with [N] failed attempts. Are you sure?"
   - If they confirm, use a fundamentally different approach

---

### ━━━ Rule 3: Resolve when fixed ━━━

When the error is confirmed fixed, call `resolve_loop()` immediately.

**Why:** Without this, the next unrelated error inherits the inflated count. You'll hit NUDGE on attempt 1 of a new error.

**Call when:** Build passes, test passes, runtime error gone, user confirms.
**Don't call when:** Error might be fixed but unverified, or you moved on without fixing.

---

### ━━━ Rule 4: Pre-check before complex fixes ━━━

Before multi-file changes, significant refactoring, dependency changes, or anything hard to revert, call `check_loop_status()`.

- `NONE` → proceed
- `NUDGE` → reconsider if this is genuinely different
- `WARNING`/`CRITICAL` → follow the escalation protocol first

---

### ━━━ Rule 5: Use get_escape_strategies for planning ━━━

Get strategies without logging an attempt. Use when planning your next move at NUDGE+, or when you want category-specific advice.

```
get_escape_strategies({
  error_category: "import",  // optional, auto-detected if omitted
  session_id: "..."          // optional
})
```

Error categories: `syntax`, `type`, `import`, `build`, `test`, `runtime`, `unknown`.

---

## Tool reference

| Tool | When | State change |
|---|---|---|
| `log_fix_attempt` | After every fix attempt | Yes — logs attempt, may escalate |
| `check_loop_status` | Before complex fixes, status check | No — read only |
| `get_escape_strategies` | When planning, need strategy ideas | No — read only |
| `resolve_loop` | When error is confirmed fixed | Yes — resets all counters |

### Response format (log_fix_attempt / check_loop_status)

```json
{
  "status": "ok | loop_detected",
  "loop_level": "NONE | NUDGE | WARNING | CRITICAL",
  "attempt_number": 5,
  "similar_attempts": 3,
  "error_category": "type",
  "message": "Guidance calibrated to escalation level",
  "strategies": [
    { "title": "...", "action": "Concrete steps", "reasoning": "Why this helps" }
  ],
  "previous_attempts": [
    "#1: Description of first attempt [category] (timestamp)",
    "#2: Description of second attempt [category] (timestamp)"
  ]
}
```

---

## Real-world scenarios

### Scenario 1: Clean fix (no loop)
```
Edit src/App.tsx to fix TypeError
→ log_fix_attempt(error, files, "Added optional chaining to user?.name")
← { loop_level: "NONE", attempt_number: 1 }
Build passes.
→ resolve_loop()
```

### Scenario 2: NUDGE — change approach
```
Attempt 1: Change import path './Button' → '../Button'      ← NONE
Attempt 2: Change import path '../Button' → '../../Button'  ← NONE
Attempt 3: Change import path '../../Button' → './Button/index'  ← NUDGE

CORRECT: Stop changing paths. Read strategies. Check if Button.tsx exists.
         Check tsconfig paths. Check how other imports in the project work.
         Tell user what you've tried and your new approach.

WRONG:   Try another path variation.
```

### Scenario 3: WARNING — revert and research
```
Attempts 1-4: Various import path changes (NUDGE at 3)
Attempt 5: Try adding barrel file  ← WARNING

CORRECT: Stop. git stash. Open tsconfig.json. Check moduleResolution,
         baseUrl, paths. Find the config issue. Tell user your findings.

WRONG:   "Just one more try." Not reverting.
```

### Scenario 4: CRITICAL — full stop
```
Attempts 1-6: (escalated through NUDGE and WARNING)
Attempt 7: Restructured module layout  ← CRITICAL

CORRECT: Stop. Revert. Send user comprehensive report with all 7 attempts,
         root cause theory, untried approaches, and recommendation.
         Wait for user direction.

WRONG:   Try attempt 8. Give vague summary. Not revert.
```

### Scenario 5: Parallel tasks
```
log_fix_attempt({ ..., session_id: "api-build" })      // API build error
log_fix_attempt({ ..., session_id: "frontend-test" })   // Separate test failure
// Each tracked independently
```

### Scenario 6: Environment issue
```
After 5 attempts at code fixes for "Cannot find module 'react'":
Strategy says "Check if environment is broken"

CORRECT: Check node version, check node_modules, rm -rf node_modules && npm install,
         check for version manager issues. This is fundamentally different from code edits.
```

---

## Anti-patterns

1. **"One more try" at NUDGE** — You said that 2 times already. Change approach.
2. **Same approach, different words** — "Fix import" → "Correct module path" → "Update require" — same thing.
3. **Skipping resolve_loop** — Causes false positives on next error.
4. **Ignoring strategies** — They exist because your approach isn't working.
5. **Not reverting at WARNING/CRITICAL** — Accumulated bad changes make everything worse.
6. **Vague user communication** — List every attempt. Be specific about what failed and why.
7. **Gaming the system** — Not logging to avoid escalation. The escalation helps you.
8. **Vague fix descriptions** — "Fixed it" defeats the similarity engine. Be specific.

---

## The value proposition

Without Unloop: Error → try A → try A' → try A'' → ... → 15 wasted attempts → user takes over
With Unloop: Error → try A → try A' → **NUDGE** → try B (different approach) → fixed in 4 attempts

The difference is course-correcting at attempt 3 instead of attempt 15. Follow the protocol consistently.
