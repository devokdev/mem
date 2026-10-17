---
name: handoff
description: >-
  Seamlessly load and resume the most recent active session in the workspace.
---

# /handoff Skill

Use this skill when resuming previous work or transitioning between tasks and agent sessions.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/handoff",
       "input": ""
     }
     ```
2. Display the resumed session title, active anchors, and tokens.
