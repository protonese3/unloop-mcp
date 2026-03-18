import type { EscalationLevel, ErrorCategory, EscapeStrategy } from "../types.js";
import { getStrategies as getBuiltinStrategies } from "./builtin.js";

export function getStrategies(level: EscalationLevel, category: ErrorCategory): EscapeStrategy[] {
  return getBuiltinStrategies(level, category);
}
