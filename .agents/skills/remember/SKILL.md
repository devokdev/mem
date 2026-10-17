---
name: remember
description: >-
  Directly persist a critical architectural decision, pattern, or security rule into MemGC.
---

# /remember Skill

Use this skill when the user asks to remember a policy, invariant, convention, or architectural pattern.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/remember",
       "input": "<rule or decision text>"
     }
     ```
2. Inform the user that the rule has been marked as a protected permanent anchor (Deletion Risk $R > 0.85$).
