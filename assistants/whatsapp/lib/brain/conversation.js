import { agentChat } from "./llm.js";
import { createToolExecutor } from "./tools.js";
import { saveConversationMessage, loadConversationHistory, clearConversation } from "../db.js";

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_HISTORY = 20;

const SYSTEM_PROMPT = `You are a friendly WhatsApp assistant. The user is messaging you from their own WhatsApp chat (self-chat). Unless the user explicitly asks you to post to a specific group or contact, all replies and generated content (videos, etc.) are sent back to this self-chat only.

How to handle requests:
- Use read_messages to see what's been said in a group OR a DM contact. Pass a group name, contact name, or JID.
- Use search_groups to find a group when the user gives you a name. If multiple matches, ask which one.
- Use extract_links to find shared URLs.
- Use list_output_files to check for existing video digests before creating a new one — avoid repeating work.
- Use create_video_digest to download and combine shared videos into one file. Then use send_video to deliver it.
- Use send_video to send a video file from the output folder. Always follow create_video_digest with send_video.
- Use send_image to send an image file from the output folder.
- Use send_poll to send a poll to a group or contact.
- Use send_message to send text to a group or contact. Omit the chat parameter to send to self-chat.
- IMPORTANT: Never send messages to groups or contacts unless the user explicitly asks you to. When in doubt, send to self-chat.
- Use query_db to run SQL queries against the messages database for analytics, counts, or complex filtering. Table: messages (jid, message_id, from_me, participant, push_name, body, timestamp). Timestamp is unix epoch seconds. Group JIDs end with @g.us.
- Use search_messages to find messages across all chats (groups and DMs).
- Use schedule_send to schedule a message for later delivery. The bot must be running at the scheduled time.
- Use list_scheduled to see pending scheduled messages, and cancel_scheduled to remove one.
- You can chain tools: e.g. search for a group, then read its messages, then summarize.

Bot persona management:
- Use activate_group to enable the bot for a group or DM contact. In groups it responds to ❓ reactions and reply-to-bot. In DMs it responds to any message from that contact.
- Use deactivate_group to disable the bot for a group or DM contact.
- Use update_persona to change the bot's personality/instructions for a group or DM contact.
- Use list_active_groups to see all groups and DM contacts with active bot personas.
- Use pause_groups / resume_groups to globally pause/resume all bot responses.

When summarizing conversations, read the messages first with read_messages, then write the summary yourself.

When a tool result includes a "persona" field, follow those instructions for the remainder of the conversation about that chat. Persona instructions define your tone, style, and behavior for that specific chat.

Be conversational, concise, and helpful. Use WhatsApp-style formatting (*bold*, _italic_) where appropriate.`;

/**
 * Process a self-chat user message through the agentic LLM loop.
 *
 * @param {string} text - user message
 * @param {import('../whatsapp-client.js').WhatsAppClient} client - WhatsApp API client
 * @param {string} selfJid - bot's own JID
 * @returns {Promise<string>} reply text
 */
export async function processMessage(text, client, selfJid) {
  const conversationHistory = loadConversationHistory(selfJid, INACTIVITY_TIMEOUT_MS, MAX_HISTORY);

  conversationHistory.push({ role: "user", content: text });
  saveConversationMessage(selfJid, "user", text);

  const executeTool = createToolExecutor(client, { selfJid });

  const now = new Date();
  const prompt = SYSTEM_PROMPT + `\n\nCurrent date/time: ${now.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;

  const reply = await agentChat(prompt, conversationHistory, executeTool);

  saveConversationMessage(selfJid, "assistant", reply);

  return reply;
}

export function resetHistory(jid) {
  clearConversation(jid);
}

// ── Group conversation processing ─────────────────────────

const GROUP_INACTIVITY_MS = 60 * 60 * 1000;
const GROUP_MAX_HISTORY = 10;

/**
 * Process a group message triggered by ❓ reaction or reply-to-bot.
 *
 * @param {string} text
 * @param {string} jid
 * @param {string} groupName
 * @param {string} persona
 * @param {string} senderName
 * @param {import('../whatsapp-client.js').WhatsAppClient} client
 * @param {string} selfJid
 * @param {string|null} quotedContext
 * @returns {Promise<string>} reply text
 */
export async function processGroupMessage(text, jid, groupName, persona, senderName, client, selfJid, quotedContext) {
  const history = loadConversationHistory(jid, GROUP_INACTIVITY_MS, GROUP_MAX_HISTORY);

  const userContent = quotedContext
    ? `[Replying to: "${quotedContext}"]\n\n${senderName}: ${text}`
    : `${senderName}: ${text}`;

  history.push({ role: "user", content: userContent });
  saveConversationMessage(jid, "user", userContent, senderName);

  const executeTool = createToolExecutor(client, { selfJid });

  const now = new Date();
  const isGroup = jid.includes("@g.us");
  const systemPrompt = isGroup
    ? `You are a WhatsApp group assistant in "${groupName}" (JID: ${jid}). ${persona}

A message has been flagged for your attention (via ❓ reaction or reply to your message). Respond helpfully and concisely.

Rules:
- Be concise — this is a group chat, not a 1-on-1 conversation.
- Use WhatsApp-style formatting (*bold*, _italic_) where appropriate.
- Do not send messages to other groups or contacts unless explicitly asked.
- When using send_video, send_image, send_message, or send_poll, always set chat="${groupName}" to send to this group. Never default to self-chat when responding to a group trigger.
- You have access to tools to read messages, search, etc. Use them if the question requires chat context.

Current date/time: ${now.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
    : `You are a WhatsApp assistant chatting with ${groupName}. ${persona}

Rules:
- Be conversational and concise.
- Use WhatsApp-style formatting (*bold*, _italic_) where appropriate.
- Do not send messages to other groups or contacts unless explicitly asked.
- You have access to tools to read messages, search, etc. Use them if the question requires context.

Current date/time: ${now.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`;

  const reply = await agentChat(systemPrompt, history, executeTool);

  saveConversationMessage(jid, "assistant", reply);

  return reply;
}
