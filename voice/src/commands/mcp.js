import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDb, listCalls, getTranscripts } from "../db.js";

export function registerMcp(program) {
  program
    .command("mcp")
    .description("Start an MCP server exposing voice tools over stdio")
    .action(async () => {
      openDb();

      const server = new McpServer({ name: "voice", version: "1.0.0" });

      server.tool(
        "list_calls",
        "List recent phone calls",
        { limit: z.number().optional().default(20) },
        async ({ limit }) => {
          const calls = listCalls(limit);
          const result = calls.map(c => ({
            callSid: c.call_sid,
            from: c.from_number,
            status: c.status,
            duration: c.duration,
            date: new Date(c.started_at).toISOString(),
          }));
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        },
      );

      server.tool(
        "get_transcript",
        "Get the transcript of a phone call",
        { call_sid: z.string().describe("Call SID") },
        async ({ call_sid }) => {
          const transcripts = getTranscripts(call_sid);
          const result = transcripts.map(t => ({
            role: t.role,
            text: t.content,
            time: new Date(t.timestamp).toISOString(),
          }));
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        },
      );

      const transport = new StdioServerTransport();
      await server.connect(transport);
    });
}
