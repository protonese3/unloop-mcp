# Unloop — Product Requirements Document

**Break the Loop. Ship the Code.**

MCP Server for AI Loop Detection & Recovery

Open Source • MIT License | v1.0 — March 2026

---

## 1. Problem Statement

During AI-assisted coding sessions, LLMs routinely get stuck in **fix loops**: they attempt the same (or trivially varied) fix for an error 5, 10, 20+ times without resolving it. The user often doesn't notice until they've burned significant time and tokens.

**Root causes:**

- LLMs have no structured memory of what they've already tried
- They're biased toward incremental variations rather than rethinking the approach
- Earlier attempts scroll out of the context window
- No external system tells them "you're going in circles"

**Impact (estimated, pre-Unloop):**

| Metric | Without Unloop | Target with Unloop |
|---|---|---|
| Avg time stuck in loop | 15–45 min | < 5 min |
| Tokens wasted per loop | 50k–200k | < 15k |
| Sessions with loops | ~40% | < 10% (resolved at first alert) |
| API cost per loop | $0.50–$5.00 | < $0.15 |

---

## 2. Solution Overview

Unloop is an MCP Server that tracks every fix attempt, detects repetition via error fingerprinting and fix similarity, and responds with escalating alerts and concrete escape strategies.

### Architectural constraint

An MCP server cannot inject itself into a conversation. It exposes tools that the AI *chooses* to call. Unloop solves this with a **3-level strategy**:

1. **Persuasive tool descriptions** — Tool names and descriptions are written to trigger automatic invocation. `log_fix_attempt` says "CRITICAL: call this EVERY TIME you attempt to fix an error."
2. **Rules files** — IDE-specific rules (`.cursor/rules/*.mdc`, `.claude/rules/*.md`, `.windsurfrules`) instruct the AI to always call `log_fix_attempt` after every fix and to obey the tool's response.
3. **Detection engine** — When the tool is called, the server does the heavy lifting: fingerprinting, similarity comparison, escalation, and strategy generation.

### End-to-end flow

```
User installs Unloop → rules are loaded into IDE
    ↓
AI encounters error → attempts fix → calls log_fix_attempt(error, files, fix)
    ↓
Server fingerprints error, compares fix to history
    ↓
No loop detected → returns "ok, tracking"
Loop detected   → returns alert level + escape strategies
    ↓
AI reads response → follows strategies or stops and asks user
    ↓
Error resolved → AI calls resolve_loop → counters reset
```

---

## 3. Technical Architecture

### 3.1 Stack

| Component | Technology |
|---|---|
| Runtime | Node.js (>=18) |
| Language | TypeScript (strict mode) |
| Protocol | MCP via stdio transport |
| Loop detection | Error fingerprinting + Jaccard similarity |
| State | In-memory per session (Map-based) |
| Persistence | Optional JSON file for session recovery |
| Dependencies | `@modelcontextprotocol/sdk` only |
| Config | Zero-config defaults, optional JSON override |

### 3.2 Project structure

```
unloop-mcp/
├── src/
│   ├── index.ts              # Entry point, MCP server setup
│   ├── server.ts             # Tool registration and handlers
│   ├── detection/
│   │   ├── fingerprint.ts    # Error normalization and fingerprinting
│   │   ├── similarity.ts     # Jaccard similarity on fix descriptions
│   │   └── escalation.ts     # State machine: NONE → NUDGE → WARNING → CRITICAL
│   ├── strategies/
│   │   ├── registry.ts       # Strategy lookup by error category + escalation level
│   │   └── builtin.ts        # 15+ built-in escape strategies
│   ├── session/
│   │   └── store.ts          # In-memory session state (Map<sessionId, SessionState>)
│   └── types.ts              # Shared types and interfaces
├── rules/
│   ├── cursor.mdc            # Cursor rules file
│   ├── claude.md             # Claude Code rules file
│   ├── windsurf.md           # Windsurf rules file
│   └── cline.md              # Cline rules file
├── bin/
│   └── cli.ts                # `unloop init` CLI command
├── tsconfig.json
├── package.json
└── README.md
```

### 3.3 MCP Tools

#### `log_fix_attempt` (primary)

Called by the AI after every fix attempt. This is the main entry point.

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `error_message` | `string` | yes | The error message (full or significant extract) |
| `files_involved` | `string[]` | yes | Files being modified |
| `fix_description` | `string` | yes | What the AI is attempting |
| `session_id` | `string` | no | For parallel task isolation. Defaults to `"default"` |

**Returns:**

```typescript
{
  status: "ok" | "loop_detected",
  loop_level: "NONE" | "NUDGE" | "WARNING" | "CRITICAL",
  attempt_number: number,
  similar_attempts: number,
  message: string,              // Human-readable status for the AI
  strategies?: EscapeStrategy[] // Present when loop_level !== "NONE"
}
```

#### `check_loop_status`

