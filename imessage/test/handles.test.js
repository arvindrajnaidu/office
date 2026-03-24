import { describe, it, expect } from "vitest";
import { isGroupChat, normalizeHandle, formatHandle, extractHandle } from "../src/utils/handles.js";

describe("handle utilities", () => {
  describe("isGroupChat", () => {
    it("returns true for chat-prefixed ID", () => {
      expect(isGroupChat("chat123456789")).toBe(true);
    });

    it("returns true for comma-separated participants", () => {
      expect(isGroupChat("+14155551234,+14155555678")).toBe(true);
    });

    it("returns false for DM chat identifier", () => {
      expect(isGroupChat("iMessage;-;+14155551234")).toBe(false);
    });

    it("returns false for plain phone number", () => {
      expect(isGroupChat("+14155551234")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isGroupChat(null)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isGroupChat("")).toBe(false);
    });
  });

  describe("normalizeHandle", () => {
    it("strips whitespace and formatting from phone", () => {
      expect(normalizeHandle("+1 (415) 555-1234")).toBe("+14155551234");
    });

    it("preserves email addresses", () => {
      expect(normalizeHandle("user@example.com")).toBe("user@example.com");
    });

    it("returns empty for null", () => {
      expect(normalizeHandle(null)).toBe("");
    });
  });

  describe("extractHandle", () => {
    it("extracts phone from iMessage chat ID", () => {
      expect(extractHandle("iMessage;-;+14155551234")).toBe("+14155551234");
    });

    it("extracts email from iMessage chat ID", () => {
      expect(extractHandle("iMessage;-;user@example.com")).toBe("user@example.com");
    });

    it("extracts from SMS chat ID", () => {
      expect(extractHandle("SMS;-;+14155551234")).toBe("+14155551234");
    });

    it("returns raw value if no semicolons", () => {
      expect(extractHandle("+14155551234")).toBe("+14155551234");
    });

    it("returns empty for null", () => {
      expect(extractHandle(null)).toBe("");
    });
  });

  describe("formatHandle", () => {
    it("returns handle as-is", () => {
      expect(formatHandle("+14155551234")).toBe("+14155551234");
    });

    it("returns Unknown for null", () => {
      expect(formatHandle(null)).toBe("Unknown");
    });
  });
});
