# Product Requirements Document (PRD): MemGC

**Product Name:** MemGC  
**Subtitle:** Risk-Aware, Token-Budgeted Memory Garbage Collector for AI Coding Agents  
**Version:** 1.0.0  
**Status:** Approved / Active Baseline  
**Target Environment:** Local Agent Workspaces, Multi-Host Plugins, Embedded & Remote Daemons  

---

## 1. Executive Summary

MemGC is an autonomous, cross-agent persistent store and garbage collection engine purpose-built for AI coding assistants. While conventional context stores accumulate unbounded conversation logs, stale scratchpads, and duplicate observations—rapidly blowing agent context windows—MemGC treats memory like managed heap memory:

1. **Auto-Capture via Lifecycle Hooks:** Passively records agent activities (tool runs, prompt inputs, error states, commits, and session transitions) across major IDEs and CLI agents.
2. **Multi-Stage Distillation & Consolidation:** Continuously compacts raw observations into structured facts, architectural patterns, and reusable lessons.
3. **Risk-Aware Garbage Collection (GC):** Employs utility and risk scoring algorithms ($U \in [0, 1]$, $R \in [0, 1]$) with code-grounded verification to supersede stale statements, evict redundant records, and protect high-value architectural decisions within a strict token budget.
4. **Universal Integration Layer:** Seamlessly connects via native plugins, 53 Model Context Protocol (MCP) tools, 9 interactive slash commands, REST API, and iii-engine triggers.

---

## 2. Problem Statement & Objectives

### The Problem
- **Context Bloat & Token Degradation:** Agent prompts degrade in quality, latency, and cost as context windows fill with repetitive, obsolete, or ephemeral tool traces.
- **Fragmented Agent Silos:** Switching between IDEs (e.g., Cursor, Claude Code, Antigravity, OpenCode, Codex) forces developers to repeatedly re-explain architectural decisions, configurations, and testing conventions.
- **Silent Knowledge Loss vs. Naive Deletion:** Naive pruning deletes critical setup decisions or credentials, while naive accumulation poisons context with out-of-date assumptions that cause hallucinated code edits.

### Strategic Objectives
- **Zero Configuration Overhead:** Provide pre-packaged plugins and standard MCP servers that auto-wire into agent runtimes with zero manual SQL or database management.
- **Strict Token Budget Enforcement:** Guarantee that injected memory context strictly respects host-configured budgets (e.g., 2,000 tokens) with highest-value facts prioritized.
- **Code-Grounded Truth Verification:** Verify extracted facts directly against the active file tree before serving or evicting them.
- **Absolute Privacy & Data Sovereignty:** Local-first, file-based SQLite storage with automated PII and secret redaction.

---

## 3. System Architecture & Core Primitives

MemGC is engineered on top of **iii-engine** reactive micro-primitives (`Worker`, `Function`, `Trigger`, and persistent `StateModule` SQLite storage):

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Host AI Agents                                │
│  Claude Code  │  Antigravity IDE  │  Codex CLI  │  Cursor  │  OpenCode │
└───────┬───────────────┬───────────────────┬────────────┬───────────┬───┘
        │               │                   │            │           │
        ▼ (Hooks)       ▼ (Native Plugin)   ▼ (MCP stdio)▼ (MCP)     ▼ (API)
