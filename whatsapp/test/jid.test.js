import { describe, it, expect } from "vitest";
import { toJid, jidToPhone, isGroupJid } from "../src/utils/jid.js";

describe("jid utilities", () => {
  describe("toJid", () => {
    it("converts phone number to JID", () => {
      expect(toJid("60123456789")).toBe("60123456789@s.whatsapp.net");
    });

    it("passes through existing JID", () => {
      expect(toJid("60123456789@s.whatsapp.net")).toBe("60123456789@s.whatsapp.net");
    });

    it("passes through group JID", () => {
      expect(toJid("120363xxx@g.us")).toBe("120363xxx@g.us");
    });

    it("strips non-digit chars from phone", () => {
      expect(toJid("+60-123-456-789")).toBe("60123456789@s.whatsapp.net");
    });

    it("throws for empty input", () => {
      expect(() => toJid("")).toThrow();
    });

    it("throws for null", () => {
      expect(() => toJid(null)).toThrow();
    });
  });

  describe("jidToPhone", () => {
    it("extracts phone from JID", () => {
      expect(jidToPhone("60123456789@s.whatsapp.net")).toBe("60123456789");
    });

    it("extracts from group JID", () => {
      expect(jidToPhone("120363xxx@g.us")).toBe("120363xxx");
    });

    it("returns empty string for null", () => {
      expect(jidToPhone(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
      expect(jidToPhone(undefined)).toBe("");
    });
  });

  describe("isGroupJid", () => {
    it("returns true for group JID", () => {
      expect(isGroupJid("120363xxx@g.us")).toBe(true);
    });

    it("returns false for individual JID", () => {
      expect(isGroupJid("60123456789@s.whatsapp.net")).toBe(false);
    });

    it("returns false for null", () => {
      expect(isGroupJid(null)).toBe(false);
    });

    it("returns false for LID JID", () => {
      expect(isGroupJid("29257334054961@lid")).toBe(false);
    });
  });
});
