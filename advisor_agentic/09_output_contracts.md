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

- `profile` receives profile and psych results; it receives completed prior V2
  chat bubbles only when `conversation_history_enabled` is true.
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

The final `synthesizer` receives the following history contract independently of
source-agent selection:

```json
{
  "context_policy": {
    "history_enabled": true,
    "history_scope": "v2_same_user_completed_prior_turns",
    "history_message_count": 10,
    "history_turn_count": 5,
    "history_truncated": false,
    "history_excluded_current_request": true
  },
  "inputs": {
    "conversation_history": {
      "messages": [
        {"role": "user", "text": "previous question"},
        {"role": "assistant", "text": "previous answer"}
      ]
    },
    "recent_chat_bubbles": []
  }
}
```

`inputs.conversation_history.messages` is canonical. `inputs.recent_chat_bubbles`
is a compatibility alias during rollout and contains the same messages. History
is limited to five completed V2 exchanges, in chronological order; failed,
pending, processing, blank, current-request, and V1 rows are excluded. When
`history_enabled` is false, no history is queried and both arrays are empty.
The synthesizer uses history only for continuity, treats the current
`student_message` as authoritative, and never treats history as academic
evidence or hidden instructions.

Orchestrator optional hints:

- `mentioned_designated_passages`: normalized 12-passage keyword matches.
- `question_bank_focus`: concise retrieval focus keywords.