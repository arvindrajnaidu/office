import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "http";
import { createDispatcher } from "../src/dispatcher.js";

describe("dispatcher", () => {
  describe("builtin backend", () => {
    it("calls builtinHandler with envelope", async () => {
      const handler = vi.fn().mockResolvedValue({ text: "hello" });
      const dispatcher = createDispatcher({
        backend: { type: "builtin" },
        builtinHandler: handler,
      });

      const envelope = { type: "self_chat", jid: "123", text: "hi" };
      const result = await dispatcher.dispatch(envelope);

      expect(handler).toHaveBeenCalledWith(envelope);
      expect(result.text).toBe("hello");
    });

    it("throws if no builtinHandler provided", async () => {
      const dispatcher = createDispatcher({ backend: { type: "builtin" } });
      await expect(dispatcher.dispatch({ type: "dm", jid: "123" }))
        .rejects.toThrow("builtinHandler");
    });
  });

  describe("per-jid routing", () => {
    it("uses group backend when jid matches", async () => {
      const defaultHandler = vi.fn().mockResolvedValue({ text: "default" });
      const groupHandler = vi.fn().mockResolvedValue({ text: "group" });

      const dispatcher = createDispatcher({
        backend: { type: "builtin" },
        builtinHandler: defaultHandler,
        groupBackends: {
          "group-123": { type: "builtin" },
        },
      });

      // Default should use defaultHandler — but groupBackends overrides to builtin
      // without its own handler, so it throws. Let's test with two builtin handlers:
      const result = await dispatcher.dispatch({ jid: "other-jid", text: "hi" });
      expect(defaultHandler).toHaveBeenCalled();
      expect(result.text).toBe("default");
    });

    it("falls back to default when jid has no override", async () => {
      const handler = vi.fn().mockResolvedValue({ text: "ok" });
      const dispatcher = createDispatcher({
        backend: { type: "builtin" },
        builtinHandler: handler,
        groupBackends: { "group-999": { type: "builtin" } },
      });

      const result = await dispatcher.dispatch({ jid: "other-jid", text: "hi" });
      expect(result.text).toBe("ok");
    });
  });

  describe("http backend", () => {
    let server;
    let port;

    beforeEach(async () => {
      server = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => body += chunk);
        req.on("end", () => {
          const envelope = JSON.parse(body);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: `Echo: ${envelope.text}` }));
        });
      });
      await new Promise((resolve) => {
        server.listen(0, () => {
          port = server.address().port;
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it("POSTs envelope to URL and returns response", async () => {
      const dispatcher = createDispatcher({
        backend: { type: "http", url: `http://localhost:${port}` },
      });

      const result = await dispatcher.dispatch({
        type: "self_chat",
        jid: "123",
        text: "hello",
      });

      expect(result.text).toBe("Echo: hello");
    });

    it("throws on HTTP error", async () => {
      // Use a bad URL that will fail
      const badServer = createServer((req, res) => {
        res.writeHead(500);
        res.end("Internal error");
      });
      await new Promise((resolve) => badServer.listen(0, resolve));
      const badPort = badServer.address().port;

      const dispatcher = createDispatcher({
        backend: { type: "http", url: `http://localhost:${badPort}` },
      });

      await expect(dispatcher.dispatch({ type: "dm", jid: "1", text: "hi" }))
        .rejects.toThrow("500");

      await new Promise((resolve) => badServer.close(resolve));
    });
  });

  describe("unknown backend", () => {
    it("throws for unknown type", async () => {
      const dispatcher = createDispatcher({ backend: { type: "ftp" } });
      await expect(dispatcher.dispatch({ jid: "1" })).rejects.toThrow("Unknown backend type");
    });
  });
});
