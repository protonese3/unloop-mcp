import { createHash } from "node:crypto";
import type { ErrorCategory } from "../types.js";

const PATH_PATTERN = /(?:[A-Za-z]:)?[\/\\][\w.\-\/\\]+(?::\d+(?::\d+)?)?/g;
const LINE_COL_PATTERN = /\b(?:line|ln|row|col|column)\s*:?\s*\d+/gi;
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_HASH_PATTERN = /\b[0-9a-f]{12,64}\b/gi;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*Z?/g;
const NUMBERS_IN_CONTEXT_PATTERN = /(?<=:)\d+(?=[:,\s])/g;
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const STACK_FRAME_PATTERN = /^\s*at\s+.+$/gm;
const VERSION_PATTERN = /\b\d+\.\d+\.\d+(?:-[\w.]+)?\b/g;

export function normalizeError(message: string): string {
  return message
    .replace(ANSI_PATTERN, "")
    .replace(STACK_FRAME_PATTERN, "<FRAME>")
    .replace(PATH_PATTERN, "<PATH>")
    .replace(TIMESTAMP_PATTERN, "<TS>")
    .replace(UUID_PATTERN, "<UUID>")
    .replace(LINE_COL_PATTERN, "<LOC>")
    .replace(HEX_HASH_PATTERN, "<HASH>")
    .replace(VERSION_PATTERN, "<VER>")
    .replace(NUMBERS_IN_CONTEXT_PATTERN, "<N>")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function fingerprint(message: string): string {
  const normalized = normalizeError(message);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

const CATEGORY_PATTERNS: [ErrorCategory, RegExp][] = [
  ["syntax", /syntax\s*error|unexpected\s*token|parsing\s*error|unterminated|unexpected\s*end\s*of|invalid\s*syntax/i],
  ["build", /build\s*fail|compilation\s*error|webpack|esbuild|rollup|vite.*error|tsc.*error|make.*error|cargo.*error|go\s*build/i],
  ["test", /test\s*fail|assert(?:ion)?(?:\s*error)?|expect\(.*\)\.to(?:be|equal|have|match|throw)|jest|vitest|pytest|mocha|rspec|test.*(?:passed|failed)/i],
  ["import", /cannot\s*find\s*module|module\s*not\s*found|import\s*error|no\s*module\s*named|failed\s*to\s*resolve|unable\s*to\s*resolve|could\s*not\s*resolve/i],
  ["type", /type\s*error|type\s*'[^']*'\s*is\s*not\s*assignable|cannot\s*find\s*name|ts\d{4}|property\s*'[^']*'\s*does\s*not\s*exist|argument.*not\s*assignable|incompatible\s*types?/i],
  ["runtime", /runtime\s*error|reference\s*error|null\s*pointer|undefined\s*is\s*not|cannot\s*read\s*propert|segmentation\s*fault|stack\s*overflow|out\s*of\s*memory|ENOENT|EACCES|ECONNREFUSED|unhandled.*rejection|uncaught/i],
];

export function categorizeError(message: string): ErrorCategory {
  for (const [category, pattern] of CATEGORY_PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return "unknown";
}
