import { describe, it, expect } from "vitest";
import { validateAdapter, RequiredMethods, OptionalMethods, AdapterMethods } from "../src/adapter.js";

describe("adapter", () => {
  describe("validateAdapter", () => {
    it("passes with all required methods", () => {
      const adapter = {};
      for (const m of RequiredMethods) adapter[m] = () => {};
      expect(() => validateAdapter(adapter)).not.toThrow();
    });

    it("throws listing missing methods", () => {
      const adapter = { sendText: () => {} };
      expect(() => validateAdapter(adapter)).toThrow("missing required methods");
      expect(() => validateAdapter(adapter)).toThrow("sendImage");
    });

    it("throws for empty object", () => {
      expect(() => validateAdapter({})).toThrow("missing required methods");
    });

    it("ignores optional methods", () => {
      const adapter = {};
      for (const m of RequiredMethods) adapter[m] = () => {};
      // No optional methods — should still pass
      expect(() => validateAdapter(adapter)).not.toThrow();
    });

    it("returns the adapter on success", () => {
      const adapter = {};
      for (const m of RequiredMethods) adapter[m] = () => {};
      expect(validateAdapter(adapter)).toBe(adapter);
    });
  });

  describe("method lists", () => {
    it("RequiredMethods has 8 methods", () => {
      expect(RequiredMethods).toHaveLength(8);
    });

    it("AdapterMethods is RequiredMethods + OptionalMethods", () => {
      expect(AdapterMethods).toEqual([...RequiredMethods, ...OptionalMethods]);
    });

    it("RequiredMethods includes sendText and getChats", () => {
      expect(RequiredMethods).toContain("sendText");
      expect(RequiredMethods).toContain("getChats");
    });
  });
});
