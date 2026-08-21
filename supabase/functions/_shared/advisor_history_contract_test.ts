import { buildSynthesizerHistoryPayload } from "./advisor_history_contract.ts";

type TestBubble = { role: "user" | "assistant"; text: string };

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function historyFromBubbles(): TestBubble[] {
  return Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 === 0 ? "user" : "assistant",
    text: `history-${index + 1}`,
  } as TestBubble));
}

Deno.test("synthesizer payload carries ordered ten-bubble history", () => {
  const history = historyFromBubbles();
  const payload = buildSynthesizerHistoryPayload({
    requestId: "current-request",
    studentMessage: "CURRENT_MESSAGE_SENTINEL",
    capabilities: ["profile"],
    reports: [],
    recentChatContext: { bubbles: history, truncated: true },
    historyEnabled: true,
  });
  const inputs = payload.inputs as Record<string, unknown>;
  const canonical = (inputs.conversation_history as { messages: TestBubble[] }).messages;
  const alias = inputs.recent_chat_bubbles as TestBubble[];
  const policy = payload.context_policy as Record<string, unknown>;

  assert(canonical.length === 10, "expected ten canonical history bubbles");
  assert(JSON.stringify(canonical) === JSON.stringify(history), "history order changed");
  assert(JSON.stringify(alias) === JSON.stringify(canonical), "history alias differs");
  assert(payload.student_message === "CURRENT_MESSAGE_SENTINEL", "current message changed");
  assert(policy.history_message_count === 10, "history count is incorrect");
  assert(policy.history_turn_count === 5, "turn count is incorrect");
  assert(policy.history_truncated === true, "truncation flag is incorrect");
});

Deno.test("synthesizer payload is empty when history is disabled", () => {
  const payload = buildSynthesizerHistoryPayload({
    requestId: "current-request",
    studentMessage: "CURRENT_MESSAGE_SENTINEL",
    capabilities: [],
    reports: [],
    recentChatContext: { bubbles: historyFromBubbles(), truncated: true },
    historyEnabled: false,
  });
  const inputs = payload.inputs as Record<string, unknown>;
  const canonical = (inputs.conversation_history as { messages: TestBubble[] }).messages;
  const alias = inputs.recent_chat_bubbles as TestBubble[];
  const policy = payload.context_policy as Record<string, unknown>;

  assert(canonical.length === 0, "disabled history was sent in canonical field");
  assert(alias.length === 0, "disabled history was sent in alias field");
  assert(policy.history_enabled === false, "history policy was not disabled");
  assert(policy.history_message_count === 0, "disabled history count is not zero");
  assert(policy.history_turn_count === 0, "disabled turn count is not zero");
  assert(policy.history_truncated === false, "disabled history is marked truncated");
});
