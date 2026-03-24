import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createBot, resolveToken } from "../session.js";
import { readConfig } from "../config.js";
import { openDb, closeDb, listChats, getMessages, searchMessages } from "../db.js";

export function registerMcp(program) {
  program
    .command("mcp")
    .description("Start an MCP server exposing Telegram tools over stdio")
    .action(async () => {
      const config = readConfig();
      const token = resolveToken(config);
      if (!token) {
        console.error("No bot token. Run setup or set TELEGRAM_BOT_TOKEN.");
        process.exit(1);
      }

      const bot = createBot(token);
      openDb();

      const server = new McpServer({
        name: "telegram",
        version: "1.0.0",
      });

      server.tool(
        "send_message",
        "Send a Telegram message",
        {
          chat_id: z.string().describe("Telegram chat ID (numeric)"),
          message: z.string().describe("Text message to send"),
        },
        async ({ chat_id, message }) => {
          try {
            await bot.api.sendMessage(chat_id, message);
            return { content: [{ type: "text", text: `Message sent to ${chat_id}` }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      server.tool(
        "list_chats",
        "List cached Telegram chats",
        {
          limit: z.number().optional().default(20).describe("Max chats to return"),
        },
        async ({ limit }) => {
          const chats = listChats(limit);
          const result = chats.map(c => ({
            id: c.chat_id,
            type: c.chat_type,
            name: c.title || c.username || c.chat_id,
          }));
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        },
      );

      server.tool(
        "get_messages",
        "Get recent messages from a Telegram chat",
        {
          chat_id: z.string().describe("Chat ID"),
          limit: z.number().optional().default(20).describe("Max messages"),
          days: z.number().optional().default(7).describe("Messages from last N days"),
        },
        async ({ chat_id, limit, days }) => {
          const messages = getMessages(chat_id, days, limit);
          const result = messages.map(m => ({
            from: m.from_me ? "bot" : (m.push_name || m.participant || "unknown"),
            date: new Date(m.timestamp * 1000).toISOString(),
            text: m.body || "[non-text]",
          }));
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        },
      );

      server.tool(
        "search_messages",
        "Search cached Telegram messages by text",
        {
          query: z.string().describe("Text to search for"),
        },
        async ({ query }) => {
          const results = searchMessages(query, null);
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        },
      );

      server.tool(
        "send_poll",
        "Send a Telegram poll",
        {
          chat_id: z.string().describe("Chat ID"),
          question: z.string().describe("Poll question"),
          options: z.array(z.string()).describe("Poll options (2-10 items)"),
        },
        async ({ chat_id, question, options }) => {
          try {
            await bot.api.sendPoll(chat_id, question, options);
            return { content: [{ type: "text", text: `Poll sent to ${chat_id}` }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
