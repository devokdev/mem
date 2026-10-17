---
name: memgc
description: >-
  Risk-aware, token-budgeted memory garbage collector and persistent store engine.
  Use to recall past architectural decisions, remember explicit rules, execute
  garbage collection cycles, inspect session timelines, and manage context window budgets.
---

# MemGC Skill

MemGC is an autonomous memory garbage collector and context store for AI coding agents.

## Quick CLI & API Controls

- **API Endpoint**: `http://localhost:3111`
- **WebSocket Stream**: `ws://localhost:49134`

## Commands & Workflows

1. **Recall Knowledge (`/recall <query>`)**:
   Query the hybrid retrieval engine (BM25 + Dense Cosine) to inspect previous patterns and decisions.
   `POST http://localhost:3111/api/skills/execute` with `{"command": "/recall", "input": "<query>"}`

2. **Remember Critical Anchor (`/remember <rule>`)**:
   Store an explicit architectural anchor or security policy protected by the Golden Rule ($R > 0.85$).
   `POST http://localhost:3111/api/skills/execute` with `{"command": "/remember", "input": "<rule>"}`

3. **Garbage Collection Run (`/gc-run [--dry-run]`)**:
   Analyze and compact the memory heap against target token budgets.
   `POST http://localhost:3111/api/skills/execute` with `{"command": "/gc-run", "input": ""}`

4. **Session Handoff (`/handoff`)**:
   Package the most recent session state for seamless transition between tasks or agents.
   `POST http://localhost:3111/api/skills/execute` with `{"command": "/handoff", "input": ""}`
