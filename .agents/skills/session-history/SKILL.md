---
name: session-history
description: >-
  Display visual chronological timeline of past agent interactions and sessions.
---

# /session-history Skill

Use this skill when displaying history of past coding sessions.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/session-history",
       "input": ""
     }
     ```
2. Present the session list with timestamps and statuses.
