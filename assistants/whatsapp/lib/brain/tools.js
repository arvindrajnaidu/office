import { findMatchingGroups } from "./resolve-group.js";

// Tool definitions — provider-agnostic schema
export const toolDefs = [
  {
    name: "list_groups",
    description: "List all WhatsApp groups the user is in. Returns group names, JIDs, and member counts.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "search_groups",
    description: "Fuzzy search for a group by name. Returns matching groups with their JIDs. Use this to resolve a group name before other operations.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Group name or partial name to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_messages",
    description: "Read recent messages from a group or DM contact. Accepts a group JID, group name, contact JID, or contact name (fuzzy matched). Returns sender, timestamp, and message text.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Group JID, group name, contact JID, or contact name" },
        count: { type: "number", description: "Max number of messages to return (default 20)" },
        days: { type: "number", description: "How many days back to read (default 7)" },
      },
      required: ["chat"],
    },
  },
  {
    name: "search_messages",
    description: "Search for messages across all chats (groups and DMs). Can search by keyword, sender name, or both. Returns matching messages with chat name, sender, and context.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword or phrase in message text" },
        sender: { type: "string", description: "Search by sender name (e.g. 'Prasanna')" },
      },
      required: [],
    },
  },
  {
    name: "extract_links",
    description: "Extract all URLs/links shared in a chat (group or DM), categorized by platform (YouTube, Instagram, etc). Accepts group/contact name or JID.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Group JID, group name, contact JID, or contact name" },
        days: { type: "number", description: "How many days back to scan (default 7)" },
      },
      required: ["chat"],
    },
  },
  {
    name: "list_output_files",
    description: "List previously generated output files (video digests, etc). Use this to check if a digest already exists before creating a new one.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Optional chat name to filter results" },
      },
      required: [],
    },
  },
  {
    name: "download_video",
    description: "Download a single video from a URL (Instagram reel, YouTube short, TikTok, Facebook reel, etc.) and save it to the output folder. Returns the filename — use send_video to deliver it.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "The video URL to download" },
      },
      required: ["url"],
    },
  },
  {
    name: "create_video_digest",
    description: "Download ALL shared video links from a chat over a time period and combine them into a single video file. Returns the filename — use send_video to deliver it.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Group JID, group name, contact JID, or contact name" },
        days: { type: "number", description: "How many days back to scan (default 7)" },
      },
      required: ["chat"],
    },
  },
  {
    name: "send_message",
    description: "Send a text message to a group or contact. Defaults to self-chat unless a target is specified.",
    parameters: {
      type: "object",
      properties: {
        chat: { type: "string", description: "Group name, contact name, or JID. Omit to send to self-chat." },
        message: { type: "string", description: "Text message to send" },
      },
      required: ["message"],
    },
  },
  {
    name: "send_video",
    description: "Send a video file from the output folder to a chat. Defaults to self-chat. Use list_output_files to find available files.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Filename from the output folder" },
        chat: { type: "string", description: "Target group/contact name or JID. Omit to send to self-chat." },
        caption: { type: "string", description: "Optional caption for the video" },
      },
      required: ["file"],
    },
  },
  {
    name: "send_image",
    description: "Send an image file from the output folder to a chat. Defaults to self-chat.",
    parameters: {
      type: "object",
      properties: {
        file: { type: "string", description: "Filename from the output folder" },
        chat: { type: "string", description: "Target group/contact name or JID. Omit to send to self-chat." },
        caption: { type: "string", description: "Optional caption for the image" },
      },
      required: ["file"],
    },
  },
  {
    name: "send_poll",
    description: "Send a poll to a chat. Defaults to self-chat.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "The poll question" },
        options: { type: "array", items: { type: "string" }, description: "Poll answer options (2-12 choices)" },
        chat: { type: "string", description: "Target group/contact name or JID. Omit to send to self-chat." },
      },
      required: ["question", "options"],
    },
  },
  {
    name: "schedule_send",
    description: "Schedule a message to be sent later. The bot must be running at the scheduled time.",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Text message to send" },
        send_at: { type: "string", description: "When to send, as an ISO 8601 datetime string" },
        chat: { type: "string", description: "Target group/contact name or JID. Omit to send to self-chat." },
      },
      required: ["message", "send_at"],
    },
  },
  {
    name: "list_scheduled",
    description: "List all pending scheduled messages.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "cancel_scheduled",
    description: "Cancel a pending scheduled message by its ID.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "number", description: "The scheduled message ID to cancel" },
      },
      required: ["id"],
    },
  },
  {
    name: "activate_group",
    description: "Enable the bot for a group or DM contact. Creates a persona so the bot responds to triggers.",
    parameters: {
      type: "object",
      properties: {
        group: { type: "string", description: "Group name or JID to activate" },
        persona: { type: "string", description: "Optional custom persona instructions." },
      },
      required: ["group"],
    },
  },
  {
    name: "deactivate_group",
    description: "Disable the bot for a group or DM contact. Removes the persona.",
    parameters: {
      type: "object",
      properties: {
        group: { type: "string", description: "Group name or JID to deactivate" },
      },
      required: ["group"],
    },
  },
  {
    name: "update_persona",
    description: "Update the persona instructions for an activated group or DM contact.",
    parameters: {
      type: "object",
      properties: {
        group: { type: "string", description: "Group name or JID" },
        persona: { type: "string", description: "New persona instructions" },
      },
      required: ["group", "persona"],
    },
  },
  {
    name: "list_active_groups",
    description: "List all groups and DM contacts that have the bot activated with their persona summaries.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "pause_groups",
    description: "Pause all group bot responses globally.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "resume_groups",
    description: "Resume group bot responses globally after being paused.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "query_db",
    description: "Run a read-only SQL query against the messages database. Table: messages (jid, message_id, from_me, participant, push_name, body, timestamp). Timestamp is unix seconds.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string", description: "SELECT query to run" },
      },
      required: ["sql"],
    },
  },
];

