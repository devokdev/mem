---
name: commit-history
description: >-
  List git commits linked to agent tasks, rationales, and tests.
---

# /commit-history Skill

Use this skill to view commits linked to previous agent tasks.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/commit-history",
       "input": ""
     }
     ```
2. Display git commit history linked to agent tasks.