Read-only check. Returns current state without logging a new attempt.

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `session_id` | `string` | no | Defaults to `"default"` |

**Returns:** Same shape as `log_fix_attempt` response, minus incrementing counters.

#### `get_escape_strategies`

Returns strategies for the current error category and escalation level.

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `error_category` | `string` | no | Auto-detected if omitted. One of: `syntax`, `type`, `import`, `build`, `test`, `runtime`, `unknown` |
| `session_id` | `string` | no | Defaults to `"default"` |

**Returns:**

```typescript
{
  strategies: EscapeStrategy[],
  error_category: string,
  loop_level: string
}
```

Where `EscapeStrategy`:

```typescript
{
  title: string,        // e.g. "Revert and isolate"
  action: string,       // Concrete step: "git stash, comment out the failing code, re-run"
  reasoning: string     // Why this helps: "Removes accumulated bad changes"
}
```

#### `resolve_loop`

Marks the current error as resolved and resets tracking.

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `session_id` | `string` | no | Defaults to `"default"` |

**Returns:** `{ status: "resolved", total_attempts: number }`

### 3.4 Detection Engine

#### Error fingerprinting

Each error message is normalized before comparison:

1. Strip file paths (`/Users/foo/bar/baz.ts:42` → `<PATH>`)
2. Strip line/column numbers (`line 42, col 7` → `line <N>, col <N>`)
3. Strip UUIDs, hashes, timestamps
4. Lowercase
5. SHA-256 hash of normalized string → fingerprint

Errors with the same fingerprint are considered structurally identical.

#### Fix similarity

Fix descriptions are compared using **Jaccard similarity** on word-level tokens (lowercased, stop-words removed).

```
similarity(A, B) = |words(A) ∩ words(B)| / |words(A) ∪ words(B)|
```

Threshold: **0.55** — above this, two fixes are considered "same approach."

#### Escalation state machine

Each session tracks per-fingerprint state:

| Level | Trigger | AI-facing tone | Behavior |
|---|---|---|---|
| `NONE` | < 3 same-fingerprint attempts | Silent | Track only |
| `NUDGE` | 3 same-fingerprint attempts | Gentle | "You've tried this 3 times. Consider a different approach." + strategies |
| `WARNING` | 5 same-fingerprint attempts | Firm | "STOP incremental fixes. Change your approach entirely." + strategies |
| `CRITICAL` | 7+ same-fingerprint attempts | Urgent | "STOP. Do NOT attempt another fix. Revert changes and ask the user for guidance." + strategies |

The level is determined by the count of attempts sharing the same error fingerprint where fix similarity to any previous attempt exceeds the threshold.

### 3.5 Built-in Strategies

Strategies are organized by error category and escalation level. Examples:

**NUDGE level (any category):**
- "Re-read the full error message and stack trace. You may be fixating on the wrong line."
- "Check if the error is a symptom of a different root cause — trace the data flow backward."

**WARNING level — `import` errors:**
- "Verify the package is actually installed: check package.json/requirements.txt, run the install command."
- "Check for typos in the import path. Compare with a working import in the same project."

**WARNING level — `type` errors:**
- "Print/log the actual type of the variable at runtime. Don't assume — verify."
- "Check if a recent dependency update changed the type signature."

**CRITICAL level (any category):**
- "Revert ALL changes since the error first appeared: `git stash` or undo."
- "Isolate the problem: create a minimal reproduction in a new file."
- "Ask the user to describe what they expected. You may be solving the wrong problem."

The full strategy database will contain 15+ strategies across all categories and levels.

### 3.6 Session State

```typescript
interface SessionState {
  id: string
  attempts: FixAttempt[]
  fingerprint_counts: Map<string, number>
  current_level: EscalationLevel
  created_at: number
  resolved: boolean
}

interface FixAttempt {
  error_message: string
  error_fingerprint: string
  error_category: ErrorCategory
  files_involved: string[]
  fix_description: string
  fix_tokens: Set<string>
  timestamp: number
}
```

State is held in-memory in a `Map<string, SessionState>`. Sessions are garbage-collected after 2 hours of inactivity.

---

## 4. Rules Files

Rules files are the critical link that makes the AI call the tools. Each IDE has its own format.

### Content (universal, adapted per format)

```
## Unloop — AI Loop Detection

When fixing errors, you MUST follow this protocol:

1. After EVERY fix attempt for an error, call the `log_fix_attempt` tool with:
   - `error_message`: the error you're trying to fix
   - `files_involved`: the files you're modifying
   - `fix_description`: what you're changing and why

2. If `log_fix_attempt` returns a loop alert (NUDGE, WARNING, or CRITICAL):
   - Read the suggested strategies carefully
   - At NUDGE: try a fundamentally different approach
   - At WARNING: stop incremental fixes, change strategy entirely
   - At CRITICAL: stop immediately, revert changes, ask the user

3. When you successfully resolve the error, call `resolve_loop`.

4. Before starting a complex fix, call `check_loop_status` to see if you're already in a loop.
```

