# V2 User Payload Contracts

Every V2 Poe request is one message:

```json
{
  "schema_version": "v1",
  "request_id": "uuid",
  "agent_role": "profile",
  "student_message": "student text",
  "capabilities": {"enabled_sources": ["profile"]},
  "inputs": {}
}
```

The runtime validates `schema_version` and `agent_role` and enforces source
allowlists. Disabled source data must not appear in `inputs`, source chips, or
evidence IDs.

Current source behavior:

- `profile` receives profile, psych results, and last-10 chat bubbles.
- `performance` receives deterministic summary analytics and may request
  follow-up detail (max 3 iterations).
  - Orchestrator passage names are resolved to application passage IDs before
    retrieval and exposed as `retrieval_scope`.
  - `focused_passage_performance` contains the student's performance for those
    requested passages while global summary data remains available.
  - Runtime also injects iterative memory fields:
    - `followup_evidence`: deterministic evidence returned by prior
      `detail_request` lookups.
    - `prior_iteration_outputs`: prior-round performance conclusions to support
      progressive refinement.
- `question_bank` receives deterministic retrieval from
  `dsemcq_dse_past_exam_questions` with:
  - retrieval mode metadata (`designated` or mixed),
  - similar-question evidence,
  - trend signals,
  - marking-skill notes,
  - evidence IDs.
  - It may request deterministic follow-up detail for up to 3 iterations using
    allowlisted actions, passage names, years, question types, and focus terms.

Orchestrator optional hints:

- `mentioned_designated_passages`: normalized 12-passage keyword matches.
- `question_bank_focus`: concise retrieval focus keywords.