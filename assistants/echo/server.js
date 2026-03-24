import { createServer } from "http";

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/chat") {
    const body = await new Promise(resolve => {
      let data = "";
      req.on("data", chunk => data += chunk);
      req.on("end", () => resolve(JSON.parse(data)));
    });

    const { type, jid, senderName, text } = body;
    console.log(`[${type}] ${senderName || jid}: ${text}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ text: `Echo: ${text}` }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Echo assistant running. POST to /api/chat.\n");
});

server.listen(PORT, () => console.log(`Echo assistant on :${PORT}`));
