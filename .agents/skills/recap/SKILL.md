---
name: recap
description: >-
  Summarize recent work, commits, and modifications recorded across past hours or days.
---

# /recap Skill

Use this skill when you need a recap of recent changes and agent actions.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/recap",
       "input": "<hours (default: 24)>"
     }
     ```
2. Present the summary to the user.
