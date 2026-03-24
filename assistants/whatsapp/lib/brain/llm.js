import { resolveProvider } from "../config.js";
import { toAnthropicTools, toOpenAITools } from "./tools.js";

const MAX_TOOL_ROUNDS = 10;

// ── Anthropic ──────────────────────────────────────────────

async function anthropicRequest(systemPrompt, messages, tools, key) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      tools,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function runAnthropic(systemPrompt, messages, executeTool, key, mcpToolDefs = []) {
  const tools = toAnthropicTools(mcpToolDefs);
  const msgs = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await anthropicRequest(systemPrompt, msgs, tools, key);

    const textBlocks = data.content.filter((b) => b.type === "text");
    const toolBlocks = data.content.filter((b) => b.type === "tool_use");

    if (data.stop_reason !== "tool_use" || toolBlocks.length === 0) {
      return textBlocks.map((b) => b.text).join("\n") || "";
    }

    msgs.push({ role: "assistant", content: data.content });

    const toolResults = [];
    for (const block of toolBlocks) {
      const result = await executeTool(block.name, block.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    msgs.push({ role: "user", content: toolResults });
  }

  return "I ran into too many steps. Could you simplify your request?";
}

// ── OpenAI ─────────────────────────────────────────────────

async function openaiRequest(systemPrompt, messages, tools, key) {
  const apiMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: apiMessages,
      tools,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function runOpenAI(systemPrompt, messages, executeTool, key, mcpToolDefs = []) {
  const tools = toOpenAITools(mcpToolDefs);
  const msgs = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const data = await openaiRequest(systemPrompt, msgs, tools, key);
    const choice = data.choices[0];
    const assistantMsg = choice.message;

    if (choice.finish_reason !== "tool_calls" || !assistantMsg.tool_calls?.length) {
      return assistantMsg.content || "";
    }

    msgs.push(assistantMsg);

    for (const tc of assistantMsg.tool_calls) {
      const input = JSON.parse(tc.function.arguments || "{}");
      const result = await executeTool(tc.function.name, input);
      msgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result,
      });
    }
  }

  return "I ran into too many steps. Could you simplify your request?";
}

// ── Public API ─────────────────────────────────────────────

/**
 * Simple text chat (no tools).
 */
export async function chat(systemPrompt, messages) {
  const { provider, key } = resolveProvider();

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}`);
    const data = await res.json();
    return data.content[0]?.text || "";
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}`);
  const data = await res.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Agentic chat with tool use.
 */
export async function agentChat(systemPrompt, messages, executeTool, mcpToolDefs = []) {
  const { provider, key } = resolveProvider();

  if (provider === "anthropic") {
    return runAnthropic(systemPrompt, messages, executeTool, key, mcpToolDefs);
  }
  return runOpenAI(systemPrompt, messages, executeTool, key, mcpToolDefs);
}
