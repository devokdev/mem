---
name: commit-context
description: >-
  Trace exact source lines or files back to the agent session that wrote them.
---

# /commit-context Skill

Use this skill when investigating which agent session or rationale edited a specific file.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/commit-context",
       "input": "<filename>"
     }
     ```
2. Present the matching memory records referencing the file.
