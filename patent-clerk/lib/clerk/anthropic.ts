import Anthropic from "@anthropic-ai/sdk";
import { sanitizeMachine } from "../machine/schema";
import { FILE_DRAWING_TOOL, SYSTEM_PROMPT, TOOL_NAME } from "./prompt";
import type { ClerkReply, Turn } from "./types";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;

/**
 * Rebuilds the API conversation from the visible turns. Earlier drawings are replayed
 * as the tool calls that filed them, so revisions start from the current machine.
 * Thinking blocks are never replayed, which keeps the history append-only.
 */
function toMessages(turns: Turn[]): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  let pendingToolUse: string | undefined;
  for (const t of turns) {
    if (t.role === "assistant") {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: t.text || "Noted." }];
      if (t.machine && t.toolUseId) {
        content.push({ type: "tool_use", id: t.toolUseId, name: TOOL_NAME, input: t.machine });
        pendingToolUse = t.toolUseId;
      }
      messages.push({ role: "assistant", content });
    } else {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [];
      if (pendingToolUse) {
        content.push({ type: "tool_result", tool_use_id: pendingToolUse, content: "The drawing was rendered and shown to the applicant." });
        pendingToolUse = undefined;
      }
      content.push({ type: "text", text: t.text });
      messages.push({ role: "user", content });
    }
  }
  return messages;
}

export async function askClerk(turns: Turn[]): Promise<ClerkReply> {
  client ??= new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [FILE_DRAWING_TOOL as unknown as Anthropic.Beta.BetaTool],
    messages: toMessages(turns),
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });

  if (response.stop_reason === "refusal") {
    return {
      reply: "The Office is unable to accept an application of that kind. Perhaps you would describe a different machine.",
      machine: null,
    };
  }

  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const tool = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
  const machine = tool ? sanitizeMachine(tool.input) : null;

  return {
    reply: text || (machine ? "The drawing has been entered into the record. Amendments may be requested." : "Noted."),
    machine,
    toolUseId: machine ? tool!.id : undefined,
  };
}