// Convert to Anthropic format
export function toAnthropicTools(extraDefs = []) {
  return [...toolDefs, ...extraDefs].map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

// Convert to OpenAI format
export function toOpenAITools(extraDefs = []) {
  return [...toolDefs, ...extraDefs].map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Create a tool executor that uses WhatsAppClient for all operations.
 *
 * @param {import('../whatsapp-client.js').WhatsAppClient} client
 * @param {object} opts
 * @param {string} opts.selfJid - the bot's own JID (for self-chat default)
 */
export function createToolExecutor(client, { selfJid }) {
  // Cache groups + contacts per request
  let _groups = null;
  let _contacts = null;

  async function getGroups() {
    if (!_groups) _groups = await client.getGroups();
    return _groups;
  }

  async function getContacts() {
    if (!_contacts) _contacts = await client.getContacts();
    return _contacts;
  }

  /**
   * Resolve a chat identifier — tries groups first, then DM contacts.
   */
  async function resolveChat(input) {
    // Direct JID
    if (input.includes("@")) {
      if (input.includes("@g.us")) {
        const groups = await getGroups();
        const group = groups.find((g) => g.id === input);
        if (group) return { jid: group.id, name: group.name };
        return null;
      }
      const contacts = await getContacts();
      const contact = contacts.find((c) => c.id === input);
      if (contact) return { jid: input, name: contact.name };
      return { jid: input, name: input };
    }

    // Try groups first
    const groups = await getGroups();
    const matches = findMatchingGroups(groups, input);
    if (matches.length === 1) return { jid: matches[0].id, name: matches[0].name };
    if (matches.length > 1) {
      return matches.map((g) => ({ jid: g.id, name: g.name }));
    }

    // Fuzzy match DM contacts
    const queryWords = input.toLowerCase().split(/\s+/);
    const contacts = await getContacts();
    const dmMatches = [];
    for (const { id, name } of contacts) {
      if (id.includes("@g.us")) continue;
      const nameLower = name.toLowerCase();
      if (queryWords.some((w) => nameLower.includes(w))) {
        dmMatches.push({ jid: id, name });
      }
    }

    if (dmMatches.length === 0) return null;
    if (dmMatches.length === 1) return dmMatches[0];
    return dmMatches;
  }

  async function getPersonaForChat(chatName) {
    try {
      const groups = await getGroups();
      const group = groups.find((g) => g.name === chatName);
      if (group) {
        const persona = await client.getPersona(group.id);
        return persona?.content || null;
      }
    } catch {
      // Persona endpoint may not exist — non-fatal
    }
    return null;
  }

  async function withPersona(resultObj, chatName) {
    const persona = await getPersonaForChat(chatName);
    if (persona) resultObj.persona = persona;
    return JSON.stringify(resultObj);
  }

  return async function executeTool(name, input) {
    console.log(`  [tool] ${name}(${JSON.stringify(input)})`);
    const result = await _executeTool(name, input);
    const preview = result.length > 200 ? result.slice(0, 200) + "..." : result;
    console.log(`  [result] ${preview}`);
    return result;
  };

  async function _executeTool(name, input) {
    switch (name) {
      case "list_groups": {
        const groups = await getGroups();
        const list = groups.map((g) => ({
          name: g.name,
          jid: g.id,
          participants: g.memberCount || 0,
        }));
        return JSON.stringify(list.slice(0, 50));
      }

      case "search_groups": {
        const groups = await getGroups();
        const matches = findMatchingGroups(groups, input.query);
        if (matches.length === 0) return JSON.stringify({ matches: [], message: "No groups found matching that name" });
        return JSON.stringify(matches.map((g) => ({
          name: g.name,
          jid: g.id,
          participants: g.memberCount || 0,
        })));
      }

      case "read_messages": {
        const chatInput = input.chat || input.group;
        const resolved = await resolveChat(chatInput);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${chatInput}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }

        const messages = await client.getMessages(resolved.jid, {
          days: input.days || 7,
          limit: input.count || 20,
        });
        if (messages.length === 0) {
          return await withPersona({ chat: resolved.name, jid: resolved.jid, messages: [], message: "No messages found in the requested time range." }, resolved.name);
        }
        return await withPersona({ chat: resolved.name, jid: resolved.jid, count: messages.length, messages }, resolved.name);
      }

      case "search_messages": {
        const q = (input.query || "").trim();
        const sender = (input.sender || "").trim();
        if (!q && !sender) return JSON.stringify({ results: [], message: "Provide a query or sender" });

        const results = await client.searchMessages(q || null, sender || null);
        return JSON.stringify({ query: input.query || null, sender: input.sender || null, count: results.length, results });
      }

      case "extract_links": {
        const chatInput = input.chat || input.group;
        const resolved = await resolveChat(chatInput);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${chatInput}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }

        const result = await client.extractLinks(resolved.jid, input.days || 7);
        return await withPersona({ chat: resolved.name, ...result }, resolved.name);
      }

      case "list_output_files": {
        const result = await client.listOutputFiles(input.chat || "");
        return JSON.stringify(result);
      }

      case "download_video": {
        if (!input.url) return JSON.stringify({ error: "url is required" });
        try {
          const result = await client.downloadVideo(input.url);
          return JSON.stringify({
            status: "completed",
            file: result.file,
            sizeMB: result.sizeMB,
            next_step: `Call send_video with file="${result.file}" to deliver this video. Do NOT call download_video again.`,
          });
        } catch (err) {
          return JSON.stringify({ error: `Failed to download video: ${err.message}` });
        }
      }

      case "create_video_digest": {
        const chatInput = input.chat || input.group;
        const resolved = await resolveChat(chatInput);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${chatInput}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }

        try {
          const result = await client.createDigest(resolved.jid, input.days || 7);
          if (result.error) return JSON.stringify(result);
          return JSON.stringify({
            status: "completed",
            chat: resolved.name,
            file: result.file,
            sizeMB: result.sizeMB,
            downloaded: result.downloaded,
            failed: result.failed,
            next_step: `Call send_video with file="${result.file}" to deliver this video. Do NOT call create_video_digest again.`,
          });
        } catch (err) {
          return JSON.stringify({ error: `Failed to create digest: ${err.message}` });
        }
      }

      case "send_message": {
        if (!input.message) return JSON.stringify({ error: "Message text is required" });

        let targetJid = selfJid;
        let targetName = null;
        if (input.chat) {
          const resolved = await resolveChat(input.chat);
          if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.chat}"` });
          if (Array.isArray(resolved)) {
            return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
          }
          targetJid = resolved.jid;
          targetName = resolved.name;
        }

        await client.sendText(targetJid, input.message);
        return await withPersona({ status: "sent", to: targetJid === selfJid ? "self-chat" : targetName }, targetName);
      }

      case "send_video": {
        let targetJid = selfJid;
        let targetName = null;
        if (input.chat) {
          const resolved = await resolveChat(input.chat);
          if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.chat}"` });
          if (Array.isArray(resolved)) {
            return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
          }
          targetJid = resolved.jid;
          targetName = resolved.name;
        }

        try {
          await client.sendOutputFile(targetJid, input.file, "video", input.caption || "");
          return await withPersona({ status: "sent", file: input.file, to: targetJid === selfJid ? "self-chat" : targetName }, targetName);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      }

      case "send_image": {
        let targetJid = selfJid;
        let targetName = null;
        if (input.chat) {
          const resolved = await resolveChat(input.chat);
          if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.chat}"` });
          if (Array.isArray(resolved)) {
            return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
          }
          targetJid = resolved.jid;
          targetName = resolved.name;
        }

        try {
          await client.sendOutputFile(targetJid, input.file, "image", input.caption || "");
          return await withPersona({ status: "sent", file: input.file, to: targetJid === selfJid ? "self-chat" : targetName }, targetName);
        } catch (err) {
          return JSON.stringify({ error: err.message });
        }
      }

      case "send_poll": {
        if (!input.question || !input.options?.length) {
          return JSON.stringify({ error: "Question and options are required" });
        }

        let targetJid = selfJid;
        let targetName = null;
        if (input.chat) {
          const resolved = await resolveChat(input.chat);
          if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.chat}"` });
          if (Array.isArray(resolved)) {
            return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
          }
          targetJid = resolved.jid;
          targetName = resolved.name;
        }

        await client.sendPoll(targetJid, input.question, input.options);
        return await withPersona({ status: "sent", question: input.question, options: input.options, to: targetJid === selfJid ? "self-chat" : targetName }, targetName);
      }

      case "schedule_send": {
        if (!input.message) return JSON.stringify({ error: "Message text is required" });
        if (!input.send_at) return JSON.stringify({ error: "send_at is required" });

        const sendAt = new Date(input.send_at).getTime();
        if (isNaN(sendAt)) return JSON.stringify({ error: "Invalid date format. Use ISO 8601" });
        if (sendAt <= Date.now()) return JSON.stringify({ error: `Scheduled time must be in the future. Current: ${new Date().toISOString()}` });

        let targetJid = selfJid;
        let targetName = "self-chat";
        if (input.chat) {
          const resolved = await resolveChat(input.chat);
          if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.chat}"` });
          if (Array.isArray(resolved)) {
            return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
          }
          targetJid = resolved.jid;
          targetName = resolved.name;
        }

        const result = await client.createScheduled(targetJid, targetName, input.message, sendAt);
        return JSON.stringify({ status: "scheduled", id: result.id, chat: targetName, scheduled_at: new Date(sendAt).toISOString() });
      }

      case "list_scheduled": {
        const scheduled = await client.getScheduled();
        return JSON.stringify({ count: scheduled.length, scheduled });
      }

      case "cancel_scheduled": {
        if (!input.id) return JSON.stringify({ error: "ID is required" });
        const ok = await client.cancelScheduled(input.id);
        return JSON.stringify(ok ? { status: "cancelled", id: input.id } : { error: `No pending scheduled message with ID ${input.id}` });
      }

      case "activate_group": {
        const resolved = await resolveChat(input.group);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.group}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }
        const content = input.persona || "You are a helpful assistant. Be concise.";
        const result = await client.setPersona(resolved.jid, resolved.name, content);
        return JSON.stringify({ status: "activated", chat: resolved.name, jid: resolved.jid, type: resolved.jid.includes("@g.us") ? "group" : "dm" });
      }

      case "deactivate_group": {
        const resolved = await resolveChat(input.group);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.group}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }
        const ok = await client.deletePersona(resolved.jid);
        return JSON.stringify({ status: "deactivated", chat: resolved.name, jid: resolved.jid });
      }

      case "update_persona": {
        const resolved = await resolveChat(input.group);
        if (!resolved) return JSON.stringify({ error: `No chat found matching "${input.group}"` });
        if (Array.isArray(resolved)) {
          return JSON.stringify({ error: "Multiple chats match. Ask the user which one they mean.", matches: resolved });
        }
        try {
          const existing = await client.getPersona(resolved.jid);
          if (!existing) return JSON.stringify({ error: `"${resolved.name}" is not activated. Use activate_group first.` });
        } catch {
          return JSON.stringify({ error: `"${resolved.name}" is not activated. Use activate_group first.` });
        }
        await client.setPersona(resolved.jid, resolved.name, input.persona);
        return JSON.stringify({ status: "updated", chat: resolved.name, jid: resolved.jid });
      }

      case "list_active_groups": {
        const personas = await client.getPersonas();
        if (personas.length === 0) return JSON.stringify({ count: 0, chats: [], message: "No chats are activated." });
        return JSON.stringify({
          count: personas.length,
          chats: personas.map((p) => ({
            name: p.groupName,
            jid: p.jid,
            type: p.type,
            persona_summary: p.personaSummary,
          })),
        });
      }

      case "pause_groups": {
        await client.updateConfig({ groupsEnabled: false });
        return JSON.stringify({ status: "paused", message: "All group responses are now paused." });
      }

      case "resume_groups": {
        await client.updateConfig({ groupsEnabled: true });
        return JSON.stringify({ status: "resumed", message: "Group responses are now active." });
      }

      case "query_db": {
        if (!input.sql) return JSON.stringify({ error: "sql is required" });
        const result = await client.queryDb(input.sql);
        return JSON.stringify(result);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  }
}