### Generated files

| IDE | File | Format |
|---|---|---|
| Cursor | `.cursor/rules/unloop.mdc` | MDC with frontmatter |
| Claude Code | `.claude/rules/unloop.md` | Markdown |
| Windsurf | `.windsurfrules` (append) | Markdown |
| Cline | `.clinerules` (append) | Markdown |
| Continue.dev | `.continuerules` | Markdown |

---

## 5. CLI — `unloop init`

The `init` command sets up Unloop in the current project.

```
npx unloop-mcp init [--ide cursor|claude|windsurf|cline|all]
```

**What it does:**

1. Detects the IDE(s) in use by checking for config directories (`.cursor/`, `.claude/`, etc.)
2. Generates the appropriate rules file(s)
3. Adds MCP server config to the IDE's MCP settings (e.g., `.cursor/mcp.json`, `.claude/settings.json`)
4. Prints setup confirmation

If no IDE is detected, it asks the user which to configure.

---

## 6. Compatibility

| Tool | MCP Support | Rules Format | Priority |
|---|---|---|---|
| Cursor | Native (stdio) | `.cursor/rules/*.mdc` | P0 |
| Claude Code | Native (stdio) | `.claude/rules/*.md` | P0 |
| Windsurf | Native | `.windsurfrules` | P1 |
| Cline (VS Code) | Native | `.clinerules` | P1 |
| Continue.dev | MCP config | `.continuerules` | P2 |
| Zed | Experimental | Settings | P2 |

---

## 7. Roadmap

### Phase 1 — MVP (Weeks 1–4)

- [ ] MCP server with all 4 tools (`log_fix_attempt`, `check_loop_status`, `get_escape_strategies`, `resolve_loop`)
- [ ] Error fingerprinting engine
- [ ] Jaccard similarity comparison
- [ ] Escalation state machine (NONE → NUDGE → WARNING → CRITICAL)
- [ ] Built-in strategy database (15+ strategies)
- [ ] Rules file templates for Cursor + Claude Code
- [ ] `npx unloop-mcp init` CLI
- [ ] README with usage docs
- [ ] Publish to npm
- [ ] Tests for detection engine

### Phase 2 — Polish (Weeks 5–8)

- [ ] Rules files for Windsurf, Cline, Continue.dev
- [ ] Improved error categorization (AST-level for JS/TS/Python)
- [ ] Session persistence to disk (optional)
- [ ] Telemetry (anonymous, opt-in): loop count, duration, resolution rate
- [ ] Landing page / docs site

### Phase 3 — Cloud + Pro (Weeks 9–16)

- [ ] Cloud backend for analytics sync
- [ ] Personal analytics dashboard
- [ ] Smart Strategies: LLM-powered context-aware suggestions (Pro)
- [ ] Webhook / Slack alerts (Pro)
- [ ] Stripe billing

### Phase 4 — Team (Weeks 17–24)

- [ ] Team dashboard with aggregated insights
- [ ] Custom strategy packs
- [ ] Public API
- [ ] Community strategy marketplace

---

## 8. Business Model

**Core is MIT-licensed, forever free.** Monetization is on cloud services.

| Feature | Free (OSS) | Pro ($9/mo) | Team ($19/user/mo) |
|---|---|---|---|
| Loop detection + strategies | Full | Full | Full |
| Rules file generation | All IDEs | All IDEs | All IDEs |
| Analytics dashboard | — | Personal | Team-wide |
| Loop history | Current session | 30 days | Unlimited |
| Smart Strategies (LLM) | — | Context-aware | Codebase-aware |
| Webhook / Slack alerts | — | Yes | Yes |
| Team insights | — | — | Yes |

---

## 9. Success Metrics

### MVP (3 months)

| Metric | Target |
|---|---|
| GitHub stars | 500+ |
| npm weekly downloads | 1,000+ |
| Loops detected/month | 10,000+ (opt-in telemetry) |
| Avg resolution time | < 5 min from first alert |

### 6 months

| Metric | Target |
|---|---|
| GitHub stars | 3,000+ |
| npm weekly downloads | 10,000+ |
| Pro subscribers | 200+ |
| MRR | $1,800+ |

---

## 10. Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| AI doesn't call the tools | Medium | High | Aggressive rules files + empirical testing on all target IDEs. This is existential — validate early. |
| False positives | Medium | Medium | Conservative thresholds (3 minimum). Tunable similarity threshold. |
| IDE changes MCP support | Low | High | Modular transport layer. Monitor IDE changelogs. |
| LLMs stop looping (long-term) | Low short-term | High long-term | Pivot to broader AI code quality assurance. |
| Privacy concerns (team tier) | Medium | High | Zero code tracking. Aggregated metrics only. Explicit opt-in. |
