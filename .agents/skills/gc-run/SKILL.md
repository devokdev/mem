---
name: gc-run
description: >-
  Trigger the token-budgeted memory garbage collector to compact state and enforce context budgets.
---

# /gc-run Skill

Use this skill when the user wants to compact the memory heap, evict stale claims, or enforce token limits.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/gc-run",
       "input": "<options such as --dry-run>"
     }
     ```
2. Report the tokens freed, items evicted, and items protected by the Golden Rule.
