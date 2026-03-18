# Changelog

## 0.3.0

- **Diagnosis engine** — analyzes fix attempt patterns, classifies approaches (path changes, type annotations, null checks, config changes, etc.), and gives specific pivot directions based on what was tried and the error category
- `diagnosis` field in `log_fix_attempt` and `check_loop_status` responses with `pattern`, `suggested_action`, `what_was_tried`, `what_to_try_next`
- **Temporal decay** — attempts older than 30 minutes count half, preventing stale history from over-escalating
- **Multi-language error patterns** — added Python (ModuleNotFoundError, IndentationError, KeyError, AttributeError, ValueError), Rust (error[E####], trait not implemented, cannot find crate), Go (goroutine panic, go build)
- GitHub Actions CI on Node 18/20/22
- CHANGELOG.md
- 99 tests + 25 smoke checks

## 0.2.0

- Added `config` error category with dedicated strategies (tsconfig, webpack, eslint, env)
- Added `max_similarity` field to `log_fix_attempt` response — shows how close the current fix is to the most similar previous one
- Improved escalation messages — WARNING explicitly tells to `git stash`, CRITICAL tells to report every attempt to the user
- Fixed CLI rules path resolution for `npx` installs
- ANSI escape codes now produce identical fingerprints
- 88 tests + 25 smoke checks

## 0.1.0

- Initial release
- 4 MCP tools: `log_fix_attempt`, `check_loop_status`, `get_escape_strategies`, `resolve_loop`
- Error fingerprinting with path/line/hash/UUID/timestamp/ANSI/stack frame normalization
- Jaccard similarity on tokenized fix descriptions (55% threshold)
- Escalation: NONE → NUDGE (3) → WARNING (5) → CRITICAL (7)
- 30+ built-in strategies across 7 error categories
- Rules files for Cursor, Claude Code, Windsurf, Cline
- CLI `unloop init` for IDE setup
