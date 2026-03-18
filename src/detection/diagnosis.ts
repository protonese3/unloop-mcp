import type { FixAttempt, ErrorCategory, EscalationLevel, Diagnosis } from "../types.js";
import { tokenize } from "./similarity.js";

type ApproachCategory = "path_change" | "type_annotation" | "null_check" | "install_dep" | "config_change" | "refactor" | "env_fix" | "test_change" | "other";

const APPROACH_PATTERNS: [ApproachCategory, RegExp][] = [
  ["path_change", /import\s*path|relative\s*path|absolute\s*path|changed?\s*(to|from)\s*['".\/]|module\s*path|resolve\s*path|barrel\s*file|index\s*file/i],
  ["type_annotation", /type\s*annotation|generic\s*param|cast\s*(as|to)|type\s*assert|added?\s*type|explicit\s*type|interface|type\s*guard/i],
  ["null_check", /null\s*check|optional\s*chain|undefined\s*check|guard\s*clause|fallback|default\s*value|nullish\s*coalescing|\?\.|!\./i],
  ["install_dep", /npm\s*install|pip\s*install|yarn\s*add|cargo\s*add|go\s*get|install.*package|add.*dependency|package\.json/i],
  ["config_change", /tsconfig|webpack|vite\s*config|eslint|babel|\.env|config.*change|setting|option|flag|module\s*resolution/i],
  ["refactor", /refactor|restructur|rewrit|redesign|replac.*with|moved?\s*(to|from)|extract|split|merg/i],
  ["env_fix", /node_modules|cache|clean|rebuild|restart|reinstall|version|upgrade|downgrade/i],
  ["test_change", /test.*expect|mock|assertion|fixture|setup|teardown|beforeEach|afterEach|jest\s*config/i],
];

function classifyApproach(description: string): ApproachCategory {
  for (const [category, pattern] of APPROACH_PATTERNS) {
    if (pattern.test(description)) return category;
  }
  return "other";
}

function describeApproachCategory(cat: ApproachCategory): string {
  const names: Record<ApproachCategory, string> = {
    path_change: "changing import/module paths",
    type_annotation: "modifying type annotations",
    null_check: "adding null/undefined checks",
    install_dep: "installing/changing dependencies",
    config_change: "modifying configuration files",
    refactor: "refactoring/restructuring code",
    env_fix: "fixing the environment (cache, node_modules, versions)",
    test_change: "modifying test setup or assertions",
    other: "code modifications",
  };
  return names[cat];
}

const PIVOT_SUGGESTIONS: Record<ApproachCategory, Record<ErrorCategory, string>> = {
  path_change: {
    import: "Stop changing paths. Check if the file actually exists at the expected location. Run 'ls' or 'find' to locate it. Then check the module resolution config (tsconfig paths, webpack aliases).",
    build: "The import paths may be correct but the build tool isn't resolving them. Check the build config's module resolution settings, not the import statements.",
    type: "The import itself works but the types don't match. Check if @types packages are installed and version-aligned.",
    syntax: "The import syntax may be wrong for the module system. Check if the project uses ESM or CommonJS and match the syntax.",
    test: "The test runner may resolve modules differently from the build tool. Check jest moduleNameMapper or similar config.",
    runtime: "The module loads at build time but fails at runtime. Check for circular dependencies or missing runtime dependencies.",
    config: "Check if path aliases are configured in the correct config file for this tool.",
    unknown: "Verify the file exists, then check how other working imports in the same project are structured.",
  },
  type_annotation: {
    type: "Stop annotating. Log the actual runtime value with console.log(typeof x, x) to see what the real type is. Your assumption about the type is likely wrong.",
    import: "The type error may be caused by importing from the wrong module or version. Check the package version and its type definitions.",
    build: "The type system and build tool may disagree. Check tsconfig strict settings and target. Try building with --noEmit first to isolate type vs build errors.",
    syntax: "A syntax error near type annotations usually means wrong TS syntax for the target version. Check tsconfig target.",
    test: "The test types may need separate config. Check if there's a tsconfig.test.json or if @types/jest is installed.",
    runtime: "Runtime errors aren't fixed by type annotations. The value is actually wrong at runtime — trace where it comes from.",
    config: "Check if TypeScript strict mode or specific compiler options are causing the type error.",
    unknown: "Print the actual value at runtime to verify your type assumption before adding more annotations.",
  },
  null_check: {
    runtime: "Stop adding null checks at the symptom. Trace backward: WHERE should this value have been set? Check the function that creates it, the API that returns it, the database query that fetches it.",
    type: "The null check may fix the runtime error but create a type error. Consider using a type guard or assertion function instead.",
    import: "If a module import returns undefined, the module may not export what you think. Check the module's actual exports.",
    build: "Null checks are a code-level fix. If the build fails, the problem is likely elsewhere.",
    test: "The test data may be incomplete. Check fixtures and mocks — they may not include all required fields.",
    syntax: "Syntax errors aren't fixed by null checks. Look at the actual syntax error location.",
    config: "If config values are null, check the config loading mechanism, not the code that uses them.",
    unknown: "Find WHY the value is null instead of adding more checks. The root cause is upstream.",
  },
  install_dep: {
    import: "If installing didn't fix it, the package name may be wrong, or there's a version conflict. Run 'npm ls <package>' to check for duplicates.",
    build: "The dependency may be installed but the build tool can't find it. Check if it needs to be in dependencies vs devDependencies.",
    type: "You may need @types/<package> separately, or the types are bundled but the version is wrong.",
    runtime: "The package is installed but fails at runtime. Check for version incompatibilities or missing peer dependencies.",
    test: "Test dependencies go in devDependencies. Check if the test runner can find them.",
    syntax: "Installing packages doesn't fix syntax errors. The problem is in your code.",
    config: "The package may need configuration after installation. Check its docs for setup steps.",
    unknown: "Verify the package is in the correct dependency section and the version is compatible.",
  },
  config_change: {
    build: "If config changes haven't fixed the build, the problem may be in the code, not the config. Or you're editing the wrong config file — some tools have multiple configs.",
    import: "Module resolution config is tricky. Compare your config with the official docs for your exact tool version — don't guess the options.",
    type: "TypeScript config affects type checking. If changing strict/target didn't help, the types themselves are wrong, not the config.",
    runtime: "Runtime errors are rarely caused by build config. The code is executing wrong — focus on the code.",
    test: "Test runners often have separate config. Check jest.config, vitest.config, or the test section of package.json.",
    syntax: "Config doesn't fix syntax errors. The code has a typo or structural issue.",
    config: "You're editing config to fix a config error. Read the tool's migration guide — the option names may have changed between versions.",
    unknown: "Stop changing config randomly. Read the docs for the specific option that the error mentions.",
  },
  refactor: {
    import: "Refactoring often breaks imports. Instead of restructuring, fix the specific import that's broken.",
    build: "Large refactors during a build error make debugging harder. Revert and make the smallest possible change.",
    type: "Refactoring spreads the type error across more files. Isolate the type issue first, then refactor.",
    runtime: "Refactoring while debugging a runtime error introduces new variables. Fix the bug first, refactor later.",
    test: "Refactoring breaks tests. Fix the test for the current code first, then refactor both together.",
    syntax: "Don't refactor to fix a syntax error. Find the typo.",
    config: "Config errors don't need code refactoring. Fix the config.",
    unknown: "Revert the refactor. Fix the original error with the smallest change possible.",
  },
  env_fix: {
    import: "If reinstalling node_modules didn't help, the problem isn't the environment. Check if the module actually exists in the project.",
    build: "If a clean build still fails, the error is in the code or config, not cached artifacts.",
    type: "Type errors aren't caused by stale caches. The types are genuinely wrong.",
    runtime: "If restarting didn't fix it, the bug is deterministic. Add logging to trace it.",
    test: "If clearing test cache didn't help, the test failure is real. Read the assertion error carefully.",
    syntax: "Syntax errors are never caused by the environment. The code is wrong.",
    config: "If reinstalling didn't help, the config itself is wrong. Read it carefully.",
    unknown: "Environmental fixes only work for environmental problems. If the error persists, it's in the code.",
  },
  test_change: {
    test: "If changing the test doesn't fix it, the production code may actually be wrong. Check if the test expectation matches the intended behavior.",
    type: "Don't change test types to match broken code. Fix the code to produce the right types.",
    import: "Test import issues are often caused by module resolution config in the test runner (jest moduleNameMapper, vitest resolve).",
    build: "Tests don't affect the build. The build error is in the source code.",
    runtime: "Runtime errors in tests may be caused by missing mocks or test environment setup.",
    syntax: "Syntax errors in tests are the same as in code. Find the typo.",
    config: "Check test runner config separately from build config.",
    unknown: "Verify the test is testing the right thing before changing it further.",
  },
  other: {
    import: "Check if the module exists, is installed, and is exported correctly.",
    build: "Read the full build error output — the first error in the chain is usually the real one.",
    type: "Log the actual type at runtime. Don't guess — verify.",
    runtime: "Add logging around the failing line. Check every variable's value.",
    test: "Print expected vs actual values. The difference may be subtle.",
    syntax: "Look 10 lines above the reported error. The real mistake is usually earlier.",
    config: "Read the config documentation for your exact tool version.",
    unknown: "Step back and re-read the full error from scratch.",
  },
};

export function diagnose(
  attempts: FixAttempt[],
  errorCategory: ErrorCategory,
  level: EscalationLevel,
): Diagnosis | undefined {
  if (level === "NONE" || attempts.length < 2) return undefined;

  const approaches = attempts.map(a => ({
    description: a.fix_description,
    category: classifyApproach(a.fix_description),
  }));

  // Find the dominant approach category
  const categoryCounts = new Map<ApproachCategory, number>();
  for (const a of approaches) {
    categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
  }

  let dominantApproach: ApproachCategory = "other";
  let maxCount = 0;
  for (const [cat, count] of categoryCounts) {
    if (count > maxCount) {
      dominantApproach = cat;
      maxCount = count;
    }
  }

  const isStuck = maxCount >= 2;
  const pattern = isStuck
    ? `You've been ${describeApproachCategory(dominantApproach)} ${maxCount} times for a ${errorCategory} error. This approach isn't working.`
    : `${attempts.length} attempts across different approaches. None have resolved the ${errorCategory} error.`;

  const whatWasTried = attempts.map(a => a.fix_description);
  const suggestedAction = PIVOT_SUGGESTIONS[dominantApproach]?.[errorCategory]
    ?? PIVOT_SUGGESTIONS.other[errorCategory]
    ?? "Re-read the full error and try a completely different approach.";

  // Build a specific next-step based on what hasn't been tried
  const triedCategories = new Set(approaches.map(a => a.category));
  const untried: string[] = [];
  if (!triedCategories.has("config_change")) untried.push("Check the relevant config files");
  if (!triedCategories.has("install_dep")) untried.push("Verify dependencies are installed correctly");
  if (!triedCategories.has("env_fix")) untried.push("Try a clean environment (delete node_modules, clear cache, reinstall)");
  if (!triedCategories.has("refactor") && triedCategories.size >= 3) untried.push("Consider if the entire approach needs to change");

  const whatToTryNext = untried.length > 0
    ? `Approaches you haven't tried yet: ${untried.join(". ")}. ${suggestedAction}`
    : suggestedAction;

  return {
    pattern,
    suggested_action: suggestedAction,
    what_was_tried: whatWasTried,
    what_to_try_next: whatToTryNext,
  };
}
