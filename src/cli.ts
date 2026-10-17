#!/usr/bin/env node
/**
 * MemGC Installer / Initializer
 * Usage: npx @memgc/memgc init  or  node <path-to-memgc>/dist/cli.js init
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memgcRootDir = path.resolve(__dirname, '..');

const command = process.argv[2] || 'init';

if (command === 'init') {
  const targetDir = process.cwd();
  const agentsDir = path.join(targetDir, '.agents');
  const skillsDir = path.join(agentsDir, 'skills');
  const pluginsDir = path.join(agentsDir, 'plugins', 'memgc');

  console.log(`⚡ Initializing MemGC in: ${targetDir}`);

  // Create dirs
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(pluginsDir, { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'data'), { recursive: true });

  // 1. Copy skills from memgc package
  const sourceSkillsDir = path.join(memgcRootDir, '.agents', 'skills');
  if (fs.existsSync(sourceSkillsDir)) {
    fs.cpSync(sourceSkillsDir, skillsDir, { recursive: true });
  }

  // 2. Write mcp_config.json
  const mcpConfig = {
    mcpServers: {
      memgc: {
        command: "node",
        args: [path.join(memgcRootDir, "dist", "mcp", "index.js")],
        env: {
          MEMGC_URL: "http://localhost:3111",
          MEMGC_TOOLS: "all"
        }
      }
    }
  };

  fs.writeFileSync(path.join(pluginsDir, 'mcp_config.json'), JSON.stringify(mcpConfig, null, 2));

  // 3. Write plugin.json
  const pluginManifest = {
    name: "memgc",
    version: "1.0.0",
    description: "Risk-Aware, Token-Budgeted Memory Garbage Collector for AI Coding Agents"
  };
  fs.writeFileSync(path.join(pluginsDir, 'plugin.json'), JSON.stringify(pluginManifest, null, 2));

  console.log(`
✅ MemGC successfully installed in this workspace!
- Created .agents/skills/ (9 slash command skills: /remember, /recall, /gc-run, etc.)
- Created .agents/plugins/memgc/ (MCP config and plugin manifest)
- Created ./data/ (Local persistent SQLite store directory)

Next steps:
1. Ensure the MemGC daemon is running:
   npm run start (in the memgc directory)
2. Use slash commands inside your agent chat:
   /remember <decision>
   /recall <query>
   /gc-run
`);
} else {
  // Start server
  import('./index.js');
}
