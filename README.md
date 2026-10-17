# MemGC (Memory Garbage Collector)
> **Risk-Aware, Token-Budgeted Memory Garbage Collector for AI Coding Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![MCP Compatible](https://img.shields.io/badge/MCP-53%20Tools-brightgreen)](https://modelcontextprotocol.io/)
[![Zero Config](https://img.shields.io/badge/Zero-Config-blueviolet)]()

---

## ⚡ Executive Overview

MemGC is an autonomous, cross-agent persistent store and garbage collection engine purpose-built for AI coding assistants (Claude Code, Cursor, Antigravity, OpenCode, Codex). While conventional context stores accumulate unbounded conversation logs, stale scratchpads, and duplicate observations—rapidly blowing agent context windows—MemGC treats memory like managed heap memory:

1. **Auto-Capture via Lifecycle Hooks:** Passively records agent activities across 12 lifecycle hooks.
2. **Multi-Stage Distillation & Consolidation:** Continuously compacts raw observations into structured facts, architectural patterns, and reusable lessons across 4 memory tiers.
3. **Risk-Aware Garbage Collection (GC):** Employs utility and risk scoring algorithms ($U \in [0, 1]$, $R \in [0, 1]$) with code-grounded verification.
4. **Golden Rule Protection:** Any memory with deletion risk $R > 0.85$ is strictly protected from eviction regardless of context pressure.
5. **Universal Integration Layer:** Seamlessly connects via native plugins, 53 MCP tools, 9 interactive slash commands, REST API, and WebSocket streaming.

---

## 🚀 Quick Start

### 1. Run Development Daemon
```bash
npm run dev
```

### 2. Run Production Daemon
```bash
npm run build
npm run start
```
- Core REST API: `http://localhost:3111`
- Engine WebSocket: `ws://localhost:49134`

### 3. Run End-to-End Verification Demo
```bash
npm run plugin:demo
```

---

## 🛠️ MCP Integration

Add MemGC to your IDE's MCP settings (Cursor, Windsurf, Cline, VS Code):

```json
{
  "mcpServers": {
    "memgc": {
      "command": "node",
      "args": ["<path-to-memgc>/dist/mcp/index.js"],
      "env": {
        "MEMGC_URL": "http://localhost:3111",
        "MEMGC_TOOLS": "all"
      }
    }
  }
}
```

---

## 💬 9 Interactive Slash Commands (Skills)

| Skill | Command | Functionality |
|---|---|---|
| **Recall** | `/recall <query>` | Hybrid search across past decisions and patterns |
| **Remember** | `/remember <text>` | Directly forces persistent storage of critical knowledge |
| **Handoff** | `/handoff` | Seamlessly loads and resumes recent active session |
| **Recap** | `/recap [period]` | Summarizes recent work across days or weeks |
| **Session History** | `/session-history` | Displays visual chronological timeline |
| **Commit Context** | `/commit-context <file>` | Traces exact source lines or files back to session |
| **Commit History** | `/commit-history` | Lists git commits linked to agent tasks |
| **Forget** | `/forget <id>` | Removes obsolete or sensitive observations |
| **GC Run** | `/gc-run [--dry-run]` | Triggers the token-budgeted memory garbage collector |
