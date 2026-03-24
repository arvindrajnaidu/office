import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getAuthDir, authExists, connectAndWait } from "../session.js";
import { toJid } from "../utils/jid.js";
import { extractBody } from "../utils/formatters.js";

export function registerMcp(program) {
  program
    .command("mcp")
    .description("Start an MCP server exposing WhatsApp tools over stdio")
    .action(async (opts, cmd) => {
      const globals = cmd.optsWithGlobals();
      const authDir = getAuthDir(globals.authDir);

      if (!authExists(authDir)) {
        console.error("Not logged in. Run: whatsapp login");
        process.exit(1);
      }

      let sock;
      try {
        sock = await connectAndWait({ authDir, verbose: globals.verbose });
        await sock.sendPresenceUpdate("available");
      } catch (err) {
        console.error("Failed to connect:", err.message);
        process.exit(1);
      }

      // Create MCP server
      const server = new McpServer({
        name: "whatsapp",
        version: "1.0.0",
      });

      // Tool: send_message
      server.tool(
        "send_message",
        "Send a WhatsApp text message to a phone number or JID",
        {
          to: z.string().describe("Phone number (e.g. 60123456789) or JID"),
          message: z.string().describe("Text message to send"),
        },
        async ({ to, message }) => {
          try {
            const jid = toJid(to);
            await sock.sendMessage(jid, { text: message });
            return { content: [{ type: "text", text: `Message sent to ${jid}` }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: list_chats
      server.tool(
        "list_chats",
        "List WhatsApp group chats",
        {
          limit: z.number().optional().default(20).describe("Max chats to return"),
        },
        async ({ limit }) => {
          try {
            const groups = await sock.groupFetchAllParticipating();
            const chats = Object.entries(groups)
              .map(([id, meta]) => ({ id, name: meta.subject }))
              .slice(0, limit);
            return { content: [{ type: "text", text: JSON.stringify(chats, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: get_messages
      server.tool(
        "get_messages",
        "Get recent messages from a WhatsApp chat",
        {
          chat_id: z.string().describe("Phone number or JID of the chat"),
          limit: z.number().optional().default(20).describe("Max messages to return"),
        },
        async ({ chat_id, limit }) => {
          try {
            const jid = toJid(chat_id);
            const messages = [];

            await new Promise((resolve) => {
              const handler = ({ messages: msgs }) => {
                messages.push(...msgs);
                resolve();
              };
              sock.ev.on("messaging-history.set", handler);
              setTimeout(() => {
                sock.ev.off("messaging-history.set", handler);
                resolve();
              }, 5000);
            });

            const chatMessages = messages
              .filter((m) => m.key.remoteJid === jid)
              .slice(0, limit)
              .map((m) => ({
                from: m.key.fromMe ? "me" : (m.key.participant || m.key.remoteJid),
                timestamp: m.messageTimestamp
                  ? new Date(Number(m.messageTimestamp) * 1000).toISOString()
                  : null,
                body: extractBody(m) || "[non-text]",
              }));

            return { content: [{ type: "text", text: JSON.stringify(chatMessages, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: search_chats
      server.tool(
        "search_chats",
        "Search WhatsApp group chats by name or JID",
        {
          query: z.string().describe("Search term to match against chat name or JID"),
          limit: z.number().optional().default(10).describe("Max results to return"),
        },
        async ({ query, limit }) => {
          try {
            const groups = await sock.groupFetchAllParticipating();
            const term = query.toLowerCase();
            const results = Object.entries(groups)
              .filter(
                ([id, meta]) =>
                  meta.subject?.toLowerCase().includes(term) || id.includes(term),
              )
              .map(([id, meta]) => ({ id, name: meta.subject }))
              .slice(0, limit);
            return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: get_group_info
      server.tool(
        "get_group_info",
        "Get detailed info about a WhatsApp group: description, members, admins, creation date",
        {
          group_id: z.string().describe("Group JID (e.g. 120363012345@g.us)"),
        },
        async ({ group_id }) => {
          try {
            const meta = await sock.groupMetadata(group_id);
            const info = {
              id: meta.id,
              name: meta.subject,
              description: meta.desc || null,
              owner: meta.owner || null,
              created: meta.creation
                ? new Date(meta.creation * 1000).toISOString()
                : null,
              size: meta.size || meta.participants?.length || 0,
              participants: (meta.participants || []).map((p) => ({
                id: p.id,
                admin: p.admin || null,
              })),
            };
            return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Connect MCP server to stdio transport
      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
