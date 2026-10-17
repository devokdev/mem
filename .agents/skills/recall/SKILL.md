---
name: recall
description: >-
  Recall past architectural decisions, patterns, lessons, or code contexts using MemGC hybrid retrieval.
---

# /recall Skill

Use this skill when you want to retrieve prior decisions, architectural rules, or past lessons matching a query.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/recall",
       "input": "<query>"
     }
     ```
2. Present the returned memories and relevant context to the user.
