import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkAccess } from "../session.js";
import { getChats, getMessages, searchMessages } from "../imessage/db.js";
import { sendMessage, sendToGroupChat } from "../imessage/send.js";

export function registerMcp(program) {
  program
    .command("mcp")
    .description("Start an MCP server exposing iMessage tools over stdio")
    .action(async () => {
      if (!checkAccess()) {
        console.error("Cannot read iMessage database. Grant Full Disk Access.");
        process.exit(1);
      }

      const server = new McpServer({
        name: "imessage",
        version: "1.0.0",
      });

      // Tool: send_message
      server.tool(
        "send_message",
        "Send an iMessage to a phone number, email, or group chat",
        {
          to: z.string().describe("Phone number, email, or group chat name"),
          message: z.string().describe("Text message to send"),
          group: z.boolean().optional().default(false).describe("Set true to send to a group chat by name"),
        },
        async ({ to, message, group }) => {
          try {
            if (group) {
              await sendToGroupChat(to, message);
            } else {
              await sendMessage(to, message);
            }
            return { content: [{ type: "text", text: `Message sent to ${to}` }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: list_chats
      server.tool(
        "list_chats",
        "List iMessage conversations",
        {
          limit: z.number().optional().default(20).describe("Max chats to return"),
        },
        async ({ limit }) => {
          try {
            const chats = getChats({ limit });
            const result = chats.map(c => ({
              id: c.chatId,
              name: c.displayName,
              lastMessage: c.lastMessageText?.slice(0, 100),
              lastDate: c.lastMessageDate?.toISOString(),
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: get_messages
      server.tool(
        "get_messages",
        "Get recent messages from an iMessage chat",
        {
          chat_id: z.string().optional().describe("Chat identifier to filter by"),
          handle: z.string().optional().describe("Phone number or email to filter by"),
          limit: z.number().optional().default(20).describe("Max messages to return"),
        },
        async ({ chat_id, handle, limit }) => {
          try {
            const messages = getMessages({ chatId: chat_id, handle, limit });
            const result = messages.map(m => ({
              from: m.isFromMe ? "me" : (m.handle || "unknown"),
              chat: m.chatDisplayName || m.chatId,
              date: m.date?.toISOString(),
              text: m.text || "[non-text]",
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      // Tool: search_messages
      server.tool(
        "search_messages",
        "Search iMessage history by text content",
        {
          query: z.string().describe("Text to search for"),
          limit: z.number().optional().default(20).describe("Max results to return"),
        },
        async ({ query, limit }) => {
          try {
            const results = searchMessages(query, { limit });
            const formatted = results.map(m => ({
              from: m.isFromMe ? "me" : (m.handle || "unknown"),
              chat: m.chatDisplayName || m.chatId,
              date: m.date?.toISOString(),
              text: m.text || "[non-text]",
            }));
            return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