┌────────────────────────────────────────────────────────────────────────┐
│                        MemGC Plugin Layer                              │
│   • 12 Lifecycle Hooks    • 9 Agent Skills      • Standalone MCP Shim  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / WebSocket (Port 3111 / 49134)
┌───────────────────────────────────▼────────────────────────────────────┐
│                        MemGC Core Engine                               │
│  ┌───────────────────────┐  ┌────────────────────────────────────────┐ │
│  │ Observation Pipeline  │  │   Memory Garbage Collector (MemGC)     │ │
│  │ • Raw Observation Log │  │   • Token-Budgeted Optimizer           │ │
│  │ • Auto-Compress Gate  │  │   • Utility (U) & Risk (R) Scorer      │ │
│  │ • Privacy Redaction   │  │   • Code-Grounded Claim Scanner        │ │
│  │ • Synthesis Engine    │  │   • 4-Tier Memory Consolidator         │ │
│  └───────────────────────┘  └────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ Hybrid Retrieval: BM25 + Dense Vector (all-MiniLM) + KG Graph     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ StateModule (File-backed SQLite Store: ./data/state_store.db)     │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Real-time Event Stream
┌───────────────────────────────────▼────────────────────────────────────┐
│                   MemGC Dashboard & Session Replay                     │
│               (Real-time Web UI on http://localhost:3113)              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. How the Plugin Architecture Works

MemGC ships with a unified, cross-platform plugin layout located in `plugin/` and mirrored under `.agents/plugins/memgc/` for instant workspace auto-discovery.

### 4.1. Lifecycle Hooks (Autonomous Capture)
MemGC executes low-latency, non-blocking asynchronous hooks during agent operations:
- `session-start`: Initializes or resumes session context, scans local repo frontier, injects relevant past decisions into agent context.
- `prompt-submit`: Captures developer intent, requirements, and user corrections.
- `pre-tool-use` & `post-tool-use`: Tracks files inspected, code edits performed, tests executed, and terminal outputs.
- `post-tool-failure`: Captures error traces, exceptions, and stack dumps for proactive problem detection.
- `pre-compact`: Automatically crystallizes working memory before the host agent truncates context.
- `stop` & `session-end`: Computes session summaries, triggers consolidation cascades, and updates the timeline graph.

### 4.2. Universal Agent Skills (Slash Commands)
MemGC provides 9 native interactive skills available inside agent chats:

| Skill | Trigger / Command | Functionality |
|---|---|---|
| **Recall** | `/recall <query>` | Hybrid search across past decisions, patterns, and lessons. |
| **Remember** | `/remember <text>` | Directly forces persistent storage of critical knowledge or secrets policy. |
| **Handoff** | `/handoff` | Seamlessly loads and resumes the most recent active session in the workspace. |
| **Recap** | `/recap [period]` | Summarizes recent work, commits, and modifications across days or weeks. |
| **Session History**| `/session-history` | Displays visual chronological timeline of past agent interactions. |
| **Commit Context** | `/commit-context <file>` | Traces exact source lines or files back to the agent session that wrote them. |
| **Commit History** | `/commit-history` | Lists git commits linked to agent tasks, rationales, and tests. |
| **Forget** | `/forget <id|query>` | Removes obsolete or sensitive observations with audit tracking. |
| **GC Run** | `/gc-run [--dry-run]` | Triggers the token-budgeted memory garbage collector to compact state. |

---

## 5. Garbage Collection (GC) Algorithm & Scoring Engine

MemGC treats memory records through a quantitative optimization model:

### 5.1. Scoring Formulations
1. **Utility Score ($U \in [0, 1]$):**
   $$U = w_r \cdot \text{Recency} + w_f \cdot \text{Frequency} + w_s \cdot \text{SemanticRelevance} + w_g \cdot \text{GraphCentrality}$$
2. **Deletion Risk ($R \in [0, 1]$):**
   $$R = \max\left(\text{ArchitecturalConstraint}, \text{ExplicitInstruction}, \text{SecurityRule}, \text{CodeVerificationStatus}\right)$$
   - *Golden Rule:* If $R > \tau_{\text{protect}}$ (default: $0.85$), the memory item cannot be evicted under any context pressure.

### 5.2. Four-Tier Consolidation Pipeline
- **Tier 0 (Raw Observation):** Ephemeral command outputs, raw diffs, tool outputs. Lifetime: 1–3 sessions.
- **Tier 1 (Synthesized Action):** Compressed statements of what was attempted and the outcome.
- **Tier 2 (Structured Lesson / Fact):** Verified knowledge ("Project uses ES Modules with tsdown, test runner is vitest").
- **Tier 3 (Permanent Architectural Anchor):** Foundational patterns, invariants, governance constraints. Protected from eviction.

### 5.3. Code-Grounded Verification
Before preserving or evicting file-related facts, MemGC's claim scanner tests assertions against the active file tree:
- If a memory references `src/middleware/auth.ts`, verify the path exists.
- If a memory states an exported function `validateSession()`, AST-grep confirms its existence.
- Non-matching claims are tagged `stale` or `superseded` and scheduled for compaction.

---

## 6. MCP Server & Tool Surface

MemGC exposes 53 MCP tools covering 6 distinct functional categories:

1. **Search & Retrieval (8 tools):** `memory_smart_search`, `memory_recall`, `memory_hybrid_search`, `memory_graph_search`, `memory_context`, etc.
2. **Memory Modification (9 tools):** `memory_save`, `memory_remember`, `memory_crystallize`, `memory_update`, `memory_forget`, etc.
3. **Session & Timeline Management (8 tools):** `memory_sessions`, `memory_timeline`, `memory_handoff`, `memory_recap`, `memory_replay`, etc.
4. **Knowledge Graph & Facets (10 tools):** `memory_graph_nodes`, `memory_graph_edges`, `memory_facet_tag`, `memory_facet_query`, etc.
5. **Garbage Collection & Governance (10 tools):** `memory_gc_analyze`, `memory_gc_run`, `memory_governance_delete`, `memory_audit`, `memory_verify`, etc.
6. **Diagnostics & Self-Healing (8 tools):** `memory_diagnose`, `memory_heal`, `memory_status`, `memory_health`, etc.

---

## 7. Execution Commands & IDE Integration Guide

Any user can operate MemGC across any development environment with standard CLI commands:

### 7.1. Starting the Engine
```bash
# Direct run via npx (zero installation)
npx @memgc/memgc

# Run locally in development mode
npm run dev

# Run production daemon
npm run start
```
- Core API & triggers: `http://localhost:3111`
- Real-time visualization dashboard: `http://localhost:3113`
- Engine WebSocket: `ws://localhost:49134`

### 7.2. IDE-Specific Setup

#### Antigravity & Gemini IDE
MemGC is detected out of the box through `.agents/plugins/memgc/`:
1. Start the server: `npm run start` or `npx @memgc/memgc`.
2. Open the project in Antigravity or Gemini IDE.
3. The IDE automatically discovers the 9 skills and connects to the MCP tool registry via `mcp_config.json`.

#### Claude Code
```bash
/plugin marketplace add devokdev/memgc
/plugin install memgc
```

#### Codex CLI
```bash
codex plugin marketplace add devokdev/memgc
codex plugin install memgc
```

#### Cursor, Windsurf, Cline & VS Code
Add to your `mcpServers` configuration:
```json
{
  "mcpServers": {
    "memgc": {
      "command": "npx",
      "args": ["-y", "@memgc/mcp"],
      "env": {
        "MEMGC_URL": "http://localhost:3111",
        "MEMGC_TOOLS": "all"
      }
    }
  }
}
```

### 7.3. Running the Verification Demonstration
Verify end-to-end hook dispatch, memory creation, skill execution, and garbage collection simulation with:
```bash
npm run plugin:demo
```

---

## 8. Reliability, Privacy & Security Guardrails

- **Local Storage Isolation:** All memory stores reside in local workspace files (`./data/state_store.db`). No telemetry or code traces are transmitted to external cloud databases.
- **Automated Redaction:** API keys, authorization tokens, passwords, and sensitive environment variables are sanitized before storage.
- **Audit Trails:** State-changing memory modifications and deletions are tracked with operation logs, timestamps, and caller attribution.
- **Fail-Open Resilience:** If the MemGC server is offline, agents fall back gracefully without blocking coding sessions.
