#!/usr/bin/env node

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// From dist/bin/cli.js, rules/ is at ../../rules/
const RULES_DIR = existsSync(join(__dirname, "..", "rules"))
  ? join(__dirname, "..", "rules")
  : join(__dirname, "..", "..", "rules");

type IDE = "cursor" | "claude" | "windsurf" | "cline";

interface IDEConfig {
  detect: string;
  rulesSource: string;
  rulesTarget: string;
  mcpConfigPath: string;
  mcpConfigUpdater: (existing: string) => string;
}

const IDE_CONFIGS: Record<IDE, IDEConfig> = {
  cursor: {
    detect: ".cursor",
    rulesSource: "cursor.mdc",
    rulesTarget: ".cursor/rules/unloop.mdc",
    mcpConfigPath: ".cursor/mcp.json",
    mcpConfigUpdater: (existing) => upsertMcpConfig(existing),
  },
  claude: {
    detect: ".claude",
    rulesSource: "claude.md",
    rulesTarget: ".claude/rules/unloop.md",
    mcpConfigPath: ".claude/settings.json",
    mcpConfigUpdater: (existing) => upsertClaudeConfig(existing),
  },
  windsurf: {
    detect: ".windsurf",
    rulesSource: "windsurf.md",
    rulesTarget: ".windsurfrules",
    mcpConfigPath: ".windsurf/mcp.json",
    mcpConfigUpdater: (existing) => upsertMcpConfig(existing),
  },
  cline: {
    detect: ".cline",
    rulesSource: "cline.md",
    rulesTarget: ".clinerules",
    mcpConfigPath: ".cline/mcp.json",
    mcpConfigUpdater: (existing) => upsertMcpConfig(existing),
  },
};

function upsertMcpConfig(existing: string): string {
  const config = existing ? JSON.parse(existing) : {};
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers.unloop = {
    command: "npx",
    args: ["-y", "unloop-mcp"],
  };
  return JSON.stringify(config, null, 2);
}

function upsertClaudeConfig(existing: string): string {
  const config = existing ? JSON.parse(existing) : {};
  config.mcpServers = config.mcpServers ?? {};
  config.mcpServers.unloop = {
    command: "npx",
    args: ["-y", "unloop-mcp"],
  };
  return JSON.stringify(config, null, 2);
}

function detect(): IDE[] {
  const cwd = process.cwd();
  return (Object.entries(IDE_CONFIGS) as [IDE, IDEConfig][])
    .filter(([, config]) => existsSync(join(cwd, config.detect)))
    .map(([ide]) => ide);
}

function setup(ide: IDE): void {
  const cwd = process.cwd();
  const config = IDE_CONFIGS[ide];

  const targetDir = dirname(join(cwd, config.rulesTarget));
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true });
  copyFileSync(join(RULES_DIR, config.rulesSource), join(cwd, config.rulesTarget));
  console.log(`  ✓ Rules file → ${config.rulesTarget}`);

  const mcpPath = join(cwd, config.mcpConfigPath);
  const mcpDir = dirname(mcpPath);
  if (!existsSync(mcpDir)) mkdirSync(mcpDir, { recursive: true });
  const existing = existsSync(mcpPath) ? readFileSync(mcpPath, "utf-8") : "";
  writeFileSync(mcpPath, config.mcpConfigUpdater(existing));
  console.log(`  ✓ MCP config → ${config.mcpConfigPath}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "init") {
    console.log("Usage: unloop init [--ide cursor|claude|windsurf|cline|all]");
    process.exit(1);
  }

  const ideFlag = args.indexOf("--ide");
  let targets: IDE[];

  if (ideFlag !== -1 && args[ideFlag + 1]) {
    const value = args[ideFlag + 1];
    if (value === "all") {
      targets = Object.keys(IDE_CONFIGS) as IDE[];
    } else {
      const ide = value as IDE;
      if (!(ide in IDE_CONFIGS)) {
        console.error(`Unknown IDE: ${value}. Options: cursor, claude, windsurf, cline, all`);
        process.exit(1);
      }
      targets = [ide];
    }
  } else {
    targets = detect();
    if (targets.length === 0) {
      console.log("No IDE detected. Use --ide to specify: unloop init --ide cursor");
      process.exit(1);
    }
  }

  console.log("\n🔓 Unloop — Break the Loop. Ship the Code.\n");

  for (const ide of targets) {
    console.log(`Setting up ${ide}...`);
    setup(ide);
    console.log();
  }

  console.log("Done! Restart your IDE to activate Unloop.\n");
}

main();
