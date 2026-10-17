---
name: forget
description: >-
  Remove obsolete, superseded, or sensitive memory records with audit logging.
---

# /forget Skill

Use this skill when deleting an obsolete memory record.

## Procedure

1. Make an HTTP POST request to the MemGC daemon:
   - URL: `http://localhost:3111/api/skills/execute`
   - Payload:
     ```json
     {
       "command": "/forget",
       "input": "<memoryId>"
     }
     ```
2. Confirm the record removal and audit logging.
