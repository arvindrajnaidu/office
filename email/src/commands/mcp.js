import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createClient, resolveApiKey, resolveFromAddress } from "../session.js";
import { readConfig } from "../config.js";
import { openDb, listEmails, searchMessages } from "../db.js";

export function registerMcp(program) {
  program
    .command("mcp")
    .description("Start an MCP server exposing email tools over stdio")
    .action(async () => {
      const config = readConfig();
      const apiKey = resolveApiKey(config);
      if (!apiKey) {
        console.error("No Resend API key. Run setup or set RESEND_API_KEY.");
        process.exit(1);
      }

      const client = createClient(apiKey);
      const from = resolveFromAddress(config) || "bot@example.com";
      openDb();

      const server = new McpServer({ name: "email", version: "1.0.0" });

      server.tool(
        "send_email",
        "Send an email via Resend",
        {
          to: z.string().describe("Recipient email address"),
          subject: z.string().describe("Email subject"),
          body: z.string().describe("Email body (plain text)"),
          html: z.string().optional().describe("Email body (HTML, overrides body)"),
        },
        async ({ to, subject, body, html }) => {
          try {
            const payload = { from, to, subject };
            if (html) payload.html = html;
            else payload.text = body;
            const { data, error } = await client.emails.send(payload);
            if (error) return { content: [{ type: "text", text: `Failed: ${error.message}` }], isError: true };
            return { content: [{ type: "text", text: `Email sent to ${to} (id: ${data.id})` }] };
          } catch (err) {
            return { content: [{ type: "text", text: `Failed: ${err.message}` }], isError: true };
          }
        },
      );

      server.tool(
        "list_emails",
        "List sent/received emails from local database",
        { limit: z.number().optional().default(20) },
        async ({ limit }) => {
          const emails = listEmails(limit);
          const result = emails.map(e => ({
            id: e.id, from: e.from_addr, to: e.to_addr,
            subject: e.subject, status: e.status,
            date: new Date(e.created_at * 1000).toISOString(),
          }));
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        },
      );

      server.tool(
        "search_emails",
        "Search email content in local database",
        { query: z.string().describe("Text to search for") },
        async ({ query }) => {
          const results = searchMessages(query);
          return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
